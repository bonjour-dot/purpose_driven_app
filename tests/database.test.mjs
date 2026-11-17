import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NetlifyDB } from '@netlify/database-dev';
import { loadWorkspace, mutateWorkspace, restoreWorkspace, db } from '../netlify/lib/store.mjs';
import dataFunction from '../netlify/functions/data.mjs';
import { cookie, sign } from '../netlify/lib/http.mjs';

test('migration and per-account persistence keep revision history and reject stale writes', async () => {
  const local = new NetlifyDB();
  process.env.NETLIFY_DB_URL = await local.start();
  try {
    await local.applyMigrations('./netlify/database/migrations');
    const owner = 'test-owner-' + crypto.randomUUID();
    const other = 'test-other-' + crypto.randomUUID();
    const initial = await loadWorkspace(owner);
    assert.equal(initial.revision, 0);
    const saved = await mutateWorkspace(owner, 'task', { title: 'Keep my task' }, 0);
    assert.equal(saved.revision, 1);
    assert.equal((await loadWorkspace(owner)).data.tasks[0].title, 'Keep my task');
    assert.equal((await loadWorkspace(other)).data.tasks.length, 0);
    process.env.APP_SESSION_SECRET = 'database-test-session-secret';
    const session = cookie('__Host-pd_session', sign({ sub: owner, email: 'owner@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.APP_SESSION_SECRET), 3600);
    const response = await dataFunction(new Request('https://example.com/api/data', { method: 'POST', headers: { cookie: session }, body: JSON.stringify({ action: 'dashboard' }) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.tasks[0].title, 'Keep my task');
    await assert.rejects(mutateWorkspace(owner, 'task', { title: 'Stale' }, 0), /Workspace changed/);
    const history = await db().sql`SELECT data FROM purpose_workspace_history WHERE owner_sub = ${owner} AND revision = 0`;
    assert.equal(history.length, 1);
    const restored = await restoreWorkspace(owner, initial.data, 1, 0);
    assert.equal(restored.revision, 2);
    assert.equal((await loadWorkspace(owner)).data.tasks.length, 0);
    const beforeRestore = await db().sql`SELECT data FROM purpose_workspace_history WHERE owner_sub = ${owner} AND revision = 1`;
    assert.equal(beforeRestore[0].data.tasks[0].title, 'Keep my task');
  } finally { await db().pool.end(); await local.stop(); }
});
