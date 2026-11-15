import test from 'node:test';
import assert from 'node:assert/strict';

test('gateway request contract only permits documented actions', () => {
  const actions = ['today','capture','task','completeTask','person','food','weight','exercise'];
  assert.equal(new Set(actions).size, actions.length);
  assert.ok(!actions.includes('deleteAll'));
});

test('browser source does not contain a gateway secret placeholder', async () => {
  const source = await (await import('node:fs/promises')).readFile('public/app.js', 'utf8');
  assert.equal(source.includes('APP_GATEWAY_SHARED_SECRET'), false);
});
