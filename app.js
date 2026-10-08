'use strict';

// Keep in step with CACHE in sw.js; shown in Settings so you can tell which version is running.
const APP_VERSION = 1;
const STORAGE_KEY = 'pumptrack.v1';
const ML_PER_OZ = 29.5735;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const SCHEMA_VERSION = 1;

const DEFAULT_STATE = {
  version: SCHEMA_VERSION,
  events: [],
  settings: { unit: 'ml', goalMl: null },
};

let state = load();
let view = 'today';
let expandedDay = null; // dayStartMs of the row opened in the 7-day table
let editingId = null;
let initialTime = null; // { day, clock, iso, isNew } so an untouched time on an old entry keeps its exact value

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error('Could not load saved data', err);
  }
  return structuredClone(DEFAULT_STATE);
}

function normalize(data) {
  const base = structuredClone(DEFAULT_STATE);
  if (!data || !Array.isArray(data.events)) throw new Error('Not a Pump Track backup');
  return {
    version: SCHEMA_VERSION,
    events: data.events.filter((e) => e && e.id && e.time),
    settings: { ...base.settings, ...(data.settings || {}) },
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatAmount(ml) {
  if (ml == null || ml === '') return '';
  if (state.settings.unit === 'ml') return `${Math.round(ml)} ml`;
  const oz = Math.round((ml / ML_PER_OZ) * 10) / 10;
  return `${oz} oz`;
}

// The number alone, for big figures where the unit sits beside it.
function amountNumber(ml) {
  return formatAmount(ml).replace(/ (ml|oz)$/, '');
}

function toMl(value) {
  const n = parseFloat(value);
  if (!isFinite(n) || n <= 0) return null;
  return state.settings.unit === 'ml' ? n : n * ML_PER_OZ;
}

function fromMl(ml) {
  if (ml == null) return '';
  return state.settings.unit === 'ml' ? Math.round(ml) : Math.round((ml / ML_PER_OZ) * 10) / 10;
}

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Clock time, with the day added when it wasn't today (e.g. "Yesterday 11:40 PM").
function formatWhen(date) {
  const label = dayLabel(date, true);
  return label === 'Today' ? formatTime(date) : `${label} ${formatTime(date)}`;
}

// "just now", "45m ago", "3h 10m ago"
function formatAgo(date) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h >= 48) return `${Math.floor(h / 24)} days ago`;
  return `${h}h ${mins % 60}m ago`;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(date, short = false) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  if (short) return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function describe(e) {
  const parts = [e.amountMl ? formatAmount(e.amountMl) : 'No amount'];
  if (e.minutes) parts.push(`${e.minutes} min`);
  return parts.join(' · ');
}

// Newest first. Times are on the quarter hour, so entries in the same slot fall back to
// when they were logged.
function sortedEvents() {
  return [...state.events].sort((a, b) => new Date(b.time) - new Date(a.time) || (b.createdAt || 0) - (a.createdAt || 0));
}

const QUARTER_MS = 15 * 60 * 1000;

function nearestQuarter(date) {
  return new Date(Math.round(new Date(date).getTime() / QUARTER_MS) * QUARTER_MS);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function eventsIn(start, end) {
  return state.events.filter((e) => {
    const t = new Date(e.time);
    return t >= start && t < end;
  });
}

function totals(events) {
  const withAmount = events.filter((e) => e.amountMl);
  const ml = withAmount.reduce((sum, e) => sum + e.amountMl, 0);
  return { pumps: events.length, ml, avg: withAmount.length ? ml / withAmount.length : 0 };
}

// Fills the day and quarter-hour pickers. `extra` keeps an old entry's off-quarter time selectable.
function fillTimePickers(date, extra) {
  const d = new Date(date);
  const selectedDay = toLocalInput(d).slice(0, 10);
  const selectedClock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const days = [];
  const first = startOfDay(nearestQuarter(new Date()));
  for (let i = 0; i < WEEK_DAYS; i++) days.push(addDays(first, -i));
  if (!days.some((x) => toLocalInput(x).slice(0, 10) === selectedDay)) days.push(startOfDay(d));
  $('#time-day').innerHTML = days.map((x) => {
    const value = toLocalInput(x).slice(0, 10);
    return `<option value="${value}"${value === selectedDay ? ' selected' : ''}>${dayLabel(x, true)}</option>`;
  }).join('');

  const clocks = [];
  for (let m = 0; m < 24 * 60; m += 15) clocks.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  if (extra && !clocks.includes(selectedClock)) clocks.push(selectedClock), clocks.sort();
  const label = (hhmm) => formatTime(new Date(`2000-01-01T${hhmm}`));
  $('#time-clock').innerHTML = clocks.map((c) =>
    `<option value="${c}"${c === selectedClock ? ' selected' : ''}>${label(c)}</option>`
  ).join('');
  return { day: selectedDay, clock: selectedClock };
}

function toast(message, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.onclick = () => { action.run(); el.classList.remove('show'); };
    el.append(btn);
  }
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
}

// ---------- rendering ----------

function render() {
  renderHero();
  renderView();
}

function renderHero() {
  const now = Date.now();
  const last = sortedEvents()[0];
  const midnight = startOfDay(new Date());
  const today = totals(eventsIn(midnight, addDays(midnight, 1)));
  const recent = state.events.filter((e) => new Date(e.time) >= now - DAY_MS);
  const day = totals(recent);
  const unit = state.settings.unit;
  const avg = (t) => (t.avg ? amountNumber(t.avg) : '—');

  $('#hero').innerHTML = `
    <article class="hero-card">
      <div class="hero-top">
        ${ringHtml(today.ml)}
        <div class="last">
          <span class="label">Last pump</span>
          <strong>${last ? formatWhen(last.time) : '—'}</strong>
          <span class="detail">${last ? `${formatAgo(last.time)} · ${escapeHtml(describe(last))}` : 'Nothing logged yet'}</span>
        </div>
      </div>

      <table class="stat-table">
        <thead><tr><th></th><th>Pumps</th><th>Total<small>${unit}</small></th><th>Avg / pump<small>${unit}</small></th></tr></thead>
        <tbody>
          <tr><th>Today</th><td>${today.pumps}</td><td>${today.ml ? amountNumber(today.ml) : '—'}</td><td>${avg(today)}</td></tr>
          <tr><th>Last 24h</th><td>${day.pumps}</td><td>${day.ml ? amountNumber(day.ml) : '—'}</td><td>${avg(day)}</td></tr>
        </tbody>
      </table>

      ${chartHtml(recent)}

      <button class="btn log-btn" data-log>＋ Log a pump</button>
    </article>`;
}

// Today's total in a ring that fills toward the daily goal (a full ring when no goal is set).
function ringHtml(todayMl) {
  const goal = state.settings.goalMl;
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = goal ? Math.min(1, todayMl / goal) : 1;
  const caption = goal
    ? (todayMl >= goal ? 'goal reached ✨' : `of ${formatAmount(goal)}`)
    : 'today';
  return `
    <div class="ring${goal && todayMl >= goal ? ' done' : ''}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color:var(--pink)"/>
            <stop offset="1" style="stop-color:var(--lilac)"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="${r}" class="track"/>
        <circle cx="60" cy="60" r="${r}" class="fill" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}"/>
      </svg>
      <div class="ring-text">
        <b>${todayMl ? amountNumber(todayMl) : '0'}<small>${state.settings.unit}</small></b>
        <span>${escapeHtml(caption)}</span>
      </div>
    </div>`;
}

// Last-24h pumps as columns on a time axis: height is the amount, position is when it happened.
// Pumps with no amount show as a dot on the baseline. Tap a mark for its details.
function chartHtml(pumps) {
  const start = Date.now() - DAY_MS;
  const step = state.settings.unit === 'ml' ? 30 : ML_PER_OZ;
  const maxMl = Math.max(step * 4, ...pumps.map((e) => e.amountMl || 0));
  const topMl = Math.ceil(maxMl / step) * step;
  const marks = [...pumps].sort((a, b) => new Date(a.time) - new Date(b.time)).map((e) => {
    const x = Math.min(97, Math.max(3, ((new Date(e.time) - start) / DAY_MS) * 100));
    const tip = `${formatTime(e.time)} · ${describe(e)}`;
    const h = e.amountMl ? (e.amountMl / topMl) * 100 : 0;
    return `<button type="button" class="bar${e.amountMl ? '' : ' no-ml'}" style="left:${x.toFixed(2)}%" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"><span style="height:${h.toFixed(1)}%"></span></button>`;
  }).join('');
  return `
    <div class="chart">
      <div class="chart-head"><span>Every pump, last 24h</span></div>
      <div class="plot">${marks || '<span class="plot-empty">Your pumps will show up here 💕</span>'}</div>
      <div class="chart-axis"><span>24h ago</span><span>now</span></div>
    </div>`;
}

function showTip(bar) {
  const chart = bar.closest('.chart');
  const axis = $('.chart-axis', chart);
  $$('.bar.active', chart).forEach((b) => b.classList.remove('active'));
  bar.classList.add('active');
  axis.innerHTML = `<span class="tip">${escapeHtml(bar.dataset.tip)}</span>`;
  clearTimeout(showTip.timer);
  showTip.timer = setTimeout(() => {
    bar.classList.remove('active');
    axis.innerHTML = '<span>24h ago</span><span>now</span>';
  }, 4000);
}

function renderView() {
  $$('#view button').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.view === view));
  $('#history-content').innerHTML = view === 'today' ? todayHtml() : weekHtml();
}

function entryListHtml(events) {
  if (!events.length) return '<p class="empty">No pumps.</p>';
  return `<ul class="entries">${events.map((e) => `
    <li><button class="entry" data-edit="${e.id}">
      <time>${formatTime(e.time)}</time>
      <span class="drop" aria-hidden="true"></span>
      <span class="desc">${escapeHtml(describe(e))}${e.note ? `<small>${escapeHtml(e.note)}</small>` : ''}</span>
    </button></li>`).join('')}</ul>`;
}

function todayHtml() {
  const start = startOfDay(new Date());
  const today = sortedEvents().filter((e) => new Date(e.time) >= start && new Date(e.time) < addDays(start, 1));
  return today.length
    ? entryListHtml(today)
    : '<p class="empty">Nothing logged today yet.<br>Tap ＋ Log a pump to start 🌸</p>';
}

function weekHtml() {
  const today = startOfDay(new Date());
  const rows = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const start = addDays(today, -i);
    const end = addDays(start, 1);
    const events = eventsIn(start, end);
    return { start, end, events, t: totals(events), key: String(start.getTime()) };
  });
  const amount = (ml) => (ml ? amountNumber(ml) : '—');
  const count = (n) => (n ? Math.round(n * 10) / 10 : '—');
  const unit = state.settings.unit;

  // Average completed days since tracking began, so a partial today or days before
  // the first entry don't drag it down. Fall back to today if that's all there is.
  const first = state.events.reduce((min, e) => Math.min(min, new Date(e.time)), Infinity);
  const tracked = rows.filter((r) => r.end > first);
  const counted = tracked.length > 1 ? tracked.slice(1) : tracked;
  const sum = (key) => counted.reduce((s, r) => s + r.t[key], 0);
  const perDay = (key) => (counted.length ? sum(key) / counted.length : 0);
  const withAmount = counted.flatMap((r) => r.events).filter((e) => e.amountMl).length;

  const body = rows.map((r) => {
    const open = expandedDay === r.key;
    const row = `
      <tr class="day-row" data-day="${r.key}" aria-expanded="${open}">
        <th><span class="chev" aria-hidden="true">›</span>${dayLabel(r.start, true)}</th>
        <td>${count(r.t.pumps)}</td>
        <td>${amount(r.t.ml)}</td>
        <td>${amount(r.t.avg)}</td>
      </tr>`;
    if (!open) return row;
    const events = [...r.events].sort((x, y) => new Date(y.time) - new Date(x.time));
    return row + `<tr class="day-detail"><td colspan="4">${entryListHtml(events)}</td></tr>`;
  }).join('');

  return `
    <table class="week-table">
      <thead><tr><th>Day</th><th>Pumps</th><th>Total<small>${unit}</small></th><th>Avg / pump<small>${unit}</small></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <th>Daily avg</th>
        <td>${count(perDay('pumps'))}</td>
        <td>${amount(perDay('ml'))}</td>
        <td>${amount(withAmount && sum('ml') / withAmount)}</td>
      </tr></tfoot>
    </table>
    <p class="hint">Tap a day to see or edit its pumps. Daily avg covers full days only.</p>`;
}

// ---------- entry dialog ----------

function setSeg(container, value) {
  $$('button', container).forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.value === value));
}

function openEntry(event) {
  editingId = event ? event.id : null;
  const unit = state.settings.unit;
  const dlg = $('#entry-dialog');

  $('#entry-title').textContent = event ? 'Edit pump' : 'Log a pump';
  $$('.unit-label').forEach((el) => (el.textContent = unit));
  const amount = $('#amount');
  amount.step = unit === 'ml' ? '5' : '0.5';
  // A new pump starts from the last amount, since sessions tend to be similar.
  const lastMl = sortedEvents().find((e) => e.amountMl)?.amountMl;
  amount.value = event ? fromMl(event.amountMl) : fromMl(lastMl) || '';
  const presets = unit === 'ml' ? [30, 60, 90, 120, 150, 180] : [1, 2, 3, 4, 5, 6];
  $('#amount-presets').innerHTML = presets.map((p) => `<button type="button" data-preset="${p}">${p} ${unit}</button>`).join('');

  $('#minutes').value = event?.minutes ?? '';
  const when = event ? new Date(event.time) : nearestQuarter(new Date());
  initialTime = { ...fillTimePickers(when, !!event), iso: when.toISOString(), isNew: !event };
  $('#note').value = event?.note || '';
  $('#delete-btn').hidden = !event;

  dlg.showModal();
  dlg.querySelector('form').scrollTop = 0;
}

function saveEntry() {
  const amountMl = toMl($('#amount').value);
  const mins = parseInt($('#minutes').value, 10);
  if (!amountMl && !(mins > 0)) {
    toast('Add an amount or the minutes');
    return false;
  }
  const day = $('#time-day').value;
  const clock = $('#time-clock').value;
  const untouched = day === initialTime.day && clock === initialTime.clock;
  // Save what the pickers show; an old entry's exact time is kept unless it was changed.
  const time = untouched && !initialTime.isNew ? initialTime.iso : new Date(`${day}T${clock}`).toISOString();

  const entry = {
    id: editingId || uid(),
    time,
    createdAt: editingId ? state.events.find((e) => e.id === editingId)?.createdAt : Date.now(),
    amountMl: amountMl ?? undefined,
    minutes: mins > 0 ? mins : undefined,
    note: $('#note').value.trim() || undefined,
  };
  writeEvents([entry]);
  toast(editingId ? 'Pump updated' : 'Saved 💕');
  return true;
}

function deleteEntry(id) {
  const removed = state.events.find((e) => e.id === id);
  if (!removed) return;
  removeEvent(id);
  toast('Pump deleted', { label: 'Undo', run: () => writeEvents([removed]) });
}

// ---------- settings ----------

function openSettings() {
  fillSettings();
  $('#settings-dialog').showModal();
}

function fillSettings() {
  setSeg($('#settings-dialog .seg[data-field="unit"]'), state.settings.unit);
  $$('.unit-label').forEach((el) => (el.textContent = state.settings.unit));
  $('#goal').step = state.settings.unit === 'ml' ? '10' : '0.5';
  $('#goal').value = state.settings.goalMl ? fromMl(state.settings.goalMl) : '';
  $('#app-version').textContent = APP_VERSION;
  renderAccount();
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return toLocalInput(new Date()).slice(0, 10);
}

function exportCsv(events) {
  const rows = [['date', 'time', 'amount_ml', 'amount_oz', 'minutes', 'note']];
  const oldestFirst = [...events].sort((a, b) => new Date(a.time) - new Date(b.time));
  for (const e of oldestFirst) {
    const d = new Date(e.time);
    rows.push([
      toLocalInput(d).slice(0, 10),
      toLocalInput(d).slice(11),
      e.amountMl ? Math.round(e.amountMl) : '',
      e.amountMl ? (e.amountMl / ML_PER_OZ).toFixed(1) : '',
      e.minutes || '',
      e.note || '',
    ]);
  }
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  download(`pump-track-${stamp()}.csv`, csv, 'text/csv');
}

// ---------- cloud sync ----------
// With a Firebase config (firebase-config.js), pumps live in Firestore and everyone signed in
// sees the same log live. Without one, everything stays in this browser.
// Either way the in-memory state is mirrored to localStorage so the app opens instantly.

const CLOUD_WINDOW_DAYS = 60; // how far back the live log loads; exports fetch everything
const UPLOADED_KEY = 'pumptrack.uploaded';
const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch
const COLLECTION = 'pumps';
const SHARED_SETTINGS = ['config', 'pump']; // the daily goal, shared between phones

const cloud = { config: window.FIREBASE_CONFIG || null, fb: null, auth: null, db: null, user: null, unsubs: [] };

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function writeEvents(events) {
  for (const e of events) {
    const i = state.events.findIndex((x) => x.id === e.id);
    if (i === -1) state.events.push(e);
    else state.events[i] = e;
  }
  save();
  render();
  if (!cloud.db) return;
  const { writeBatch, doc } = cloud.fb;
  for (const part of chunks(events, BATCH_LIMIT)) {
    const batch = writeBatch(cloud.db);
    for (const e of part) batch.set(doc(cloud.db, COLLECTION, e.id), e);
    // Resolves once the server has it; offline writes wait in the local queue.
    batch.commit().catch(syncError);
  }
}

function removeEvent(id) {
  state.events = state.events.filter((e) => e.id !== id);
  save();
  render();
  if (cloud.db) cloud.fb.deleteDoc(cloud.fb.doc(cloud.db, COLLECTION, id)).catch(syncError);
}

let goalTimer;
function writeGoal() {
  save();
  render();
  if (!cloud.db) return;
  clearTimeout(goalTimer);
  goalTimer = setTimeout(() => {
    cloud.fb.setDoc(cloud.fb.doc(cloud.db, ...SHARED_SETTINGS), { goalMl: state.settings.goalMl ?? null }).catch(syncError);
  }, 400);
}

// Every pump, not just the live window. Used for backups, CSV and erase.
async function allEvents() {
  if (!cloud.db) return state.events;
  const snap = await cloud.fb.getDocs(cloud.fb.collection(cloud.db, COLLECTION));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

function syncError(err) {
  console.error('Sync error', err);
  if (err?.code === 'permission-denied') showGate('denied');
  else toast(`Sync problem: ${err?.code || err?.message || err}`);
}

function showGate(kind, detail) {
  const email = detail || cloud.user?.email || 'This account';
  const messages = {
    signin: 'Sign in with your Google account to see and add to your pumping log.',
    denied: `${email} isn't on the family list. Ask whoever set up Pump Track to add it, or use a different account.`,
    error: `Sign-in didn't work: ${detail}`,
  };
  $('#gate-msg').textContent = messages[kind];
  $('#signin-btn').hidden = kind === 'denied';
  $('#switch-btn').hidden = kind !== 'denied';
  $('#gate').hidden = false;
}

function renderAccount() {
  const signedIn = !!(cloud.db && cloud.user);
  $('#account').hidden = !signedIn;
  if (signedIn) $('#account-email').textContent = `Signed in as ${cloud.user.email}`;
  $('#storage-hint').textContent = signedIn
    ? 'Pumps sync to everyone signed in to the family log.'
    : 'Pumps are saved only on this device. Export a backup now and then.';
  $('#clear-data').textContent = signedIn ? 'Erase all (everyone)' : 'Erase all';
}

function renderOnline() {
  $('#offline').hidden = !cloud.db || navigator.onLine;
}

async function signIn() {
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = cloud.fb;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(cloud.auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(cloud.auth, provider);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showGate('error', err.code || err.message);
    }
  }
}

function stopListening() {
  cloud.unsubs.forEach((unsub) => unsub());
  cloud.unsubs = [];
}

function listen() {
  stopListening();
  const { onSnapshot, query, collection, where, doc } = cloud.fb;
  const since = addDays(startOfDay(new Date()), -CLOUD_WINDOW_DAYS).toISOString();
  cloud.unsubs = [
    onSnapshot(query(collection(cloud.db, COLLECTION), where('time', '>=', since)), (snap) => {
      state.events = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      save();
      render();
    }, syncError),
    onSnapshot(doc(cloud.db, ...SHARED_SETTINGS), (snap) => {
      if (!snap.exists()) return;
      state.settings.goalMl = snap.data().goalMl ?? null;
      save();
      render();
    }, syncError),
  ];
}

// The first time this phone signs in, send up whatever it logged while it was offline-only.
function uploadLocalEntries() {
  if (localStorage.getItem(UPLOADED_KEY)) return;
  localStorage.setItem(UPLOADED_KEY, new Date().toISOString());
  if (!state.events.length) return;
  writeEvents([...state.events]);
  toast(`Uploaded ${state.events.length} pumps from this phone`);
}

async function onSignedIn(user, db) {
  cloud.user = user;
  const settingsRef = cloud.fb.doc(db, ...SHARED_SETTINGS);
  let snap = null;
  try {
    snap = await cloud.fb.getDoc(settingsRef); // also confirms this account is on the family list
  } catch (err) {
    if (err.code === 'permission-denied') return showGate('denied', user.email);
    // Offline with nothing cached yet: carry on, the listeners catch up when back online.
  }
  cloud.db = db;
  $('#gate').hidden = true;
  if (snap && !snap.exists()) cloud.fb.setDoc(settingsRef, { goalMl: state.settings.goalMl ?? null }).catch(syncError);
  uploadLocalEntries();
  listen();
  renderAccount();
  renderOnline();
}

function onSignedOut() {
  stopListening();
  cloud.user = null;
  cloud.db = null;
  renderAccount();
  renderOnline();
  showGate('signin');
}

async function startCloud() {
  const fb = (cloud.fb = await import('./vendor/firebase.js'));
  const app = fb.initializeApp(cloud.config);
  cloud.auth = fb.getAuth(app);
  const db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (window.PUMP_TRACK_EMULATOR) {
    // Local testing against the Firebase emulators.
    fb.connectAuthEmulator(cloud.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    window.__pumpTrack = { fb, auth: cloud.auth };
  }
  fb.getRedirectResult(cloud.auth).catch((err) => showGate('error', err.code || err.message));
  fb.onAuthStateChanged(cloud.auth, (user) => (user ? onSignedIn(user, db) : onSignedOut()));
}

// ---------- events ----------

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  const row = !t && ev.target.closest('tr[data-day]');
  if (row) {
    expandedDay = expandedDay === row.dataset.day ? null : row.dataset.day;
    renderView();
    return;
  }
  if (!t) return;

  if (t.hasAttribute('data-log')) return openEntry();
  if (t.dataset.tip) return showTip(t);
  if (t.dataset.edit) {
    const e = state.events.find((x) => x.id === t.dataset.edit);
    if (e) openEntry(e);
    return;
  }
  if (t.dataset.view) {
    view = t.dataset.view;
    renderView();
    return;
  }
  if (t.hasAttribute('data-close')) return t.closest('dialog').close();

  if (t.closest('#entry-dialog')) {
    if (t.dataset.preset) {
      $('#amount').value = t.dataset.preset;
      return;
    }
    if (t.dataset.step) {
      const amount = $('#amount');
      const step = parseFloat(amount.step);
      const next = (parseFloat(amount.value) || 0) + step * Number(t.dataset.step);
      amount.value = Math.max(0, Math.round(next / step) * step);
      return;
    }
  }

  const settingsSeg = t.closest('#settings-dialog .seg[data-field="unit"]');
  if (settingsSeg && t.dataset.value) {
    state.settings.unit = t.dataset.value;
    save();
    render();
    fillSettings(); // show the goal in the new unit
  }
});

document.addEventListener('pointerover', (ev) => {
  const bar = ev.pointerType === 'mouse' && ev.target.closest('.bar');
  if (bar) showTip(bar);
});

$('#entry-form').addEventListener('submit', (ev) => {
  if (!saveEntry()) ev.preventDefault();
});

$('#delete-btn').addEventListener('click', () => {
  const id = editingId;
  $('#entry-dialog').close();
  deleteEntry(id);
});

$('#settings-btn').addEventListener('click', openSettings);

$('#goal').addEventListener('input', (ev) => {
  state.settings.goalMl = toMl(ev.target.value);
  writeGoal();
});

$('#export-json').addEventListener('click', async () => {
  try {
    const data = { ...state, events: await allEvents() };
    download(`pump-track-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  } catch (err) {
    syncError(err);
  }
});

$('#export-csv').addEventListener('click', async () => {
  try {
    exportCsv(await allEvents());
  } catch (err) {
    syncError(err);
  }
});

$('#import-json').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`Add the ${data.events.length} pumps from this backup? Pumps already here are kept.`)) return;
    if (data.settings.goalMl) {
      state.settings.goalMl = data.settings.goalMl;
      writeGoal();
    }
    writeEvents(data.events);
    fillSettings();
    toast('Backup restored');
  } catch (err) {
    alert(`Couldn't read that file: ${err.message}`);
  }
});

$('#clear-data').addEventListener('click', async () => {
  const msg = cloud.db
    ? 'Erase every pump for everyone in the family log? This cannot be undone.'
    : 'Erase every pump on this device? This cannot be undone.';
  if (!confirm(msg)) return;
  try {
    const events = await allEvents();
    if (cloud.db) {
      for (const part of chunks(events, BATCH_LIMIT)) {
        const batch = cloud.fb.writeBatch(cloud.db);
        for (const e of part) batch.delete(cloud.fb.doc(cloud.db, COLLECTION, e.id));
        batch.commit().catch(syncError);
      }
    }
    state.events = [];
    save();
    render();
    toast('All pumps erased');
  } catch (err) {
    syncError(err);
  }
});

$('#signin-btn').addEventListener('click', signIn);
$('#switch-btn').addEventListener('click', () => cloud.fb.signOut(cloud.auth).then(signIn));
$('#signout-btn').addEventListener('click', () => {
  if (!confirm('Sign out? You will need to sign in again to see the family log.')) return;
  $('#settings-dialog').close();
  cloud.fb.signOut(cloud.auth);
});
window.addEventListener('online', renderOnline);
window.addEventListener('offline', renderOnline);

// Close dialogs when tapping the backdrop.
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg) dlg.close();
  });
});

// Keep in sync if the app is open in another tab (cloud mode syncs through Firestore instead).
window.addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY && !cloud.db) {
    state = load();
    render();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render();
  // Home-screen apps resume rather than reload, so look for an update each time we come back.
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
});

// Re-render each minute so "2h 10m ago" ticks along and "Today" rolls over after midnight.
setInterval(render, 60 * 1000);

render();

if (cloud.config) {
  startCloud().catch((err) => {
    console.error('Could not start sync', err);
    showGate('error', err.message);
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .catch((err) => console.warn('Service worker failed', err));
  // A new version took over: reload once so the new files are in use. Skip on first install.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}
