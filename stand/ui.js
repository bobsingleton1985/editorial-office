import { World, defaultConfig, NEEDS, NEED_LABEL, TRAITS, TRAIT_LABEL, IDS, SPOTS, CATALOG, ACTIONS, hhmm, dayOf } from './sim.js';

const $ = id => document.getElementById(id);
const COLOR = { editor: '#8a5a2b', reporter: '#2f6f8f', columnist: '#7b3f8c', heroine: '#c0392b' };
const SERIES = { fatigue: '#8a5a2b', boredom: '#9aa13a', social: '#2f6f8f', recognition: '#d08a1c', fun: '#c0392b', coffee: '#5b3a1e', nicotine: '#6d6d6d', alcohol: '#b5651d', stress: '#e0412f', intox: '#7b3f8c' };
const SERIES_LABEL = { ...NEED_LABEL, stress: 'Стресс', intox: 'Опьянение' };
const MAX_SPEED = 86400 / 5;   // сутки за 5 секунд

let config = defaultConfig();
let world = new World(config);
let generation = 0;
let running = false;
let speed = 1;
const inflight = new Set();
const bubbleSeen = new Map();
let tab = 'editor';
let graphChar = 'editor';
const shownSeries = new Set(['fatigue', 'boredom', 'social', 'stress', 'intox']);
let realRate = { simMin: 0, realS: 0, value: 0 };
let journalDirty = true;

// ---------- сервер ----------
// Страница может быть открыта с GitHub Pages: тогда Jev доступен только через сервер стенда на Mac владельца.
const API = location.port === '8781' ? '' : 'http://127.0.0.1:8781';
async function api(path, body) {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  let data = {}; try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}
async function boot() {
  buildTabs(); buildGraphControls(); buildJournalControls();
  requestAnimationFrame(frame);
  if (API) setStatus('Подключаюсь к серверу стенда на Mac… Если браузер спросит про доступ к локальной сети — разрешите.');
  let saved;
  try { saved = await api('/api/stand-config'); }
  catch { setStatus('Стенд работает только на Mac владельца: сервер стенда (порт 8781) недоступен.'); return; }
  setStatus('');
  if (saved.ok && saved.data.config) { config = mergeDefaults(saved.data.config); world = new World(config); buildTabs(); buildGraphControls(); buildJournalControls(); }
  $('cap').value = config.jevCallCap;
  await api('/api/stand-run', { cap: config.jevCallCap });
  const st = await api('/api/stand-status');
  if (!st.data.configured) setStatus('Нет ключа Jev: ' + (st.data.key_error || ''));
}
function mergeDefaults(c) {
  const d = defaultConfig();
  const out = { ...d, ...c, archie: { ...d.archie, ...c.archie }, forgetting: { ...d.forgetting, ...c.forgetting }, catalog: { ...d.catalog, ...c.catalog } };
  out.characters = Object.fromEntries(IDS.map(id => [id, { ...d.characters[id], ...(c.characters?.[id] || {}), traits: { ...d.characters[id].traits, ...(c.characters?.[id]?.traits || {}) }, rates: { ...d.characters[id].rates, ...(c.characters?.[id]?.rates || {}) } }]));
  out.sympathy = { ...d.sympathy, ...c.sympathy }; out.attraction = { ...d.attraction, ...c.attraction };
  return out;
}
function setStatus(t) { $('status').textContent = t || ''; }

// ---------- решения Jev ----------
function dispatchDecisions() {
  for (const id of world.pendingDecisions()) {
    if (inflight.has(id)) continue;
    inflight.add(id);
    const gen = generation, snap = world.snapshot(id);
    api('/api/stand-decide', { snapshot: snap }).then(res => {
      inflight.delete(id);
      if (gen !== generation) return;
      $('calls').textContent = res.data.calls ?? $('calls').textContent;
      if (res.ok) {
        const probs = Object.entries(res.data.probabilities || {}).sort((a, b) => b[1] - a[1]);
        const label = aid => snap.available_actions.find(a => a.id === aid)?.description || aid;
        const alts = probs.filter(([a]) => a !== res.data.action).slice(0, 3).map(([a, p]) => `${label(a)} ${Math.round(p * 100)}%`).join(' · ');
        world.apply(id, res.data.action, { confidence: res.data.confidence, alts, ms: res.data.ms, why: snap.why_deciding_now, options: snap.available_actions.length });
      } else if (res.status === 429) {
        running = false; $('play').textContent = '▶ Пуск'; setStatus(`Достигнут потолок вызовов Jev (${res.data.cap}). Поднимите потолок, чтобы продолжить.`);
      } else if (res.status === 409) {
        running = false; $('play').textContent = '▶ Пуск'; setStatus('Нет ключа Jev: ' + (res.data.detail || ''));
      } else {
        const c = world.chars[id];
        world.log(id, 'event', `⚠️ Jev не ответил (${res.data.error || res.status}) — ${c.name} пережидает 10 мин.`);
        c.needsDecision = false; world._setActivity(id, 'idle', c.spot, 10);
      }
      journalDirty = true;
    }).catch(() => { inflight.delete(id); setStatus('Сервер стенда недоступен'); running = false; });
  }
}

// ---------- цикл ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (running) {
    const pending = world.pendingDecisions();
    if (pending.length) dispatchDecisions();
    else {
      const t0 = world.t;
      world.advance(Math.min(90, dt * speed / 60));
      realRate.simMin += world.t - t0;
      journalDirty = journalDirty || world.journal.length !== lastJournalLen;
    }
    realRate.realS += dt;
    if (realRate.realS >= 1) { realRate.value = realRate.simMin * 60 / realRate.realS; realRate = { simMin: 0, realS: 0, value: realRate.value }; }
  }
  draw(now);
  requestAnimationFrame(frame);
}
let lastJournalLen = 0;

// ---------- отрисовка ----------
function draw(now) {
  $('clock').textContent = `день ${dayOf(world.t)} · ${hhmm(world.t)}`;
  $('realSpeed').textContent = running ? fmtSpeed(realRate.value) : '—';
  $('thinking').textContent = inflight.size ? '🤔 думают: ' + [...inflight].map(id => world.chars[id].name).join(', ') : '';
  drawOffice(now); drawGraph(); drawRelations();
  if (journalDirty || world.journal.length !== lastJournalLen) { drawJournal(); journalDirty = false; lastJournalLen = world.journal.length; }
}
function fmtSpeed(v) {
  if (!v) return '0×';
  const day = 86400 / v;
  const dayTxt = day >= 3600 ? (day / 3600).toFixed(1) + ' ч' : day >= 60 ? Math.round(day / 60) + ' мин' : day.toFixed(1) + ' с';
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)}× (сутки за ${dayTxt})`;
}

function fitCanvas(cv) {
  const r = devicePixelRatio || 1;
  if (!cv._h) cv._h = +cv.getAttribute('height');
  const w = cv.clientWidth;
  if (cv._w !== w || cv._r !== r) { cv.width = w * r; cv.height = cv._h * r; cv.style.height = cv._h + 'px'; cv._w = w; cv._r = r; }
  const ctx = cv.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); return { ctx, w, h: cv._h };
}

function drawOffice(now) {
  const { ctx, w, h } = fitCanvas($('office'));
  const hour = (world.t % 1440) / 60, night = hour < 7 || hour >= 21;
  ctx.fillStyle = night ? '#e6dccb' : '#f7f1e6'; ctx.fillRect(0, 0, w, h);
  const sx = (w - 30) / 12.6, sy = (h - 40) / 8, S = Math.min(sx, sy);
  const ox = (w - 12.6 * S) / 2, oy = 22;
  const P = p => [ox + p.x * S, oy + p.y * S];
  ctx.strokeStyle = '#b8a88f'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, 12.4 * S, 7.8 * S);
  ctx.font = '11px -apple-system, Arial'; ctx.textAlign = 'center';
  for (const [k, s] of Object.entries(SPOTS)) {
    const [x, y] = P(s);
    ctx.fillStyle = k.startsWith('desk') ? '#d9c6a5' : '#e9dfcf';
    const bw = k.startsWith('desk') ? 1.4 * S : k === 'bench' ? 1.8 * S : 0.8 * S, bh = k.startsWith('desk') ? 0.8 * S : 0.5 * S;
    ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.fillStyle = '#8c7d69'; ctx.fillText(s.label + (k === 'record' && world.music ? ' ♪' : '') + (k === 'phone' && world.phone ? ' 📞' : '') + (k === 'teletype' && world.tapes ? ` (${world.tapes})` : ''), x, y + bh / 2 + 12);
  }
  // персонажи
  const placed = [];
  for (const id of IDS) {
    const c = world.chars[id]; if (!c.present) continue;
    const p = world.livePos(id); let [x, y] = P(p);
    for (const q of placed) if (Math.hypot(q[0] - x, q[1] - y) < 24) { x += 26; y += 14; }
    placed.push([x, y]);
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = COLOR[id]; ctx.globalAlpha = c.asleep ? 0.45 : 1; ctx.fill(); ctx.globalAlpha = 1;
    if (inflight.has(id)) { ctx.strokeStyle = '#e8a33c'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = '600 11px -apple-system, Arial'; ctx.fillText(c.name[0], x, y + 4);
    ctx.fillStyle = '#2b2520'; ctx.font = '11px -apple-system, Arial';
    const act = c.asleep ? '💤 спит ' + (c.activity?.where || '') : c.activity ? ACTIONS[c.activity.type].label : (c.needsDecision ? 'решает…' : '');
    ctx.fillText(act, x, y - 16);
    // облачка: держим 2,5 с реального времени
    const b = [...world.bubbles].reverse().find(b => b.char === id);
    if (b) {
      if (!bubbleSeen.has(b)) bubbleSeen.set(b, now);
      if (now - bubbleSeen.get(b) < 2500) {
        ctx.font = '16px -apple-system, Arial'; const tw = ctx.measureText(b.icon).width + 12;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2520'; ctx.lineWidth = 1;
        roundRect(ctx, x + 10, y - 44, tw, 24, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2520'; ctx.textAlign = 'left'; ctx.fillText(b.icon, x + 16, y - 26); ctx.textAlign = 'center';
      }
    }
  }
  if (!world.chars.heroine.present) { ctx.fillStyle = '#8c7d69'; ctx.textAlign = 'right'; ctx.fillText('героиня не в редакции', w - 12, h - 8); ctx.textAlign = 'center'; }
  $('evHeroine').textContent = world.chars.heroine.present ? '💃 Героиня уходит' : '💃 Героиня пришла';
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawGraph() {
  const { ctx, w, h } = fitCanvas($('graph'));
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  const hist = world.history, t1 = world.t, t0 = t1 - 1440;
  const X = t => 34 + (t - t0) / 1440 * (w - 44), Y = v => 8 + (100 - v) / 100 * (h - 26);
  ctx.strokeStyle = '#eee'; ctx.fillStyle = '#999'; ctx.font = '10px -apple-system, Arial'; ctx.textAlign = 'right';
  for (const v of [0, 50, 100]) { ctx.beginPath(); ctx.moveTo(34, Y(v)); ctx.lineTo(w - 10, Y(v)); ctx.stroke(); ctx.fillText(v, 30, Y(v) + 3); }
  ctx.textAlign = 'center';
  for (let k = Math.ceil(t0 / 180) * 180; k <= t1; k += 180) { ctx.fillText(hhmm(k), X(k), h - 4); }
  const dh = (config.deadlineHour * 60), dayStart = Math.floor(t1 / 1440) * 1440;
  for (const dl of [dayStart + dh - 1440, dayStart + dh]) if (dl > t0 && dl <= t1) { ctx.strokeStyle = '#e0412f55'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(dl), 8); ctx.lineTo(X(dl), h - 18); ctx.stroke(); ctx.setLineDash([]); }
  for (const s of shownSeries) {
    ctx.strokeStyle = SERIES[s]; ctx.lineWidth = s === 'stress' || s === 'intox' ? 2 : 1.5; ctx.beginPath(); let started = false;
    for (const p of hist) { if (p.t < t0) continue; const c = p.c[graphChar]; if (!c.present) { started = false; continue; } const x = X(p.t), y = Y(c[s]); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
    ctx.stroke();
  }
}

function drawRelations() {
  const el = $('rel'); if (el._t === Math.floor(world.t) && el._n === world.journal.length) return;
  el._t = Math.floor(world.t); el._n = world.journal.length;
  let html = '<table><tr><th></th>' + IDS.map(o => `<th><span class="dot" style="background:${COLOR[o]}"></span>${world.chars[o].name}</th>`).join('') + '</tr>';
  for (const a of IDS) {
    html += `<tr><td><span class="dot" style="background:${COLOR[a]}"></span>${world.chars[a].name}</td>`;
    for (const b of IDS) {
      if (a === b) { html += '<td>—</td>'; continue; }
      const c = world.chars[a], s = Math.round(world.effSym(a, b)), at = c.attraction[b], j = c.jealousy[b];
      html += `<td><b style="color:${s < 0 ? '#b0392f' : '#3f7d4e'}">${s > 0 ? '+' : ''}${s}</b>${at !== undefined ? ' · ❤️' + Math.round(at) : ''}${j > 1 ? ' · 💢' + Math.round(j) : ''}</td>`;
    }
    html += '</tr>';
  }
  const debts = world.debts.map(d => `${world.chars[d.from].name} должен: ${world.chars[d.to].name}`);
  el.innerHTML = html + '</table>' + `<p class="note">${debts.length ? '💵 ' + debts.join('; ') : 'Долгов нет.'} ${world.news.length ? ' · Последний пост: «' + esc(world.news.at(-1).text) + '»' : ''}</p>`;
}

function drawJournal() {
  const f = $('jFilter').value, who = $('jChar').value;
  const rows = world.journal.filter(j => (f === 'all' || (f === 'decision' ? j.kind === 'decision' : j.kind !== 'decision')) && (!who || j.char === who)).slice(-300).reverse();
  $('journal').innerHTML = rows.map(j => {
    const cn = j.char ? world.chars[j.char].name : '', name = j.char ? `<span class="dot" style="background:${COLOR[j.char]}"></span>` + (j.text.startsWith(cn) || j.text.startsWith('💢') || j.text.startsWith('💵') ? '' : `<b>${cn}</b> `) : '';
    const conf = j.kind === 'decision' && j.confidence !== undefined ? ` <span class="note">${Math.round(j.confidence * 100)}%</span>` : '';
    const alt = j.kind === 'decision' ? `<span class="alt">${j.why ? 'повод: ' + esc(j.why) + '. ' : ''}${j.alts ? 'иначе: ' + esc(j.alts) : ''}</span>` : '';
    return `<div class="jrow ${j.kind}"><span class="t">${j.day}·${j.time}</span>${name}${esc(j.text)}${conf}${alt}</div>`;
  }).join('');
  const day = world.journal.filter(j => j.kind === 'decision' && j.t > world.t - 1440).length;
  const span = Math.min(1440, world.t - config.startHour * 60);
  const perDay = span > 60 ? Math.round(day * 1440 / span) : '—';
  $('rate').textContent = `Решений Jev за последние сутки: ${day} (темп ≈ ${perDay} в сутки; живой лимит — 400).`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- настройки ----------
function buildTabs() {
  const tabs = [...IDS.map(id => [id, config.characters[id].name]), ['world', 'Мир'], ['catalog', 'Действия']];
  $('tabs').innerHTML = tabs.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('');
  $('tabs').onclick = e => { const t = e.target.dataset.t; if (t) { tab = t; buildTabs(); } };
  buildPane();
}
function slider(label, get, set, min, max, step = 1, hint = '') {
  const id = 's' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const el = $(id); if (!el) return;
    el.oninput = () => { set(+el.value); el.nextElementSibling.textContent = el.value; onConfigChange(); };
  });
  return `<div class="row" title="${esc(hint)}"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${get()}"><output>${get()}</output></div>`;
}
function buildPane() {
  const p = $('pane');
  if (IDS.includes(tab)) {
    const c = config.characters[tab];
    let html = `<h3>Кто это</h3><textarea id="bio">${esc(c.bio)}</textarea><div class="row" style="grid-template-columns:118px 1fr"><span>Длинная цель</span><input type="text" id="goal" value="${esc(c.goal)}"></div>`;
    html += '<h3>Черты (0–100)</h3>' + TRAITS.map(k => slider(TRAIT_LABEL[k], () => c.traits[k], v => c.traits[k] = v, 0, 100)).join('');
    html += '<h3>Рост потребностей (пунктов в час)</h3>' + NEEDS.map(k => slider(NEED_LABEL[k], () => c.rates[k], v => c.rates[k] = v, 0, 25, 0.5)).join('');
    html += '<h3>Реакции</h3>' + slider('Чувствительность к стрессу', () => c.stressSensitivity, v => c.stressSensitivity = v, 0, 100, 1, 'Насколько стресс разгоняет тягу к сигарете и виски') + slider('Устойчивость к алкоголю', () => c.tolerance, v => c.tolerance = v, 0, 100, 1, 'Чем выше, тем быстрее трезвеет');
    html += '<h3>Базовое отношение к другим</h3>' + IDS.filter(o => o !== tab).map(o => slider('Симпатия: ' + config.characters[o].name, () => config.sympathy[tab][o] ?? 0, v => { config.sympathy[tab][o] = v; world.chars[tab].sympathy[o] = v; }, -100, 100)).join('');
    const att = Object.keys(config.attraction[tab] || {});
    if (att.length) html += '<h3>Базовое влечение</h3>' + att.map(o => slider('Влечение: ' + config.characters[o].name, () => config.attraction[tab][o], v => { config.attraction[tab][o] = v; world.chars[tab].attraction[o] = v; }, 0, 100)).join('');
    html += '<p class="note">Черты, скорости и реакции применяются сразу. Отношения при сдвиге ползунка сразу выставляются в текущий прогон и дальше дрейфуют к этому базовому значению.</p>';
    p.innerHTML = html;
    $('bio').oninput = () => { c.bio = $('bio').value; onConfigChange(); };
    $('goal').oninput = () => { c.goal = $('goal').value; onConfigChange(); };
  } else if (tab === 'world') {
    const F = config.forgetting, A = config.archie;
    p.innerHTML = '<h3>Прогон</h3>' + slider('Seed случайности', () => config.seed, v => config.seed = v, 1, 999, 1, 'Нужен «Новый прогон»') + slider('Старт, час', () => config.startHour, v => config.startHour = v, 0, 23, 1, 'Нужен «Новый прогон»')
      + slider('Темп занятий ×', () => config.tempo, v => config.tempo = v, 0.5, 3, 0.1, 'Множитель длительности занятий: больше — реже решения Jev')
      + '<h3>Редакция</h3>' + slider('Сдача номера, час', () => config.deadlineHour, v => config.deadlineHour = v, 12, 23) + slider('Визит героини, %/вечер', () => config.heroineVisitChance, v => config.heroineVisitChance = v, 0, 100) + slider('Телетайп, раз в N ч', () => config.teletypeEveryHours, v => config.teletypeEveryHours = v, 0.5, 8, 0.5)
      + '<h3>Арчи, минут на этап</h3>' + slider('Скаут', () => A.scout, v => A.scout = v, 1, 90) + slider('Сверка', () => A.match, v => A.match = v, 1, 90) + slider('Карточки', () => A.cards, v => A.cards = v, 1, 90)
      + '<h3>Забывание</h3>' + slider('Симпатия, дней', () => F.sympathyDays, v => F.sympathyDays = v, 0.5, 14, 0.5) + slider('Влечение, дней', () => F.attractionDays, v => F.attractionDays = v, 0.5, 14, 0.5) + slider('Ревность, часов', () => F.jealousyHours, v => F.jealousyHours = v, 0.5, 24, 0.5) + slider('Обида, часов', () => F.grudgeHours, v => F.grudgeHours = v, 1, 72) + slider('Долг, дней', () => F.debtDays, v => F.debtDays = v, 0.5, 7, 0.5)
      + '<p class="note">«Seed» и «Старт» вступают в силу при новом прогоне, остальное — сразу.</p>';
  } else {
    p.innerHTML = '<h3>Какие действия доступны персонажам</h3>' + Object.entries(CATALOG).map(([k, v]) => `<div class="row" style="grid-template-columns:22px 1fr auto"><input type="checkbox" data-k="${k}" ${config.catalog[k] ? 'checked' : ''}><span>${v.label}</span><span class="${v.online ? 'online' : 'plan'}">${v.online ? 'онлайн' : 'план'}</span></div>`).join('')
      + '<p class="note">«Онлайн» — уже есть в живой редакции (или переносится). В стенде можно включить и плановые, чтобы заранее посмотреть на характеры.</p>';
    p.querySelectorAll('input[type=checkbox]').forEach(el => el.onchange = () => { config.catalog[el.dataset.k] = el.checked; onConfigChange(); });
  }
}
function onConfigChange() { world.applyConfig(config); }

function buildGraphControls() {
  $('graphChar').innerHTML = IDS.map(id => `<option value="${id}">${config.characters[id].name}</option>`).join('');
  $('graphChar').onchange = () => graphChar = $('graphChar').value;
  $('graphSeries').innerHTML = Object.keys(SERIES).map(s => `<label><input type="checkbox" data-s="${s}" ${shownSeries.has(s) ? 'checked' : ''}><i style="background:${SERIES[s]}"></i>${SERIES_LABEL[s]}</label>`).join('');
  $('graphSeries').onchange = e => { const s = e.target.dataset.s; e.target.checked ? shownSeries.add(s) : shownSeries.delete(s); };
  $('graphSeries').style.display = 'contents';
}
function buildJournalControls() {
  $('jChar').innerHTML = '<option value="">Все персонажи</option>' + IDS.map(id => `<option value="${id}">${config.characters[id].name}</option>`).join('');
  $('jFilter').onchange = $('jChar').onchange = () => journalDirty = true;
}

// ---------- кнопки ----------
$('play').onclick = () => { running = !running; $('play').textContent = running ? '⏸ Пауза' : '▶ Пуск'; if (running) setStatus(''); };
$('speed').oninput = () => { const k = +$('speed').value / 1000; speed = Math.pow(MAX_SPEED, k); $('speedLabel').textContent = fmtSpeed(speed); };
$('cap').onchange = async () => { const cap = Math.max(1, Math.min(2000, +$('cap').value | 0)); config.jevCallCap = cap; await api('/api/stand-cap', { cap }); setStatus(''); };
$('restart').onclick = async () => {
  generation++; inflight.clear(); bubbleSeen.clear();
  world = new World(config); running = false; $('play').textContent = '▶ Пуск';
  const r = await api('/api/stand-run', { cap: config.jevCallCap }); $('calls').textContent = r.data.calls ?? 0; setStatus(''); journalDirty = true;
};
$('saveCfg').onclick = async () => { const r = await api('/api/stand-config', { config }); setStatus(r.ok ? '' : 'Не удалось сохранить настройки'); if (r.ok) flash('Настройки сохранены в stand-config.json'); };
$('saveLog').onclick = async () => { const r = await api('/api/stand-journal', { config, journal: world.journal, history: world.history }); if (r.ok) flash('Журнал сохранён: ' + r.data.saved); };
$('evPhone').onclick = () => { const t = $('msg').value.trim(); if (!t) return flash('Впишите текст поста'); world.phonePost(t); $('msg').value = ''; journalDirty = true; };
$('evArchie').onclick = () => { const t = $('msg').value.trim() || 'совет по фильму'; if (world.archieRequest(t)) $('msg').value = ''; journalDirty = true; };
$('evHeroine').onclick = () => { world.chars.heroine.present ? world.heroineLeaves('кнопка стенда') : world.heroineArrives('пришла (кнопка стенда)'); journalDirty = true; };
$('evTape').onclick = () => { world.addTape(); journalDirty = true; };
function flash(t) { const s = $('status'); s.style.color = '#b9f3c1'; s.textContent = t; setTimeout(() => { s.textContent = ''; s.style.color = ''; }, 3000); }

$('speedLabel').textContent = fmtSpeed(1);
boot();
