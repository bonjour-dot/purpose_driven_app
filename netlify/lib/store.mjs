import { getDatabase } from '@netlify/database';
import { applyAction, emptyWorkspace, normalizeWorkspace, publicWorkspace } from './workspace.mjs';

let database;
export const db = () => database ||= getDatabase();
export async function loadWorkspace(sub, raw = false) {
  await db().sql`INSERT INTO purpose_workspaces (owner_sub, data) VALUES (${sub}, ${emptyWorkspace()}) ON CONFLICT DO NOTHING`;
  const rows = await db().sql`SELECT data, revision, last_sync_at, sync_error FROM purpose_workspaces WHERE owner_sub = ${sub}`;
  const row = rows[0];
  return { data: raw ? normalizeWorkspace(row?.data) : publicWorkspace(row?.data || emptyWorkspace()), revision: Number(row?.revision || 0), lastSync: row?.last_sync_at || null, syncError: row?.sync_error || null };
}
export async function mutateWorkspace(sub, action, payload, expectedRevision) {
  const client = await db().pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO purpose_workspaces (owner_sub) VALUES ($1) ON CONFLICT DO NOTHING', [sub]);
    const { rows: [row] } = await client.query('SELECT data, revision FROM purpose_workspaces WHERE owner_sub = $1 FOR UPDATE', [sub]);
    if (Number(row.revision) !== expectedRevision) throw Error('Workspace changed on another device. Refresh before saving.');
    const current = normalizeWorkspace(row.data);
    const data = applyAction(current, action, payload);
    const revision = Number(row.revision) + 1;
    await client.query('INSERT INTO purpose_workspace_history (owner_sub, revision, data) VALUES ($1, $2, $3)', [sub, row.revision, current]);
    await client.query('UPDATE purpose_workspaces SET data = $2, revision = $3, updated_at = now(), sync_error = NULL WHERE owner_sub = $1', [sub, data, revision]);
    await client.query('COMMIT');
    return { data: publicWorkspace(data), revision };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function restoreWorkspace(sub, data, expectedRevision, backupRevision) {
  const client = await db().pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO purpose_workspaces (owner_sub) VALUES ($1) ON CONFLICT DO NOTHING', [sub]);
    const { rows: [row] } = await client.query('SELECT data, revision FROM purpose_workspaces WHERE owner_sub = $1 FOR UPDATE', [sub]);
    if (Number(row.revision) !== expectedRevision) throw Error('Workspace changed. Refresh before restoring.');
    await client.query('INSERT INTO purpose_workspace_history (owner_sub, revision, data) VALUES ($1, $2, $3)', [sub, row.revision, row.data]);
    const revision = Math.max(Number(row.revision), backupRevision) + 1;
    await client.query('UPDATE purpose_workspaces SET data = $2, revision = $3, updated_at = now(), sync_error = NULL WHERE owner_sub = $1', [sub, normalizeWorkspace(data), revision]);
    await client.query('COMMIT');
    return { data: publicWorkspace(data), revision };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
