import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { db, loadWorkspace, restoreWorkspace } from './store.mjs';
import { decrypt, env, encrypt, proof } from './http.mjs';
import { normalizeWorkspace } from './workspace.mjs';

const scope = ['openid', 'email', 'https://www.googleapis.com/auth/drive.appdata'];
const client = () => new OAuth2Client(env('GOOGLE_CLIENT_ID'), env('GOOGLE_CLIENT_SECRET'), env('GOOGLE_OAUTH_REDIRECT_URI'));
const digest = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
export const backupEnvelope = (sub, revision, data) => ({ format: 'purpose-driven-workspace', schemaVersion: 2, ownerSub: sub, revision, createdAt: new Date().toISOString(), checksum: digest(data), data });
export function verifyEnvelope(envelope, sub) {
  if (envelope?.format !== 'purpose-driven-workspace' || envelope.schemaVersion !== 2 || envelope.ownerSub !== sub || !Number.isSafeInteger(envelope.revision) || envelope.revision < 0 || !envelope.data || envelope.checksum !== digest(envelope.data)) throw Error('Drive backup failed integrity or compatibility checks');
  return normalizeWorkspace(envelope.data);
}
export function authorizationUrl(state) { return client().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope, state, include_granted_scopes: true }); }
export async function connectWithCode(sub, code) {
  const oauth = client();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token || !(tokens.scope || '').split(' ').includes(scope[2])) throw Error('Google did not grant Drive access');
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env('GOOGLE_CLIENT_ID') });
  const user = ticket.getPayload();
  if (user?.sub !== sub || !user.email_verified) throw Error('Drive account differs from signed-in account');
  const existing = await db().sql`SELECT refresh_token_ciphertext FROM purpose_drive_connections WHERE owner_sub = ${sub}`;
  const refresh = tokens.refresh_token || (existing[0] && decrypt(existing[0].refresh_token_ciphertext));
  if (!refresh) throw Error('Google did not return offline authorization. Reconnect and grant access.');
  const encrypted = encrypt(refresh);
  await db().sql`INSERT INTO purpose_drive_connections (owner_sub, email, refresh_token_ciphertext) VALUES (${sub}, ${user.email}, ${encrypted}) ON CONFLICT (owner_sub) DO UPDATE SET email = EXCLUDED.email, refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, connected_at = now()`;
  return user.email;
}
export async function connection(sub) { const rows = await db().sql`SELECT email, refresh_token_ciphertext, connected_at FROM purpose_drive_connections WHERE owner_sub = ${sub}`; return rows[0] || null; }
export async function disconnect(sub) {
  const row = await connection(sub);
  if (row) { try { await client().revokeToken(decrypt(row.refresh_token_ciphertext)); } catch (error) { console.error('Google token revocation failed:', error.message); } }
  await db().sql`DELETE FROM purpose_drive_connections WHERE owner_sub = ${sub}`;
}
async function accessToken(row) { const oauth = client(); oauth.setCredentials({ refresh_token: decrypt(row.refresh_token_ciphertext) }); const result = await oauth.getAccessToken(); if (!result.token) throw Error('Drive authorization expired'); return result.token; }
async function gateway(user, action, payload = {}) {
  const row = await connection(user.sub); if (!row) throw Error('Connect Google Drive first');
  if (!env('APPS_SCRIPT_URL') || !env('APP_GATEWAY_SHARED_SECRET')) throw Error('Drive gateway is not configured');
  const token = await accessToken(row);
  const response = await fetch(env('APPS_SCRIPT_URL'), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ proof: proof(user), token, action, payload }) });
  const body = await response.json();
  if (!response.ok || !body.ok) throw Error(body.error || 'Drive gateway request failed');
  return body;
}
export async function listBackups(user) {
  const listing = await gateway(user, 'list');
  return (listing.files || []).sort((a, b) => b.revision - a.revision || String(b.createdTime).localeCompare(String(a.createdTime)));
}
export async function latestBackup(user) { return (await listBackups(user))[0] || null; }
export async function readBackup(user, fileId) { const body = await gateway(user, 'read', { id: fileId }); const data = verifyEnvelope(body.backup, user.sub); return { data, revision: body.backup.revision, checksum: body.backup.checksum }; }
export async function syncWorkspace(user) {
  const local = await loadWorkspace(user.sub, true);
  const files = await listBackups(user);
  const latest = files[0] || null;
  if (latest) {
    const siblings = files.filter(file => file.revision === latest.revision);
    if (siblings.length > 1) {
      const checksums = await Promise.all(siblings.map(async file => (await readBackup(user, file.id)).checksum));
      if (new Set(checksums).size > 1) return { status: 'conflict', latest, message: 'Drive contains different backups at the same revision. Review before restoring.' };
    }
    if (latest.revision > local.revision) return { status: 'restoreRequired', latest, message: 'Drive has a newer backup. Review it before restoring.' };
    if (latest.revision === local.revision) {
      const remote = await readBackup(user, latest.id);
      if (remote.checksum !== digest(local.data)) return { status: 'conflict', latest, message: 'Drive and this workspace differ at the same revision.' };
      const updated = await db().sql`UPDATE purpose_workspaces SET last_sync_at = now(), last_sync_revision = ${local.revision}, sync_error = NULL WHERE owner_sub = ${user.sub} AND revision = ${local.revision} RETURNING revision`;
      return updated.length ? { status: 'synced', latest } : { status: 'pending', latest, message: 'New changes are pending a Drive sync.' };
    }
  }
  const backup = backupEnvelope(user.sub, local.revision, local.data);
  const result = await gateway(user, 'write', { backup });
  const updated = await db().sql`UPDATE purpose_workspaces SET last_sync_at = now(), last_sync_revision = ${local.revision}, sync_error = NULL WHERE owner_sub = ${user.sub} AND revision = ${local.revision} RETURNING revision`;
  return updated.length ? { status: 'synced', latest: result.file } : { status: 'pending', latest: result.file, message: 'New changes are pending a Drive sync.' };
}
export async function restoreBackup(user, fileId, expectedRevision) {
  const { data, revision } = await readBackup(user, fileId);
  return restoreWorkspace(user.sub, data, expectedRevision, revision);
}
