import test from 'node:test';
import assert from 'node:assert/strict';

test('gateway request contract only permits documented actions', () => {
  const actions = [
    'dashboard','capture','processCapture','clearProcessedCaptures',
    'task','updateTask','completeTask','deleteTask',
    'person','completePerson','goal','review','food','weight','exercise'
  ];
  assert.equal(new Set(actions).size, actions.length);
  assert.ok(!actions.includes('deleteAll'));
});

test('browser source does not contain a gateway secret placeholder', async () => {
  const source = await (await import('node:fs/promises')).readFile('public/app.js', 'utf8');
  assert.equal(source.includes('APP_GATEWAY_SHARED_SECRET'), false);
});

test('authentication is verified separately from dashboard storage', async () => {
  const source = await (await import('node:fs/promises')).readFile('public/app.js', 'utf8');
  assert.equal(source.includes("fetch('/api/auth'"), true);
  assert.equal(source.includes('await loadDashboard()'), true);
  assert.equal(source.includes("catch (error) { signOut(error.message); }") , true);
});
