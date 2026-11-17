import { allowedOrigin, json, session } from '../lib/http.mjs';
import { loadWorkspace, mutateWorkspace } from '../lib/store.mjs';

const actions = new Set(['capture', 'processCapture', 'clearProcessedCaptures', 'task', 'updateTask', 'completeTask', 'deleteTask', 'person', 'completePerson', 'goal', 'updateGoal', 'deleteGoal', 'review', 'food', 'weight', 'exercise', 'direction', 'updateDirection', 'deleteDirection', 'habit', 'updateHabit', 'completeHabit', 'deleteHabit', 'identity', 'updateIdentity', 'deleteIdentity', 'personalEntry', 'updatePersonalEntry', 'deletePersonalEntry', 'dashboardLayout', 'pin', 'unpin']);
export default async request => {
  if (request.method !== 'POST') return json(405, { error: 'POST required' });
  if (!allowedOrigin(request)) return json(403, { error: 'Origin is not allowed' });
  const user = session(request); if (!user) return json(401, { error: 'Sign in required' });
  try {
    const { action, payload = {}, expectedRevision } = await request.json();
    if (action !== 'dashboard' && !actions.has(action)) return json(400, { error: 'Invalid action' });
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { error: 'Invalid payload' });
    if (action !== 'dashboard' && !Number.isSafeInteger(expectedRevision)) return json(400, { error: 'Workspace revision required' });
    const result = action === 'dashboard' ? await loadWorkspace(user.sub) : await mutateWorkspace(user.sub, action, payload, expectedRevision);
    return json(200, { ok: true, ...result, user: { email: user.email } });
  } catch (error) { console.error('Workspace request failed:', error); const conflict = error.message === 'Workspace changed on another device. Refresh before saving.'; return json(conflict ? 409 : error.message === 'Record not found' ? 404 : 503, { error: conflict || error.message === 'Record not found' ? error.message : 'Workspace is temporarily unavailable' }); }
};
