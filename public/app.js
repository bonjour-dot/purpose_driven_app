const $ = selector => document.querySelector(selector);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = amount => { const date = new Date(); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); };
const state = {
  user: null, revision: 0, driveConnected: false, editDashboard: false, activeView: 'today', planFilter: 'today', activeHealth: 'food',
  categories: ['Personal', 'Family', 'Health', 'Work', 'Ideas', 'Journal'], chosen: new Set(),
  data: { tasks: [], people: [], captures: [], goals: [], reviews: [], health: [], direction: [], habits: [], identity: [], personalSpace: [], dashboard: { preset: 'balanced', widgets: [], pins: [] } }
};

const status = message => { $('#status').textContent = message; };
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const isOpen = item => !item.done && !item.completed;
const sortTasks = tasks => [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || ({ high: 0, normal: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, normal: 1, low: 2 }[b.priority] ?? 1) || `${a.due || '9999'}${a.time || ''}`.localeCompare(`${b.due || '9999'}${b.time || ''}`));

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('purpose-driven-theme', theme);
  const day = theme === 'day';
  $('#themeToggle').textContent = day ? '☾' : '☀';
  $('#themeToggle').setAttribute('aria-label', `Switch to ${day ? 'night' : 'day'} mode`);
}
setTheme(localStorage.getItem('purpose-driven-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'));
$('#themeToggle').onclick = () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day');
$('#date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

async function api(action, payload = {}) {
  if (!state.user) throw Error('Please sign in first.');
  const response = await fetch('/api/data', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, expectedRevision: state.revision }) });
  const body = await response.json();
  if (!response.ok) {
    const error = Error(body.error || 'Unable to save.');
    error.status = response.status;
    throw error;
  }
  return body;
}

async function verifyAuthentication(credential) {
  const response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
  const body = await response.json();
  if (!response.ok) { const error = Error(body.error || 'Google sign-in could not be verified'); error.status = response.status; throw error; }
  return body.user;
}

function normalise(data = {}) {
  state.data = { tasks: [], people: [], captures: [], goals: [], reviews: [], health: [], direction: [], habits: [], identity: [], personalSpace: [], dashboard: { preset: 'balanced', widgets: [], pins: [] }, ...data };
}
async function refresh() {
  const result = await api('dashboard');
  normalise(result.data);
  state.revision = result.revision || 0;
  state.user = result.user || state.user;
  render();
}
function showStorageIssue(message) {
  $('#storageMessage').textContent = message;
  $('#storageNotice').hidden = false;
  status('You are signed in. Storage needs configuration before your records can load.');
}
async function loadDashboard() {
  try {
    $('#storageNotice').hidden = true;
    await refresh();
    status('Your workspace is ready.');
    return true;
  } catch (error) {
    if (error.status === 401) { signOutLocal('Your session expired. Please sign in again.'); return false; }
    showStorageIssue(error.message);
    return false;
  }
}
async function save(action, payload, success = 'Saved to your private workspace.') {
  try { status('Saving…'); const result = await api(action, payload); normalise(result.data); state.revision = result.revision; render(); status(success); if (state.driveConnected) syncDrive(false); return true; }
  catch (error) { status(error.message); return false; }
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== view; });
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'capture') setTimeout(() => $('#captureText').focus(), 50);
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view));

function taskLine(task, withEdit = true) {
  const due = task.due ? (task.due === todayISO() ? 'Today' : task.due === addDays(1) ? 'Tomorrow' : task.due) : 'Later';
  const details = [due, task.time, task.domain].filter(Boolean).join(' · ');
  return `<div class="item task-item ${task.done ? 'done' : ''} priority-${escapeHtml(task.priority || 'normal')}"><label><input type="checkbox" data-complete-task="${escapeHtml(task.id)}" ${task.done ? 'checked' : ''}><span class="task-copy"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(details || 'No date')}</small></span></label>${withEdit ? `<button class="edit-button" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit ${escapeHtml(task.title)}">•••</button>` : ''}</div>`;
}
function personLine(person, history = false) {
  const details = [person.note || 'Follow up', person.due || 'sometime soon', person.time].filter(Boolean).join(' · ');
  return `<div class="item person-item ${history ? 'done' : ''}"><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(details)}</small></div>${history ? '' : `<button class="quiet small" data-complete-person="${escapeHtml(person.id)}">Done</button>`}</div>`;
}
function empty(message) { return `<p class="empty">${escapeHtml(message)}</p>`; }

function renderToday() {
  const open = state.data.tasks.filter(isOpen);
  const priorities = sortTasks(open.filter(task => task.due === todayISO() || task.priority === 'high')).slice(0, 5);
  const overdue = sortTasks(open.filter(task => task.due && task.due < todayISO()));
  const scheduled = sortTasks(open.filter(task => task.due === todayISO() && task.time));
  const next = priorities[0] || open[0];
  $('#focusTitle').textContent = next ? next.title : 'Choose a priority to begin.';
  $('#focusMeta').textContent = next ? [next.domain, next.due === todayISO() ? 'Today' : next.due || 'Later'].filter(Boolean).join(' · ') : 'Your day becomes clear one decision at a time.';
  $('#priorityCount').textContent = priorities.length;
  $('#overdueCount').textContent = overdue.length;
  $('#scheduledCount').textContent = scheduled.length;
  $('#priorities').innerHTML = priorities.length ? priorities.map(task => taskLine(task)).join('') : empty('No priorities yet. Plan the few things that matter most.');
  $('#schedule').innerHTML = scheduled.length ? scheduled.map(task => taskLine(task)).join('') : empty('No timed activities yet.');
  $('#overdueCard').hidden = !overdue.length;
  $('#overdue').innerHTML = overdue.map(task => taskLine(task)).join('');
  const people = state.data.people.filter(person => !person.completed && (!person.due || person.due <= todayISO())).slice(0, 4);
  $('#peopleToday').innerHTML = people.length ? people.map(person => personLine(person)).join('') : empty('No follow-ups due today.');
  const completed = state.data.tasks.filter(task => task.done).length;
  $('#doneCount').textContent = completed;
  $('#doneLabel').textContent = `${open.length} left`;
}

function tasksForFilter() {
  const open = state.data.tasks.filter(isOpen);
  const today = todayISO(), tomorrow = addDays(1), nextWeek = addDays(7);
  if (state.planFilter === 'today') return open.filter(task => task.due === today || task.due < today || task.priority === 'high');
  if (state.planFilter === 'tomorrow') return open.filter(task => task.due === tomorrow);
  if (state.planFilter === 'later') return open.filter(task => !task.due || task.due > nextWeek);
  if (state.planFilter === 'upcoming') return open.filter(task => task.due && task.due > today && task.due <= nextWeek);
  return [...state.data.tasks];
}
function renderPlan() {
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('selected', button.dataset.filter === state.planFilter));
  const tasks = sortTasks(tasksForFilter());
  $('#taskList').innerHTML = tasks.length ? tasks.map(task => taskLine(task)).join('') : empty('Nothing here yet. Capture it or add a task.');
  $('#goalsList').innerHTML = state.data.goals.length ? state.data.goals.map(goal => `<div class="item"><strong>${escapeHtml(goal.title)}</strong><small>${escapeHtml(goal.status || 'Active purpose priority')}</small></div>`).join('') : empty('Add the larger priorities that guide your week.');
}
function renderCapture() {
  const inbox = state.data.captures.filter(capture => !capture.processed).slice(0, 12);
  $('#inboxList').innerHTML = inbox.length ? inbox.map(capture => `<div class="item capture-item"><div><strong>${escapeHtml(capture.text)}</strong><small>${escapeHtml((capture.categories || []).join(' · ') || 'Inbox')} · ${escapeHtml(capture.createdAt || 'Captured')}</small></div><div class="item-actions"><button class="quiet small" data-process-capture="${escapeHtml(capture.id)}" data-destination="task">Task</button><button class="quiet small" data-process-capture="${escapeHtml(capture.id)}" data-destination="person">Person</button></div></div>`).join('') : empty('Your inbox is clear.');
}
function renderPeople() {
  const open = state.data.people.filter(person => !person.completed);
  const history = state.data.people.filter(person => person.completed).slice(0, 8);
  $('#peopleCount').textContent = `${open.length} to remember`;
  $('#peopleList').innerHTML = open.length ? open.map(person => personLine(person)).join('') : empty('No follow-ups waiting.');
  $('#peopleHistory').innerHTML = history.length ? history.map(person => personLine(person, true)).join('') : empty('Completed conversations will appear here.');
}
function renderReview() {
  const review = state.data.reviews.find(item => item.date === todayISO()) || {};
  $('#morningPriorities').value = review.morning || '';
  $('#eveningReflection').value = review.evening || '';
  $('#energy').value = review.energy || 3;
  $('#energyValue').textContent = `${$('#energy').value} / 5`;
  const week = state.data.tasks.filter(task => task.due && task.due >= todayISO() && task.due <= addDays(7) && isOpen(task));
  const completed = state.data.tasks.filter(task => task.completedAt && task.completedAt >= addDays(-7)).length;
  $('#weeklySummary').innerHTML = `<span><strong>${week.length}</strong> upcoming tasks</span><span><strong>${completed}</strong> completed this week</span>`;
}
function renderHealth() {
  const today = state.data.health.filter(item => item.date === todayISO());
  const food = today.filter(item => item.kind === 'food');
  const sum = key => food.reduce((total, item) => total + Number(item[key] || 0), 0);
  $('#healthToday').textContent = `${today.length} entries today`;
  $('#nutritionTitle').textContent = food.length ? `${food.length} meal${food.length === 1 ? '' : 's'} logged` : 'No food logged yet';
  $('#nutritionCalories').textContent = Math.round(sum('calories'));
  $('#nutritionProtein').textContent = `${Math.round(sum('protein'))}g`;
  $('#nutritionCarbs').textContent = `${Math.round(sum('carbs'))}g`;
  $('#nutritionFat').textContent = `${Math.round(sum('fat'))}g`;
  const groups = food.reduce((all, item) => { const slot = item.slot || 'Food'; (all[slot] ||= []).push(item); return all; }, {});
  $('#mealBreakdown').innerHTML = food.length ? Object.entries(groups).map(([slot, items]) => {
    const calories = items.reduce((n, item) => n + Number(item.calories || 0), 0);
    const protein = items.reduce((n, item) => n + Number(item.protein || 0), 0);
    return `<div class="item"><div><strong>${escapeHtml(slot)}</strong><small>${escapeHtml(items.map(item => item.text).join(' · '))}</small></div><small>${Math.round(calories)} kcal · ${Math.round(protein)}g P</small></div>`;
  }).join('') : empty('Add a food, a portion and its macros to build today’s picture.');
  const weights = state.data.health.filter(item => item.kind === 'weight').sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-8);
  $('#weightProgressCard').hidden = state.activeHealth !== 'weight';
  if (state.activeHealth === 'weight') {
    const last = weights.at(-1), goal = Number(last?.goal || $('#weightGoal').value || 105);
    $('#weightTrendTitle').textContent = last ? `${Number(last.value).toFixed(1)} ${last.unit || 'kg'} latest` : 'No weigh-ins yet';
    $('#weightToGoal').textContent = last ? `${Math.max(0, Number(last.value) - goal).toFixed(1)} kg to ${goal} kg` : `Goal ${goal} kg`;
    const max = Math.max(...weights.map(item => Number(item.value || 0)), goal, 1), min = Math.min(...weights.map(item => Number(item.value || max)), goal);
    $('#weightChart').innerHTML = weights.length ? weights.map(item => { const value = Number(item.value); const height = Math.max(12, Math.round(((value - min + 1) / (max - min + 1)) * 100)); return `<div class="bar-wrap"><i style="height:${height}%"></i><span>${escapeHtml(String(item.date).slice(5))}</span></div>`; }).join('') : empty('Your weight trend will appear here after your first weigh-in.');
  }
  const weekStart = addDays(-6);
  const exercise = state.data.health.filter(item => item.kind === 'exercise' && item.date >= weekStart);
  $('#exerciseProgressCard').hidden = state.activeHealth !== 'exercise';
  if (state.activeHealth === 'exercise') {
    const minutes = exercise.reduce((n, item) => n + Number(item.minutes || 0), 0), distance = exercise.reduce((n, item) => n + Number(item.distance || 0), 0), calories = exercise.reduce((n, item) => n + Number(item.calories || 0), 0);
    $('#exerciseSummary').textContent = `${exercise.length} session${exercise.length === 1 ? '' : 's'} in the last 7 days`;
    $('#exerciseMetrics').innerHTML = `<article><strong>${minutes}</strong><span>minutes</span></article><article><strong>${distance.toFixed(1)}</strong><span>km</span></article><article><strong>${Math.round(calories)}</strong><span>kcal</span></article>`;
  }
  const recent = [...state.data.health].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 20);
  $('#healthHistory').innerHTML = recent.length ? recent.map(item => `<div class="item"><strong>${escapeHtml(item.label || item.text || item.kind)}</strong><small>${escapeHtml(item.date || '')}</small></div>`).join('') : '';
}
function renderCategories() {
  $('#categories').innerHTML = state.categories.map(category => `<button type="button" class="chip ${state.chosen.has(category) ? 'selected' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
}
function render() {
  const account = $('#activeAccount'); account.textContent = state.user?.email || ''; account.hidden = !state.user?.email;
  renderToday(); renderPlan(); renderCapture(); renderPeople(); renderReview(); renderHealth(); renderCategories(); renderDashboard(); renderDirection();
}

function openTask(task = {}) {
  $('#taskDialogTitle').textContent = task.id ? 'Edit task' : 'Add a task';
  $('#taskId').value = task.id || ''; $('#taskTitle').value = task.title || ''; $('#taskDue').value = task.due || ''; $('#taskTime').value = task.time || ''; $('#taskPriority').value = task.priority || 'normal'; $('#taskDomain').value = task.domain || 'Personal'; $('#taskNotes').value = task.notes || '';
  $('#deleteTask').hidden = !task.id; $('#taskDialog').showModal(); $('#taskTitle').focus();
}
function closeTask() { $('#taskDialog').close(); }

document.addEventListener('click', event => {
  const target = event.target.closest('button,input'); if (!target) return;
  if (target.dataset.view) setView(target.dataset.view);
  if (target.dataset.category) { state.chosen.has(target.dataset.category) ? state.chosen.delete(target.dataset.category) : state.chosen.add(target.dataset.category); renderCategories(); }
  if (target.dataset.completeTask) save('completeTask', { id: target.dataset.completeTask, done: target.checked });
  if (target.dataset.editTask) openTask(state.data.tasks.find(task => task.id === target.dataset.editTask));
  if (target.dataset.completePerson) save('completePerson', { id: target.dataset.completePerson });
  if (target.dataset.processCapture) save('processCapture', { id: target.dataset.processCapture, destination: target.dataset.destination });
});
$('#openTaskComposer').onclick = () => openTask(); $('#closeTaskDialog').onclick = closeTask;
$('#deleteTask').onclick = async () => { const id = $('#taskId').value; if (id && await save('deleteTask', { id })) closeTask(); };
$('#taskForm').addEventListener('submit', async event => { event.preventDefault(); const id = $('#taskId').value; const payload = { title: $('#taskTitle').value.trim(), due: $('#taskDue').value, time: $('#taskTime').value, priority: $('#taskPriority').value, domain: $('#taskDomain').value, notes: $('#taskNotes').value.trim() }; if (!payload.title) return; if (await save(id ? 'updateTask' : 'task', id ? { id, ...payload } : payload)) closeTask(); });
$('#planFilters').onclick = event => { const button = event.target.closest('[data-filter]'); if (button) { state.planFilter = button.dataset.filter; renderPlan(); } };
$('#goalForm').addEventListener('submit', async event => { event.preventDefault(); const title = $('#goalTitle').value.trim(); if (title && await save('goal', { title })) $('#goalTitle').value = ''; });

$('#saveCapture').onclick = () => { const text = $('#captureText').value.trim(); if (!text) return status('Write or dictate something first.'); const payload = { text, categories: [...state.chosen], journal: $('#journal').checked, destination: $('#captureDestination').value, due: $('#captureDue').value }; save('capture', payload, 'Captured and routed.').then(saved => { if (!saved) return; $('#captureText').value = ''; $('#captureDue').value = ''; $('#journal').checked = false; state.chosen.clear(); renderCategories(); }); };
$('#processAll').onclick = () => save('clearProcessedCaptures', {});
$('#voice').onclick = () => { const Speech = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Speech) return status('Voice capture is not supported in this browser.'); const recognition = new Speech(); recognition.lang = navigator.language; recognition.onstart = () => { $('#voiceStatus').textContent = 'Listening…'; }; recognition.onresult = event => { $('#captureText').value += `${$('#captureText').value ? ' ' : ''}${event.results[0][0].transcript}`; }; recognition.onerror = () => { $('#voiceStatus').textContent = 'Voice capture could not start.'; }; recognition.onend = () => { setTimeout(() => { $('#voiceStatus').textContent = ''; }, 1200); }; recognition.start(); };

$('#personForm').addEventListener('submit', event => { event.preventDefault(); const name = $('#personName').value.trim(); if (!name) return; save('person', { name, note: $('#personNote').value.trim(), due: $('#personDue').value, time: $('#personTime').value }).then(saved => { if (saved) event.target.reset(); }); });
$('#energy').oninput = () => { $('#energyValue').textContent = `${$('#energy').value} / 5`; };
$('#reviewForm').addEventListener('submit', event => { event.preventDefault(); save('review', { morning: $('#morningPriorities').value.trim(), evening: $('#eveningReflection').value.trim(), energy: Number($('#energy').value), date: todayISO() }); });
document.querySelectorAll('[data-health]').forEach(button => button.onclick = () => { state.activeHealth = button.dataset.health; document.querySelectorAll('[data-health]').forEach(item => item.classList.toggle('selected', item.dataset.health === state.activeHealth)); ['food', 'weight', 'exercise'].forEach(name => { $(`#${name}Form`).hidden = name !== state.activeHealth; }); renderHealth(); });
$('#foodForm').addEventListener('submit', event => { event.preventDefault(); const text = $('#meal').value.trim(); if (!text) return; save('food', { text, date: $('#foodDate').value || todayISO(), slot: $('#foodSlot').value, serving: $('#serving').value.trim(), quantity: $('#quantity').value, calories: $('#calories').value, protein: $('#protein').value, carbs: $('#carbs').value, fat: $('#fat').value }).then(saved => { if (saved) { event.target.reset(); $('#foodDate').value = todayISO(); $('#quantity').value = 1; } }); });
$('#weightForm').addEventListener('submit', event => { event.preventDefault(); const value = $('#weight').value; if (value) save('weight', { value, unit: $('#weightUnit').value, date: $('#weightDate').value || todayISO(), goal: $('#weightGoal').value, waist: $('#waist').value, note: $('#weightNote').value.trim() }).then(saved => { if (saved) { event.target.reset(); $('#weightDate').value = todayISO(); $('#weightGoal').value = 105; } }); });
$('#exerciseForm').addEventListener('submit', event => { event.preventDefault(); const minutes = $('#minutes').value; if (minutes) save('exercise', { text: $('#exercise').value, minutes, date: $('#exerciseDate').value || todayISO(), distance: $('#distance').value, calories: $('#exerciseCalories').value, source: $('#exerciseSource').value, hrAvg: $('#hrAvg').value, hrMax: $('#hrMax').value, steps: $('#steps').value, note: $('#exerciseNote').value.trim() }).then(saved => { if (saved) { event.target.reset(); $('#exerciseDate').value = todayISO(); } }); });

function signedInView() { $('#login').hidden = true; $('#app').hidden = false; $('#signOut').hidden = false; render(); loadDriveStatus(); }
function signOutLocal(message = 'Signed out.') { state.user = null; state.driveConnected = false; $('#activeAccount').hidden = true; $('#storageNotice').hidden = true; $('#app').hidden = true; $('#login').hidden = false; $('#signOut').hidden = true; status(message); }
async function signOut() { try { const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }); if (!response.ok) throw Error('Sign-out failed'); window.google?.accounts?.id?.disableAutoSelect(); signOutLocal(); } catch { status('Could not sign out. Check your connection and try again.'); } }
window.handleCredentialResponse = async response => { if (!response.credential) return status('Google did not return a sign-in credential. Please try again.'); try { state.user = await verifyAuthentication(response.credential); signedInView(); await loadDashboard(); } catch (error) { signOutLocal(error.message); } };
async function restoreSession() { try { const response = await fetch('/api/auth', { credentials: 'same-origin' }); if (!response.ok) return; state.user = (await response.json()).user; signedInView(); await loadDashboard(); } catch { signOutLocal('Your session could not be restored. Please sign in again.'); } }
async function initialiseGoogleSignIn() { const help = $('#loginHelp'); try { const config = await fetch('/api/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()); if (!config.googleClientId) { help.textContent = 'Google sign-in has not been configured yet. Add GOOGLE_CLIENT_ID in Netlify to enable it.'; return; } let attempts = 0; const waitForGoogle = setInterval(() => { attempts += 1; if (!window.google?.accounts?.id) { if (attempts >= 50) { clearInterval(waitForGoogle); help.textContent = 'Google sign-in could not load. Check your connection and try again.'; } return; } clearInterval(waitForGoogle); google.accounts.id.initialize({ client_id: config.googleClientId, callback: window.handleCredentialResponse, auto_select: false, use_fedcm_for_prompt: true }); google.accounts.id.renderButton($('#googleButton'), { theme: 'outline', size: 'large', type: 'standard', text: 'continue_with', shape: 'pill', width: 280 }); help.textContent = 'Continue with your Google account. Your identity is verified by the server.'; }, 100); } catch { help.textContent = 'Google sign-in settings could not be loaded. Please try again later.'; } }
window.addEventListener('load', () => { ['foodDate', 'weightDate', 'exerciseDate'].forEach(id => { if (!$('#' + id).value) $('#' + id).value = todayISO(); }); restoreSession(); initialiseGoogleSignIn(); }); $('#signOut').onclick = signOut; $('#retryDashboard').onclick = () => loadDashboard();

// Dashboard preferences and direction entries are stored in the signed-in workspace.
const widgetNames = { focus: 'Today’s focus', capture: 'Quick capture', tasks: 'Tasks and to-do lists', purpose: 'My purpose', mission: 'My mission', vision: 'My vision', goals: 'Goals and progress', habits: 'Habit tracker', priorities: 'Daily priorities', food: 'Food tracker', weight: 'Weight tracker', exercise: 'Exercise tracker', progress: 'Personal progress', schedule: 'Today’s schedule', overdue: 'Needs attention', people: 'People follow-ups' };
const presetWidgets = { focused: ['focus', 'tasks', 'capture', 'priorities'], balanced: ['focus', 'vision', 'goals', 'tasks', 'capture', 'habits', 'priorities'] };
let layoutQueue = Promise.resolve();
function currentWidgets() { return state.data.dashboard?.widgets || []; }
function persistLayout(preset = 'custom') {
  const widgets = [...$('#dashboardGrid').children].filter(el => el.dataset.widget && currentWidgets().some(item => item.type === el.dataset.widget)).map((el, order) => ({ type: el.dataset.widget, order, size: el.dataset.size || 'half', visible: el.dataset.visible !== 'false' }));
  state.data.dashboard.widgets = widgets;
  state.data.dashboard.preset = preset;
  layoutQueue = layoutQueue.catch(() => {}).then(() => save('dashboardLayout', { widgets, preset }, 'Dashboard layout saved.'));
  return layoutQueue;
}
function widgetMarkup(type) {
  const data = state.data, pins = data.dashboard?.pins || [];
  const pinned = collection => pins.filter(pin => pin.collection === collection).map(pin => data[collection]?.find(item => item.id === pin.id)).filter(Boolean);
  if (['purpose', 'mission', 'vision'].includes(type)) {
    const entries = pinned('direction').filter(item => item.kind === type);
    return `<p class="eyebrow">MY ${type.toUpperCase()}</p><h3>${widgetNames[type]}</h3>${entries.length ? entries.map(item => `<div class="pinned-entry"><strong>${escapeHtml(item.title || widgetNames[type])}</strong><p>${escapeHtml(item.body)}</p></div>`).join('') : empty('Pin an individual entry from My Direction.')}<button class="text-button" data-view="more">Open My Direction</button>`;
  }
  if (type === 'goals') { const goals = pinned('goals'); return `<p class="eyebrow">DIRECTION</p><h3>Goals</h3>${goals.length ? goals.map(goal => `<div class="goal-progress"><strong>${escapeHtml(goal.title)}</strong><progress max="100" value="${Number(goal.progress || 0)}"></progress><small>${Number(goal.progress || 0)}% · ${escapeHtml(goal.status || 'Active')}</small></div>`).join('') : empty('Pin goals from My Direction.')}<button class="text-button" data-view="more">Open goals</button>`; }
  if (type === 'habits') { const habits = pinned('habits'); return `<p class="eyebrow">DAILY PRACTICE</p><h3>Habits</h3>${habits.length ? habits.map(habit => `<div class="item"><div><strong>${escapeHtml(habit.title)}</strong><small>${escapeHtml(habit.frequency || 'daily')} · ${(habit.completions || []).length} completions</small></div><button class="quiet small" data-habit-complete="${escapeHtml(habit.id)}">${(habit.completions || []).includes(todayISO()) ? 'Undo today' : 'Complete today'}</button></div>`).join('') : empty('Pin a habit from My Direction.')}<button class="text-button" data-view="more">Open habits</button>`; }
  if (type === 'tasks') { const tasks = sortTasks(data.tasks.filter(isOpen)).slice(0, 4); return `<p class="eyebrow">NEXT ACTIONS</p><h3>Tasks</h3><div class="stack">${tasks.length ? tasks.map(task => taskLine(task, false)).join('') : empty('Your list is clear.')}</div><button class="text-button" data-view="plan">Open plan</button>`; }
  if (type === 'capture') return `<p class="eyebrow">QUICK CAPTURE</p><h3>Keep the thought</h3><textarea id="quickCaptureInput" rows="2" placeholder="Type or dictate here…"></textarea><button class="secondary small" id="quickCaptureSave">Capture to inbox</button>`;
  if (type === 'food') { const meals = data.health.filter(x => x.kind === 'food' && x.date === todayISO()); return `<p class="eyebrow">NUTRITION</p><h3>${meals.length} meals today</h3><p class="fine">${Math.round(meals.reduce((n, x) => n + Number(x.calories || 0), 0))} kcal · ${Math.round(meals.reduce((n, x) => n + Number(x.protein || 0), 0))}g protein</p><button class="text-button" data-view="health">Open food log</button>`; }
  if (type === 'weight') { const weight = data.health.filter(x => x.kind === 'weight').at(-1); return `<p class="eyebrow">WEIGHT</p><h3>${weight ? `${escapeHtml(weight.value)} ${escapeHtml(weight.unit)}` : 'No weigh-in yet'}</h3><button class="text-button" data-view="health">Open weight log</button>`; }
  if (type === 'exercise') { const sessions = data.health.filter(x => x.kind === 'exercise' && x.date >= addDays(-6)); return `<p class="eyebrow">MOVEMENT</p><h3>${sessions.length} sessions this week</h3><p class="fine">${sessions.reduce((n, x) => n + Number(x.minutes || 0), 0)} minutes logged</p><button class="text-button" data-view="health">Open exercise log</button>`; }
  return '';
}
function renderDashboard() {
  const grid = $('#dashboardGrid'), widgets = currentWidgets(), existing = new Map([...grid.children].filter(x => x.dataset.widget).map(x => [x.dataset.widget, x]));
  const ordered = [...widgets].sort((a, b) => a.order - b.order);
  for (const config of ordered) {
    let el = existing.get(config.type);
    if (!el) { el = document.createElement('article'); el.className = 'card dashboard-dynamic'; el.dataset.widget = config.type; }
    if (el.classList.contains('dashboard-dynamic') && !el.contains(document.activeElement)) el.innerHTML = widgetMarkup(config.type);
    el.dataset.size = config.size || 'half'; el.dataset.visible = String(config.visible !== false);
    el.hidden = config.visible === false || (config.type === 'overdue' && !state.data.tasks.some(task => isOpen(task) && task.due && task.due < todayISO()) && !state.editDashboard);
    const oldTools = el.querySelector('.widget-tools'); if (oldTools) oldTools.remove();
    if (state.editDashboard) {
      const tools = document.createElement('div'); tools.className = 'widget-tools';
      tools.innerHTML = `<button class="drag-handle" type="button" aria-label="Drag ${escapeHtml(widgetNames[config.type] || config.type)}">☰</button><span>${escapeHtml(widgetNames[config.type] || config.type)}</span><select aria-label="Size of ${escapeHtml(widgetNames[config.type] || config.type)}" data-widget-size="${escapeHtml(config.type)}"><option value="compact">Compact</option><option value="half">Half</option><option value="full">Full</option></select><button type="button" class="quiet small" data-widget-up="${escapeHtml(config.type)}" aria-label="Move up">↑</button><button type="button" class="quiet small" data-widget-down="${escapeHtml(config.type)}" aria-label="Move down">↓</button><button type="button" class="quiet small" data-widget-hide="${escapeHtml(config.type)}">${config.visible === false ? 'Restore' : 'Hide'}</button>`;
      tools.querySelector('select').value = config.size || 'half'; el.prepend(tools); el.hidden = false;
    }
    grid.append(el); existing.delete(config.type);
  }
  for (const el of existing.values()) el.hidden = true;
  $('#dashboardEditor').hidden = !state.editDashboard;
  $('#editDashboard').setAttribute('aria-pressed', String(state.editDashboard));
  $('#editDashboard').textContent = state.editDashboard ? 'Done editing' : 'Edit dashboard';
  document.querySelectorAll('[data-preset]').forEach(button => button.classList.toggle('selected', button.dataset.preset === state.data.dashboard.preset));
  $('#widgetLibrary').innerHTML = Object.entries(widgetNames).filter(([type]) => !widgets.some(item => item.type === type)).map(([type, name]) => `<button class="chip" data-widget-add="${type}">+ ${escapeHtml(name)}</button>`).join('') || '<span class="fine">All widgets are on your dashboard.</span>';
}
function reorderWidget(type, direction) { const el = $(`[data-widget="${type}"]`), sibling = direction < 0 ? el?.previousElementSibling : el?.nextElementSibling; if (!el || !sibling) return; if (direction < 0) sibling.before(el); else sibling.after(el); persistLayout(); renderDashboard(); }
let dragging = null;
$('#dashboardGrid').addEventListener('pointerdown', event => { const handle = event.target.closest('.drag-handle'); if (!handle) return; dragging = handle.closest('[data-widget]'); dragging.classList.add('dragging'); handle.setPointerCapture(event.pointerId); });
$('#dashboardGrid').addEventListener('pointermove', event => { if (!dragging) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-widget]'); if (target && target !== dragging && target.parentElement === $('#dashboardGrid')) { const mid = target.getBoundingClientRect().top + target.offsetHeight / 2; target.parentElement.insertBefore(dragging, event.clientY < mid ? target : target.nextSibling); } });
$('#dashboardGrid').addEventListener('pointerup', () => { if (!dragging) return; dragging.classList.remove('dragging'); dragging = null; persistLayout(); });
$('#dashboardGrid').addEventListener('pointercancel', () => { if (dragging) dragging.classList.remove('dragging'); dragging = null; });
$('#dashboardGrid').addEventListener('change', event => { if (event.target.dataset.widgetSize) { event.target.closest('[data-widget]').dataset.size = event.target.value; persistLayout(); } });
$('#editDashboard').onclick = () => { state.editDashboard = !state.editDashboard; renderDashboard(); };
$('#resetDashboard').onclick = () => applyPreset('balanced');
function applyPreset(name) { if (!presetWidgets[name]) return; const existing = currentWidgets(); const widgets = [...presetWidgets[name], ...existing.map(x => x.type).filter(x => !presetWidgets[name].includes(x))].map((type, order) => ({ type, order, size: existing.find(x => x.type === type)?.size || 'half', visible: presetWidgets[name].includes(type) })); state.data.dashboard = { ...state.data.dashboard, preset: name, widgets }; renderDashboard(); persistLayout(name); }
$('#dashboardEditor').addEventListener('click', event => { const preset = event.target.closest('[data-preset]'); if (preset) { if (preset.dataset.preset === 'custom') { state.data.dashboard.preset = 'custom'; persistLayout(); renderDashboard(); } else applyPreset(preset.dataset.preset); } });
$('#dashboardGrid').addEventListener('click', event => { if (event.target.id === 'quickCaptureSave') { const input = $('#quickCaptureInput'); if (input?.value.trim()) save('capture', { text: input.value.trim(), destination: 'inbox' }, 'Captured to inbox.'); } });
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.widgetUp) reorderWidget(target.dataset.widgetUp, -1);
  if (target.dataset.widgetDown) reorderWidget(target.dataset.widgetDown, 1);
  if (target.dataset.widgetHide) { const item = currentWidgets().find(x => x.type === target.dataset.widgetHide); if (item) { item.visible = !item.visible; renderDashboard(); persistLayout(); } }
  if (target.dataset.widgetAdd) { const type = target.dataset.widgetAdd; state.data.dashboard.widgets.push({ type, id: type, order: currentWidgets().length, size: 'half', visible: true }); renderDashboard(); persistLayout(); }
  if (target.dataset.habitComplete) save('completeHabit', { id: target.dataset.habitComplete, date: todayISO() });
});

const directionAreas = [
  { key: 'purpose', title: 'Purpose', description: 'What gives your life meaning?' },
  { key: 'mission', title: 'Mission', description: 'What are you committed to doing?' },
  { key: 'vision', title: 'Vision', description: 'What future are you building?' },
  { key: 'goals', title: 'Goals', description: 'Turn your direction into measurable progress.' },
  { key: 'habits', title: 'Habits', description: 'Practice what matters daily or weekly.' },
  { key: 'identity', title: 'Identity', description: 'Values, strengths, beliefs and your future self.' },
  { key: 'personalSpace', title: 'Personal Space', description: 'A private place for thoughts and reflections.' }
];
const collectionFor = area => ['purpose', 'mission', 'vision'].includes(area) ? 'direction' : area;
function renderDirection() {
  const pins = state.data.dashboard?.pins || [];
  $('#directionSections').innerHTML = directionAreas.map(area => {
    const collection = collectionFor(area.key);
    const entries = (state.data[collection] || []).filter(item => collection !== 'direction' || item.kind === area.key);
    const rows = entries.map(item => {
      const pinned = pins.some(pin => pin.collection === collection && pin.id === item.id);
      const body = item.body || item.description || '';
      const detail = collection === 'goals' ? `${Number(item.progress || 0)}% · ${item.status || 'Active'}${item.targetDate ? ` · ${item.targetDate}` : ''} · ${(item.actionIds || []).length} linked actions` : collection === 'habits' ? `${item.frequency || 'daily'} · ${(item.completions || []).length} completions${item.completions?.length ? ` · Recent: ${item.completions.slice(-5).join(', ')}` : ''}` : item.kind === 'journal' ? 'Journal entry' : '';
      return `<div class="direction-entry"><div><strong>${escapeHtml(item.title || area.title)}</strong><p>${escapeHtml(body)}</p><small>${escapeHtml(detail)}</small>${collection === 'goals' ? `<progress max="100" value="${Number(item.progress || 0)}"></progress>` : ''}</div><div class="entry-actions"><button class="quiet small" data-entry-edit="${escapeHtml(item.id)}" data-entry-area="${area.key}">Edit</button>${['direction', 'goals', 'habits'].includes(collection) ? `<button class="quiet small" data-entry-pin="${escapeHtml(item.id)}" data-entry-collection="${collection}">${pinned ? 'Remove from dashboard' : 'Add to dashboard'}</button>` : ''}${collection === 'habits' ? `<button class="quiet small" data-habit-complete="${escapeHtml(item.id)}">${(item.completions || []).includes(todayISO()) ? 'Undo today' : 'Complete today'}</button>` : ''}</div></div>`;
    }).join('');
    return `<article class="card direction-area" id="direction-${area.key}"><div class="section-title"><div><p class="eyebrow">MY DIRECTION</p><h3>${area.title}</h3><p class="fine">${area.description}</p></div><button class="secondary small" data-entry-add="${area.key}">+ Add</button></div><div class="direction-list">${rows || empty(`No ${area.title.toLowerCase()} entries yet.`)}</div></article>`;
  }).join('');
}
function openEntry(area, item = {}) {
  const collection = collectionFor(area);
  $('#entryCollection').value = collection; $('#entryId').value = item.id || ''; $('#entryKind').value = area;
  $('#entryDialogTitle').textContent = `${item.id ? 'Edit' : 'Add'} ${directionAreas.find(x => x.key === area)?.title || 'entry'}`;
  $('#entryTitle').value = item.title || ''; $('#entryBody').value = item.body || item.description || '';
  $('#entryBodyLabel').hidden = collection === 'habits'; $('#goalFields').hidden = collection !== 'goals'; $('#habitFields').hidden = collection !== 'habits'; $('#identityFields').hidden = collection !== 'identity';
  $('#entryCategory').value = item.category || ''; $('#entryTargetDate').value = item.targetDate || ''; $('#entryProgress').value = item.progress || 0; $('#entryStatus').value = item.status || 'Active'; $('#entryMilestones').value = (item.milestones || []).join('\n');
  $('#entryFrequency').value = item.frequency || 'daily'; $('#entryIdentityKind').value = item.kind || 'value';
  $('#entryGoalId').innerHTML = `<option value="">No connected goal</option>${state.data.goals.map(goal => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`).join('')}`; $('#entryGoalId').value = item.goalId || '';
  $('#entryActions').innerHTML = state.data.tasks.filter(isOpen).map(task => `<label class="action-choice"><input type="checkbox" value="${escapeHtml(task.id)}" ${item.actionIds?.includes(task.id) ? 'checked' : ''}>${escapeHtml(task.title)}</label>`).join('') || empty('Add tasks in Plan to link daily actions.');
  $('#deleteEntry').hidden = !item.id; $('#entryDialog').showModal(); $('#entryTitle').focus();
}
$('#closeEntryDialog').onclick = () => $('#entryDialog').close();
$('#deleteEntry').onclick = async () => { const collection = $('#entryCollection').value, id = $('#entryId').value; if (!id || !confirm('Delete this entry? A revision will remain available for recovery.')) return; const action = { direction: 'deleteDirection', goals: 'deleteGoal', habits: 'deleteHabit', identity: 'deleteIdentity', personalSpace: 'deletePersonalEntry' }[collection]; $('#entryDialog').close(); await save(action, { id }); };
$('#entryForm').addEventListener('submit', async event => {
  event.preventDefault(); const collection = $('#entryCollection').value, id = $('#entryId').value, title = $('#entryTitle').value.trim(), body = $('#entryBody').value.trim();
  if (!title && collection !== 'personalSpace') return status('Add a title first.');
  const payload = { id, title, body, kind: $('#entryKind').value };
  if (collection === 'goals') Object.assign(payload, { description: body, category: $('#entryCategory').value, targetDate: $('#entryTargetDate').value, progress: Number($('#entryProgress').value), status: $('#entryStatus').value, milestones: $('#entryMilestones').value.split('\n').map(x => x.trim()).filter(Boolean), actionIds: [...$('#entryActions').querySelectorAll('input:checked')].map(x => x.value) });
  if (collection === 'habits') Object.assign(payload, { frequency: $('#entryFrequency').value, goalId: $('#entryGoalId').value });
  if (collection === 'identity') payload.kind = $('#entryIdentityKind').value;
  const action = { direction: id ? 'updateDirection' : 'direction', goals: id ? 'updateGoal' : 'goal', habits: id ? 'updateHabit' : 'habit', identity: id ? 'updateIdentity' : 'identity', personalSpace: id ? 'updatePersonalEntry' : 'personalEntry' }[collection];
  const saved = await save(action, payload); if (saved) $('#entryDialog').close();
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.entryAdd) openEntry(target.dataset.entryAdd);
  if (target.dataset.entryEdit) { const area = target.dataset.entryArea, collection = collectionFor(area); openEntry(area, state.data[collection].find(x => x.id === target.dataset.entryEdit)); }
  if (target.dataset.entryPin) {
    const collection = target.dataset.entryCollection, id = target.dataset.entryPin;
    const pinned = state.data.dashboard.pins.some(x => x.collection === collection && x.id === id);
    if (await save(pinned ? 'unpin' : 'pin', { collection, id })) {
      if (!pinned) { const type = collection === 'direction' ? state.data.direction.find(x => x.id === id)?.kind : collection; if (type) { const widget = currentWidgets().find(x => x.type === type); if (widget) widget.visible = true; else state.data.dashboard.widgets.push({ type, id: type, order: currentWidgets().length, size: 'half', visible: true }); renderDashboard(); persistLayout(); } }
    }
  }
});

async function driveRequest(action, extra = {}) {
  const response = await fetch('/api/drive', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const body = await response.json(); if (!response.ok) throw Error(body.error || 'Google Drive request failed'); return body;
}
function showSync(message, stateName) { $('#driveStatus').textContent = message; $('#driveStatus').dataset.state = stateName; }
async function loadDriveStatus() {
  try {
    const response = await fetch('/api/drive?action=status', { credentials: 'same-origin', cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw Error(body.error);
    state.driveConnected = body.connected; $('#driveAccount').textContent = body.connected ? `Connected: ${body.email}` : 'Google Drive is not connected.';
    $('#lastSync').textContent = body.lastSync ? `Last successful sync: ${new Date(body.lastSync).toLocaleString()}` : 'No successful Drive sync yet.';
    const synced = body.connected && body.lastSync && body.lastSyncRevision === body.revision;
    showSync(body.syncError ? `Sync error: ${body.syncError}` : synced ? 'Synced' : body.connected ? 'Offline / Pending Sync' : 'Authentication Required', body.syncError ? 'error' : synced ? 'synced' : body.connected ? 'pending' : 'auth');
    $('#connectDrive').textContent = body.connected ? 'Reconnect Drive' : 'Connect Google Drive'; $('#syncDrive').hidden = !body.connected; $('#restoreDrive').hidden = !body.connected; $('#disconnectDrive').hidden = !body.connected;
    const result = new URLSearchParams(location.search).get('drive'); if (result) { status(result === 'connected' ? 'Google Drive connected. Sync when ready.' : `Drive connection: ${result.replaceAll('-', ' ')}.`); history.replaceState(null, '', location.pathname); }
  } catch (error) { showSync(`Sync Error: ${error.message}`, 'error'); }
}
async function syncDrive(manual = true) {
  if (!state.driveConnected) return;
  showSync('Syncing…', 'syncing');
  try {
    const result = await driveRequest('sync');
    if (result.status === 'synced') { showSync('Synced', 'synced'); $('#lastSync').textContent = `Last successful sync: ${new Date().toLocaleString()}`; if (manual) status('Google Drive is up to date.'); }
    else { showSync(result.message || 'Review Drive backup before continuing.', 'pending'); if (manual) status(result.message); }
  } catch (error) { showSync(`Sync Error: ${error.message}`, 'error'); if (manual) status(error.message); }
}
$('#connectDrive').onclick = () => { location.assign('/api/drive?action=connect'); };
$('#syncDrive').onclick = () => syncDrive();
$('#disconnectDrive').onclick = async () => { if (!confirm('Disconnect Google Drive? Your existing Drive backups will stay in your account.')) return; try { await driveRequest('disconnect'); state.driveConnected = false; await loadDriveStatus(); status('Google Drive disconnected.'); } catch (error) { status(error.message); } };
$('#restoreDrive').onclick = async () => {
  try {
    const result = await driveRequest('latest'); const latest = result.latest; if (!latest) return status('No Drive backup is available.');
    const message = `Restore the Drive copy from ${new Date(latest.createdTime).toLocaleString()} (revision ${latest.revision})? Your current workspace will be retained in server revision history. This replaces the current view of your data.`;
    if (!confirm(message)) return;
    const restored = await driveRequest('restore', { fileId: latest.id, expectedRevision: state.revision }); normalise(restored.data); state.revision = restored.revision; render(); showSync('Offline / Pending Sync', 'pending'); status('Drive backup restored. Sync to save this revision.');
  } catch (error) { status(error.message); }
};
window.addEventListener('online', () => { if (state.driveConnected) syncDrive(false); });
