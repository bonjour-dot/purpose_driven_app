import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import auth from '../netlify/functions/auth.mjs';
import data from '../netlify/functions/data.mjs';
import { cookie, sign, verify, encrypt, decrypt } from '../netlify/lib/http.mjs';
import { applyAction, emptyWorkspace, normalizeWorkspace, publicWorkspace } from '../netlify/lib/workspace.mjs';
import { backupEnvelope, verifyEnvelope } from '../netlify/lib/drive.mjs';

test('signed app sessions restore and reject tampering or expiry', async () => {
  process.env.APP_SESSION_SECRET = 'test-session-secret-with-sufficient-length';
  const value = sign({ sub: 'google-sub-1', email: 'a@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.APP_SESSION_SECRET);
  const request = new Request('https://example.com/api/auth', { headers: { cookie: cookie('__Host-pd_session', value, 3600) } });
  const response = await auth(request);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { email: 'a@example.com' });
  assert.equal(verify(value.slice(0, -1) + 'x', process.env.APP_SESSION_SECRET), null);
  assert.equal(verify(sign({ sub: 'x', exp: 1 }, process.env.APP_SESSION_SECRET), process.env.APP_SESSION_SECRET), null);
  const logout = await auth(new Request('https://example.com/api/auth', { method: 'DELETE' }));
  assert.equal(logout.headers.get('set-cookie').includes('Max-Age=0'), true);
});

test('workspace API rejects unauthenticated writes', async () => {
  const response = await data(new Request('https://example.com/api/data', { method: 'POST', body: JSON.stringify({ action: 'task', payload: { title: 'private' } }) }));
  assert.equal(response.status, 401);
});

test('refresh tokens are authenticated-encrypted', () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  const token = 'refresh-token-private'; const encrypted = encrypt(token);
  assert.ok(!encrypted.includes(token)); assert.equal(decrypt(encrypted), token);
  assert.throws(() => decrypt(encrypted.slice(0, -2) + 'xx'));
});

test('old workspace collections survive version 2 normalization and mutations', () => {
  const old = { tasks: [{ id: 'old-task', title: 'Keep this', done: false }], health: [{ id: 'old-meal', kind: 'food', calories: 400 }], captures: [{ id: 'old-capture', text: 'An idea' }] };
  const data = normalizeWorkspace(old);
  assert.equal(data.dashboard.preset, 'balanced');
  const updated = applyAction(data, 'direction', { kind: 'purpose', title: 'My purpose', body: 'Live well' });
  assert.deepEqual(updated.tasks, old.tasks); assert.deepEqual(updated.health, old.health); assert.deepEqual(updated.captures, old.captures);
  assert.equal(updated.direction.length, 1);
});

test('dashboard pinning, layout and habit history preserve underlying records', () => {
  let data = emptyWorkspace();
  data = applyAction(data, 'habit', { title: 'Walk', frequency: 'daily' });
  const id = data.habits[0].id;
  data = applyAction(data, 'pin', { collection: 'habits', id });
  data = applyAction(data, 'completeHabit', { id, date: '2026-11-17' });
  data = applyAction(data, 'dashboardLayout', { preset: 'custom', widgets: [{ type: 'habits', size: 'compact', visible: false }] });
  assert.deepEqual(data.habits[0].completions, ['2026-11-17']);
  assert.equal(data.dashboard.widgets[0].visible, false);
  data = applyAction(data, 'unpin', { collection: 'habits', id });
  assert.equal(data.habits.length, 1);
  assert.equal(data.dashboard.pins.length, 0);
});

test('backup integrity and account isolation fail closed', () => {
  const backup = backupEnvelope('owner-1', 5, emptyWorkspace());
  assert.equal(verifyEnvelope(backup, 'owner-1').schemaVersion, 2);
  assert.throws(() => verifyEnvelope(backup, 'owner-2'));
  backup.data.tasks.push({ id: 'changed', title: 'Tampered' });
  assert.throws(() => verifyEnvelope(backup, 'owner-1'));
});

test('legacy deletion hides entries without erasing them from raw history', () => {
  const data = applyAction({ tasks: [{ id: 'task-to-delete', title: 'Original' }] }, 'deleteTask', { id: 'task-to-delete' });
  assert.equal(data.tasks.length, 1); assert.equal(publicWorkspace(data).tasks.length, 0);
});

test('gateway no longer accesses a developer-owned Sheet or Drive', async () => {
  const source = await fs.readFile('apps-script/Code.gs', 'utf8');
  assert.equal(/SpreadsheetApp|DriveApp|DocumentApp/.test(source), false);
  assert.equal(source.includes("parents:['appDataFolder']"), true);
  const browser = await fs.readFile('public/app.js', 'utf8');
  assert.equal(/APP_GATEWAY_SHARED_SECRET|GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY/.test(browser), false);
});
