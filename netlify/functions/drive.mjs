import crypto from 'node:crypto';
import { allowedOrigin, cookie, env, json, readCookie, session } from '../lib/http.mjs';
import { authorizationUrl, connectWithCode, connection, disconnect, latestBackup, restoreBackup, syncWorkspace } from '../lib/drive.mjs';
import { db, loadWorkspace } from '../lib/store.mjs';

const redirect = (location, extra = {}) => new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...extra } });
export default async request => {
  const url = new URL(request.url);
  const user = session(request);
  const callback = url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.get('action') === 'callback';
  if (!user) return request.method === 'GET' && callback ? redirect('/?drive=sign-in-required') : json(401, { error: 'Sign in required' });
  if (!env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET') || !env('GOOGLE_OAUTH_REDIRECT_URI')) return json(503, { error: 'Google Drive is not configured' });
  if (request.method === 'GET') {
    const action = callback ? 'callback' : url.searchParams.get('action') || 'status';
    if (action === 'connect') {
      const state = crypto.randomBytes(32).toString('base64url');
      return redirect(authorizationUrl(state), { 'Set-Cookie': cookie('__Host-pd_drive_state', state, 600) });
    }
    if (action === 'callback') {
      const clear = cookie('__Host-pd_drive_state', '', 0);
      if (url.searchParams.get('error')) return redirect('/?drive=denied', { 'Set-Cookie': clear });
      const state = url.searchParams.get('state');
      if (!state || state !== readCookie(request, '__Host-pd_drive_state') || !url.searchParams.get('code')) return redirect('/?drive=invalid-state', { 'Set-Cookie': clear });
      try { await connectWithCode(user.sub, url.searchParams.get('code')); return redirect('/?drive=connected', { 'Set-Cookie': clear }); }
      catch (error) { console.error('Drive connection failed:', error); return redirect('/?drive=connection-error', { 'Set-Cookie': clear }); }
    }
    if (action === 'status') {
      try { const row = await connection(user.sub), workspace = await loadWorkspace(user.sub); return json(200, { connected: !!row, email: row?.email || null, lastSync: workspace.lastSync, syncError: workspace.syncError, revision: workspace.revision }); }
      catch { return json(503, { error: 'Drive status is unavailable' }); }
    }
    return json(400, { error: 'Invalid action' });
  }
  if (request.method !== 'POST' || !allowedOrigin(request)) return json(403, { error: 'Request is not allowed' });
  let action = '';
  try {
    const body = await request.json();
    action = body.action;
    const { fileId, expectedRevision } = body;
    if (action === 'disconnect') { await disconnect(user.sub); return json(200, { status: 'disconnected' }); }
    if (action === 'sync') return json(200, await syncWorkspace(user));
    if (action === 'latest') return json(200, { latest: await latestBackup(user) });
    if (action === 'restore') {
      if (typeof fileId !== 'string' || !Number.isSafeInteger(expectedRevision)) return json(400, { error: 'Invalid restore request' });
      return json(200, await restoreBackup(user, fileId, expectedRevision));
    }
    return json(400, { error: 'Invalid action' });
  } catch (error) {
    console.error('Drive request failed:', error);
    const message = error.message === 'Drive authorization expired' ? 'Drive authorization expired. Reconnect Google Drive.' : /^(Connect Google Drive first|Drive backup failed integrity|Workspace changed)/.test(error.message) ? error.message : 'Google Drive request failed. Try again or reconnect.';
    if (action === 'sync') { try { await db().sql`UPDATE purpose_workspaces SET sync_error = ${message} WHERE owner_sub = ${user.sub}`; } catch {} }
    return json(503, { error: message });
  }
};
