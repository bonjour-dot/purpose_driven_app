const $ = selector => document.querySelector(selector);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = amount => { const date = new Date(); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); };
const state = {
  credential: null, user: null, activeView: 'today', planFilter: 'today', activeHealth: 'food',
  categories: ['Ministry', 'Personal', 'Family', 'Health', 'Work', 'Journal'], chosen: new Set(),
  data: { tasks: [], people: [], captures: [], goals: [], reviews: [], health: [] }
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
  if (!state.credential) throw Error('Please sign in first.');
  const response = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: state.credential, action, payload }) });
  const body = await response.json();
  if (!response.ok) {
    const error = Error(body.error || 'Unable to save.');
    error.status = response.status;
    throw error;
  }
  return body;
}

async function verifyAuthentication(credential = state.credential) {
  const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
  const body = await response.json();
  if (!response.ok) { const error = Error(body.error || 'Google sign-in could not be verified'); error.status = response.status; throw error; }
  return body.user;
}

function normalise(data = {}) {
  state.data = { tasks: [], people: [], captures: [], goals: [], reviews: [], health: [], ...data };
}
async function refresh() {
  const result = await api('dashboard');
  normalise(result.data);
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
    if (error.status === 401) {
      try { await verifyAuthentication(); }
      catch { signOut('Your Google session expired. Please sign in again.'); return false; }
    }
    showStorageIssue(error.message);
    return false;
  }
}
async function save(action, payload, success = 'Saved to your private workspace.') {
  try { status('Saving…'); const result = await api(action, payload); normalise(result.data); render(); status(success); }
  catch (error) { status(error.message); }
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
  $('#priorities').innerHTML = priorities.length ? priorities.map(taskLine).join('') : empty('No priorities yet. Plan the few things that matter most.');
  $('#schedule').innerHTML = scheduled.length ? scheduled.map(taskLine).join('') : empty('No timed activities yet.');
  $('#overdueCard').hidden = !overdue.length;
  $('#overdue').innerHTML = overdue.map(taskLine).join('');
  const people = state.data.people.filter(person => !person.completed && (!person.due || person.due <= todayISO())).slice(0, 4);
  $('#peopleToday').innerHTML = people.length ? people.map(personLine).join('') : empty('No follow-ups due today.');
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
  $('#taskList').innerHTML = tasks.length ? tasks.map(taskLine).join('') : empty('Nothing here yet. Capture it or add a task.');
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
  $('#peopleList').innerHTML = open.length ? open.map(personLine).join('') : empty('No follow-ups waiting.');
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
  const recent = state.data.health.slice(-7).reverse();
  const max = Math.max(...recent.map(item => Number(item.calories || item.minutes || item.value || 0)), 1);
  $('#healthChart').innerHTML = recent.length ? recent.map(item => { const n = Number(item.calories || item.minutes || item.value || 0); return `<div class="bar-wrap"><i style="height:${Math.max(12, Math.round(n / max * 100))}%"></i><span>${escapeHtml(item.kind)}</span></div>`; }).join('') : empty('Your health trend will grow as you log.');
  $('#healthHistory').innerHTML = recent.length ? recent.map(item => `<div class="item"><strong>${escapeHtml(item.label || item.text || item.kind)}</strong><small>${escapeHtml(item.date || '')}</small></div>`).join('') : '';
}
function renderCategories() {
  $('#categories').innerHTML = state.categories.map(category => `<button type="button" class="chip ${state.chosen.has(category) ? 'selected' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
}
function render() {
  const account = $('#activeAccount'); account.textContent = state.user?.email || ''; account.hidden = !state.user?.email;
  renderToday(); renderPlan(); renderCapture(); renderPeople(); renderReview(); renderHealth(); renderCategories();
}

function openTask(task = {}) {
  $('#taskDialogTitle').textContent = task.id ? 'Edit task' : 'Add a task';
  $('#taskId').value = task.id || ''; $('#taskTitle').value = task.title || ''; $('#taskDue').value = task.due || ''; $('#taskTime').value = task.time || ''; $('#taskPriority').value = task.priority || 'normal'; $('#taskDomain').value = task.domain || 'Personal'; $('#taskNotes').value = task.notes || '';
  $('#deleteTask').hidden = !task.id; $('#taskDialog').showModal(); $('#taskTitle').focus();
}
function closeTask() { $('#taskDialog').close(); }

document.addEventListener('click', event => {
  const target = event.target.closest('button,input'); if (!target) return;
  if (target.dataset.category) { state.chosen.has(target.dataset.category) ? state.chosen.delete(target.dataset.category) : state.chosen.add(target.dataset.category); renderCategories(); }
  if (target.dataset.completeTask) save('completeTask', { id: target.dataset.completeTask, done: target.checked });
  if (target.dataset.editTask) openTask(state.data.tasks.find(task => task.id === target.dataset.editTask));
  if (target.dataset.completePerson) save('completePerson', { id: target.dataset.completePerson });
  if (target.dataset.processCapture) save('processCapture', { id: target.dataset.processCapture, destination: target.dataset.destination });
});
$('#openTaskComposer').onclick = () => openTask(); $('#closeTaskDialog').onclick = closeTask;
$('#deleteTask').onclick = () => { const id = $('#taskId').value; if (id) { closeTask(); save('deleteTask', { id }); } };
$('#taskForm').addEventListener('submit', event => { event.preventDefault(); const id = $('#taskId').value; const payload = { title: $('#taskTitle').value.trim(), due: $('#taskDue').value, time: $('#taskTime').value, priority: $('#taskPriority').value, domain: $('#taskDomain').value, notes: $('#taskNotes').value.trim() }; if (!payload.title) return; closeTask(); save(id ? 'updateTask' : 'task', id ? { id, ...payload } : payload); });
$('#planFilters').onclick = event => { const button = event.target.closest('[data-filter]'); if (button) { state.planFilter = button.dataset.filter; renderPlan(); } };
$('#goalForm').addEventListener('submit', event => { event.preventDefault(); const title = $('#goalTitle').value.trim(); if (title) { save('goal', { title }); $('#goalTitle').value = ''; } });

$('#saveCapture').onclick = () => { const text = $('#captureText').value.trim(); if (!text) return status('Write or dictate something first.'); const payload = { text, categories: [...state.chosen], journal: $('#journal').checked, destination: $('#captureDestination').value, due: $('#captureDue').value }; save('capture', payload, 'Captured and routed.').then(() => { $('#captureText').value = ''; $('#captureDue').value = ''; $('#journal').checked = false; state.chosen.clear(); renderCategories(); }); };
$('#processAll').onclick = () => save('clearProcessedCaptures', {});
$('#voice').onclick = () => { const Speech = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Speech) return status('Voice capture is not supported in this browser.'); const recognition = new Speech(); recognition.lang = navigator.language; recognition.onstart = () => { $('#voiceStatus').textContent = 'Listening…'; }; recognition.onresult = event => { $('#captureText').value += `${$('#captureText').value ? ' ' : ''}${event.results[0][0].transcript}`; }; recognition.onerror = () => { $('#voiceStatus').textContent = 'Voice capture could not start.'; }; recognition.onend = () => { setTimeout(() => { $('#voiceStatus').textContent = ''; }, 1200); }; recognition.start(); };

$('#personForm').addEventListener('submit', event => { event.preventDefault(); const name = $('#personName').value.trim(); if (!name) return; save('person', { name, note: $('#personNote').value.trim(), due: $('#personDue').value, time: $('#personTime').value }).then(() => event.target.reset()); });
$('#energy').oninput = () => { $('#energyValue').textContent = `${$('#energy').value} / 5`; };
$('#reviewForm').addEventListener('submit', event => { event.preventDefault(); save('review', { morning: $('#morningPriorities').value.trim(), evening: $('#eveningReflection').value.trim(), energy: Number($('#energy').value), date: todayISO() }); });
document.querySelectorAll('[data-health]').forEach(button => button.onclick = () => { state.activeHealth = button.dataset.health; document.querySelectorAll('[data-health]').forEach(item => item.classList.toggle('selected', item.dataset.health === state.activeHealth)); ['food', 'weight', 'exercise'].forEach(name => { $(`#${name}Form`).hidden = name !== state.activeHealth; }); });
$('#foodForm').addEventListener('submit', event => { event.preventDefault(); const text = $('#meal').value.trim(); if (!text) return; save('food', { text, calories: $('#calories').value, protein: $('#protein').value, carbs: $('#carbs').value, fat: $('#fat').value }).then(() => event.target.reset()); });
$('#weightForm').addEventListener('submit', event => { event.preventDefault(); const value = $('#weight').value; if (value) save('weight', { value, unit: $('#weightUnit').value }).then(() => event.target.reset()); });
$('#exerciseForm').addEventListener('submit', event => { event.preventDefault(); const text = $('#exercise').value.trim(), minutes = $('#minutes').value; if (text || minutes) save('exercise', { text, minutes }).then(() => event.target.reset()); });

function signedInView() { $('#login').hidden = true; $('#app').hidden = false; $('#signOut').hidden = false; render(); }
function signOut(message = 'Signed out.') { state.credential = null; state.user = null; sessionStorage.removeItem('purpose-driven-credential'); $('#activeAccount').hidden = true; $('#storageNotice').hidden = true; $('#app').hidden = true; $('#login').hidden = false; $('#signOut').hidden = true; status(message); }
window.handleCredentialResponse = async response => { if (!response.credential) return status('Google did not return a sign-in credential. Please try again.'); state.credential = response.credential; try { state.user = await verifyAuthentication(); sessionStorage.setItem('purpose-driven-credential', state.credential); signedInView(); await loadDashboard(); } catch (error) { signOut(error.message); } };
async function restoreSession() { const credential = sessionStorage.getItem('purpose-driven-credential'); if (!credential) return; state.credential = credential; try { state.user = await verifyAuthentication(); signedInView(); await loadDashboard(); } catch { signOut('Your Google session expired. Please sign in again.'); } }
async function initialiseGoogleSignIn() { const help = $('#loginHelp'); try { const config = await fetch('/api/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()); if (!config.googleClientId) { help.textContent = 'Google sign-in has not been configured yet. Add GOOGLE_CLIENT_ID in Netlify to enable it.'; return; } let attempts = 0; const waitForGoogle = setInterval(() => { attempts += 1; if (!window.google?.accounts?.id) { if (attempts >= 50) { clearInterval(waitForGoogle); help.textContent = 'Google sign-in could not load. Check your connection and try again.'; } return; } clearInterval(waitForGoogle); google.accounts.id.initialize({ client_id: config.googleClientId, callback: window.handleCredentialResponse, auto_select: false, use_fedcm_for_prompt: true }); google.accounts.id.renderButton($('#googleButton'), { theme: 'outline', size: 'large', type: 'standard', text: 'continue_with', shape: 'pill', width: 280 }); help.textContent = 'Continue with your Google account. Your identity is verified by the server.'; restoreSession(); }, 100); } catch { help.textContent = 'Google sign-in settings could not be loaded. Please try again later.'; } }
window.addEventListener('load', initialiseGoogleSignIn); $('#signOut').onclick = () => signOut(); $('#retryDashboard').onclick = () => loadDashboard();
