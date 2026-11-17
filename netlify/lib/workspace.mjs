import crypto from 'node:crypto';

export const balancedWidgets = ['focus', 'vision', 'goals', 'tasks', 'capture', 'habits', 'priorities'];
export const focusedWidgets = ['focus', 'tasks', 'capture', 'priorities'];
export const widgetTypes = ['focus', 'capture', 'tasks', 'purpose', 'mission', 'vision', 'goals', 'habits', 'priorities', 'food', 'weight', 'exercise', 'progress', 'schedule', 'overdue', 'people'];
const collections = ['tasks', 'people', 'captures', 'goals', 'reviews', 'health', 'direction', 'habits', 'identity', 'personalSpace'];
const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const number = (value, min, max, fallback = 0) => { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; };
const list = (value, max = 20) => Array.isArray(value) ? value.map(x => text(x, 240)).filter(Boolean).slice(0, max) : [];
const find = (items, value) => items.find(item => item.id === value && !item.deleted);

export function emptyWorkspace() {
  return { schemaVersion: 2, tasks: [], people: [], captures: [], goals: [], reviews: [], health: [], direction: [], habits: [], identity: [], personalSpace: [], dashboard: { preset: 'balanced', widgets: balancedWidgets.map((type, order) => ({ id: type, type, order, size: 'half', visible: true })), pins: [] } };
}

export function normalizeWorkspace(input) {
  const output = { ...emptyWorkspace(), ...(input && typeof input === 'object' ? input : {}) };
  for (const key of collections) output[key] = Array.isArray(output[key]) ? output[key] : [];
  const dashboard = output.dashboard && typeof output.dashboard === 'object' ? output.dashboard : {};
  output.dashboard = { preset: dashboard.preset || 'balanced', widgets: Array.isArray(dashboard.widgets) ? dashboard.widgets : emptyWorkspace().dashboard.widgets, pins: Array.isArray(dashboard.pins) ? dashboard.pins : [] };
  output.schemaVersion = 2;
  return output;
}

export function applyAction(source, action, p = {}) {
  const data = structuredClone(normalizeWorkspace(source));
  const add = (key, value) => data[key].push({ id: id(), createdAt: now(), ...value });
  const update = (key, patch) => { const item = find(data[key], p.id); if (!item) throw Error('Record not found'); Object.assign(item, patch, { updatedAt: now() }); return item; };
  switch (action) {
    case 'capture': {
      const value = text(p.text, 5000); if (!value) throw Error('Empty capture');
      const destination = ['inbox', 'task', 'person', 'journal'].includes(p.destination) ? p.destination : 'inbox';
      add('captures', { text: value, categories: list(p.categories, 12), journal: !!p.journal, destination, due: date(p.due), processed: destination !== 'inbox' });
      if (destination === 'task') add('tasks', { title: value, due: date(p.due), domain: list(p.categories, 12)[0] || 'Personal', priority: 'normal', done: false });
      if (destination === 'person') add('people', { name: value, note: 'Captured follow-up', due: date(p.due), completed: false });
      if (destination === 'journal' || p.journal) add('personalSpace', { title: 'Journal entry', body: value, kind: 'journal' });
      break;
    }
    case 'processCapture': {
      const item = find(data.captures, p.id); if (!item || item.processed) throw Error('Capture not found');
      const destination = ['task', 'person', 'journal'].includes(p.destination) ? p.destination : 'task';
      if (destination === 'task') add('tasks', { title: item.text, due: item.due || '', domain: item.categories?.[0] || 'Personal', priority: 'normal', done: false });
      if (destination === 'person') add('people', { name: item.text, note: 'Captured follow-up', due: item.due || '', completed: false });
      if (destination === 'journal') add('personalSpace', { title: 'Journal entry', body: item.text, kind: 'journal' });
      item.processed = true; item.processedAt = now(); item.processedAs = destination;
      break;
    }
    case 'clearProcessedCaptures': data.captures = data.captures.filter(item => !item.processed); break;
    case 'task': {
      const title = text(p.title, 240); if (!title) throw Error('Task required');
      add('tasks', { title, due: date(p.due), time: text(p.time, 5), priority: ['high', 'normal', 'low'].includes(p.priority) ? p.priority : 'normal', domain: text(p.domain, 80) || 'Personal', notes: text(p.notes, 2000), done: false }); break;
    }
    case 'updateTask': update('tasks', { title: text(p.title, 240), due: date(p.due), time: text(p.time, 5), priority: ['high', 'normal', 'low'].includes(p.priority) ? p.priority : 'normal', domain: text(p.domain, 80) || 'Personal', notes: text(p.notes, 2000) }); break;
    case 'completeTask': update('tasks', { done: !!p.done, completedAt: p.done ? now() : '' }); break;
    case 'deleteTask': update('tasks', { deleted: true, deletedAt: now() }); break;
    case 'person': { const name = text(p.name, 240); if (!name) throw Error('Name required'); add('people', { name, note: text(p.note, 1000), due: date(p.due), time: text(p.time, 5), completed: false }); break; }
    case 'completePerson': update('people', { completed: true, completedAt: now() }); break;
    case 'goal': { const title = text(p.title, 240); if (!title) throw Error('Goal required'); add('goals', { title, description: text(p.description), category: text(p.category, 80), targetDate: date(p.targetDate), progress: number(p.progress, 0, 100), milestones: list(p.milestones), status: text(p.status, 32) || 'Active', actionIds: list(p.actionIds) }); break; }
    case 'updateGoal': update('goals', { title: text(p.title, 240), description: text(p.description), category: text(p.category, 80), targetDate: date(p.targetDate), progress: number(p.progress, 0, 100), milestones: list(p.milestones), status: text(p.status, 32) || 'Active', actionIds: list(p.actionIds) }); break;
    case 'deleteGoal': update('goals', { deleted: true }); break;
    case 'review': { const day = date(p.date) || new Date().toISOString().slice(0, 10); const item = data.reviews.find(x => x.date === day); const value = { date: day, morning: text(p.morning, 2000), evening: text(p.evening), energy: number(p.energy, 1, 5, 3), updatedAt: now() }; if (item) Object.assign(item, value); else add('reviews', value); break; }
    case 'food': { const value = text(p.text, 500); if (!value) throw Error('Food required'); add('health', { kind: 'food', date: date(p.date) || new Date().toISOString().slice(0, 10), slot: text(p.slot, 40), text: value, label: `Food: ${value}`, serving: text(p.serving, 120), quantity: number(p.quantity, .1, 100, 1), calories: number(p.calories, 0, 10000), protein: number(p.protein, 0, 1000), carbs: number(p.carbs, 0, 2000), fat: number(p.fat, 0, 1000) }); break; }
    case 'weight': { const value = number(p.value, .1, 1000); if (!value) throw Error('Invalid weight'); add('health', { kind: 'weight', date: date(p.date) || new Date().toISOString().slice(0, 10), value, unit: p.unit === 'lb' ? 'lb' : 'kg', goal: number(p.goal, 1, 1000, 105), waist: number(p.waist, 0, 1000), note: text(p.note, 500), label: `Weight: ${value} ${p.unit === 'lb' ? 'lb' : 'kg'}` }); break; }
    case 'exercise': { const value = text(p.text, 500), minutes = number(p.minutes, 0, 1440); if (!value && !minutes) throw Error('Exercise required'); add('health', { kind: 'exercise', date: date(p.date) || new Date().toISOString().slice(0, 10), text: value, minutes, distance: number(p.distance, 0, 1000), calories: number(p.calories, 0, 10000), source: text(p.source, 40), hrAvg: number(p.hrAvg, 0, 300), hrMax: number(p.hrMax, 0, 300), steps: number(p.steps, 0, 200000), note: text(p.note, 1000), label: `Exercise: ${value || `${minutes} min`}` }); break; }
    case 'direction': { const kind = text(p.kind, 24); if (!['purpose', 'mission', 'vision'].includes(kind)) throw Error('Invalid direction type'); add('direction', { kind, title: text(p.title, 240), body: text(p.body, 8000) }); break; }
    case 'updateDirection': update('direction', { title: text(p.title, 240), body: text(p.body, 8000) }); break;
    case 'deleteDirection': update('direction', { deleted: true }); break;
    case 'habit': { const title = text(p.title, 240); if (!title) throw Error('Habit required'); add('habits', { title, frequency: p.frequency === 'weekly' ? 'weekly' : 'daily', goalId: text(p.goalId, 80), completions: [] }); break; }
    case 'updateHabit': update('habits', { title: text(p.title, 240), frequency: p.frequency === 'weekly' ? 'weekly' : 'daily', goalId: text(p.goalId, 80) }); break;
    case 'completeHabit': { const item = find(data.habits, p.id); if (!item) throw Error('Habit not found'); const day = date(p.date) || new Date().toISOString().slice(0, 10); item.completions ||= []; item.completions = item.completions.includes(day) ? item.completions.filter(x => x !== day) : [...item.completions, day]; item.updatedAt = now(); break; }
    case 'deleteHabit': update('habits', { deleted: true }); break;
    case 'identity': { const kind = text(p.kind, 40); if (!['value', 'strength', 'belief', 'statement', 'futureSelf'].includes(kind)) throw Error('Invalid identity type'); add('identity', { kind, title: text(p.title, 240), body: text(p.body, 4000) }); break; }
    case 'updateIdentity': update('identity', { title: text(p.title, 240), body: text(p.body, 4000) }); break;
    case 'deleteIdentity': update('identity', { deleted: true }); break;
    case 'personalEntry': add('personalSpace', { title: text(p.title, 240), body: text(p.body, 8000), kind: 'note' }); break;
    case 'updatePersonalEntry': update('personalSpace', { title: text(p.title, 240), body: text(p.body, 8000) }); break;
    case 'deletePersonalEntry': update('personalSpace', { deleted: true }); break;
    case 'dashboardLayout': {
      if (!Array.isArray(p.widgets) || p.widgets.length > widgetTypes.length) throw Error('Invalid dashboard layout');
      const seen = new Set();
      data.dashboard.widgets = p.widgets.map((w, order) => { if (!widgetTypes.includes(w.type) || seen.has(w.type)) throw Error('Invalid widget'); seen.add(w.type); return { id: w.type, type: w.type, order, size: ['compact', 'half', 'full'].includes(w.size) ? w.size : 'half', visible: w.visible !== false }; });
      data.dashboard.preset = ['focused', 'balanced', 'custom'].includes(p.preset) ? p.preset : 'custom'; break;
    }
    case 'pin': { const key = text(p.collection, 32); if (!['direction', 'goals', 'habits'].includes(key) || !find(data[key], p.id)) throw Error('Entry not found'); const pins = data.dashboard.pins; if (!pins.some(x => x.collection === key && x.id === p.id)) pins.push({ collection: key, id: p.id }); break; }
    case 'unpin': data.dashboard.pins = data.dashboard.pins.filter(x => !(x.collection === p.collection && x.id === p.id)); break;
    default: throw Error('Invalid action');
  }
  return data;
}

export function publicWorkspace(source) {
  const data = normalizeWorkspace(source);
  for (const key of ['tasks', 'people', 'captures', 'goals', 'health', 'direction', 'habits', 'identity', 'personalSpace']) data[key] = data[key].filter(item => !item.deleted && !item.archived);
  return data;
}
