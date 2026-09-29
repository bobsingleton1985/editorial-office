// ☰ panel section «Режиссёр (Jev)»: is the newsroom online, who made the last decision (Jev or the fallback rule), and when.
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function ago(ms) { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return 'только что'; const m = Math.round(s / 60); if (m < 60) return m + ' мин назад'; return Math.round(m / 60) + ' ч назад'; }
// journal: the editor's recent actions and who chose each one (read from the relay, newest first)
const TXT = { continue: 'продолжает' };
function who(e) {
  if (e.source === 'jev') return 'Jev' + (e.confidence != null ? ` · ${Math.round(e.confidence * 100)} %` : '');
  return e.source === 'rule' ? 'правило' : e.source === 'start' ? 'старт' : (e.source || '—');
}
let css = false;
function openJournal(load) {
  if (!css) { css = true; const st = document.createElement('style'); st.textContent = `
    #journal { position:fixed; inset:0; z-index:20; background:rgba(10,8,6,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
    #journal .jb { background:#1f1914; color:#efe6da; border:1px solid rgba(255,255,255,.12); border-radius:14px; width:min(620px,100%); max-height:min(80vh,760px);
      display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.5); font:14px/1.4 -apple-system,"Segoe UI",Roboto,sans-serif; }
    #journal header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px 10px; border-bottom:1px solid rgba(255,255,255,.1); }
    #journal header b { font-weight:600; } #journal header button { background:none; border:0; color:inherit; font-size:18px; cursor:pointer; padding:4px 8px; }
    #journal .jl { overflow:auto; padding:4px 16px 14px; }
    #journal .jr { display:grid; grid-template-columns:3.2em 1fr auto; gap:2px 12px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,.07); }
    #journal .jt { color:#a89a8a; font-variant-numeric:tabular-nums; } #journal .js { color:#a89a8a; font-size:12px; text-align:right; white-space:nowrap; }
    #journal .js.jev { color:#e0913a; } #journal .js.rule { color:#c9a86a; } #journal .ja { grid-column:2 / -1; color:#a89a8a; font-size:12px; }
    #journal .jd { color:#e0913a; font:600 11px/1 -apple-system,"Segoe UI",Roboto,sans-serif; letter-spacing:.1em; text-transform:uppercase; padding:14px 0 4px; }
    #journal .hint { padding:10px 0; }`; document.head.append(st); }
  document.getElementById('journal')?.remove();
  const wrap = el('div'); wrap.id = 'journal';
  const box = el('div', 'jb'), head = el('header'), close = el('button', null, '✕'), list = el('div', 'jl');
  close.setAttribute('aria-label', 'Закрыть'); head.append(el('b', null, '📜 Журнал: что делал редактор'), close); box.append(head, list); wrap.append(box);
  const shut = () => { wrap.remove(); removeEventListener('keydown', esc, true); };
  const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); shut(); } };
  close.addEventListener('click', shut); wrap.addEventListener('click', (ev) => { if (ev.target === wrap) shut(); }); addEventListener('keydown', esc, true);
  list.append(el('div', 'hint', 'Загружаю…')); document.body.append(wrap);
  load().then(({ entries, now }) => {
    list.replaceChildren();
    if (!entries?.length) { list.append(el('div', 'hint', 'Записей пока нет: журнал ведётся с 29.09, пока редакцию смотрят.')); return; }
    const off = Date.now() - (now || Date.now()); let day = '';
    for (const e of entries) {
      const d = new Date(e.at + off), dd = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      if (dd !== day) { day = dd; list.append(el('div', 'jd', dd === new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) ? 'Сегодня' : dd)); }
      const r = el('div', 'jr'), verb = (e.action || '').split('@')[0];
      r.append(el('span', 'jt', d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })),
        el('span', null, (TXT[verb] ? TXT[verb] + ': ' : '') + (e.label || e.action || '—')),
        el('span', 'js ' + (e.source || ''), who(e)));
      const extra = [e.moved ? 'идёт на новое место' : '', e.fatigue != null ? `усталость ${e.fatigue}` : '', ago((now || Date.now()) - e.at)].filter(Boolean).join(' · ');
      r.append(el('span', 'ja', extra)); list.append(r);
    }
    const n = entries.length, w = n % 10 === 1 && n % 100 !== 11 ? 'решение' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'решения' : 'решений';
    list.append(el('div', 'hint', `Последние ${n} ${w}. Jev думает, только пока редакцию кто-то смотрит.`));
  }).catch(() => { list.replaceChildren(el('div', 'hint', 'Журнал не загрузился: нет связи с редакцией.')); });
}

// needs scales: whatever needs the director sends in world.state (today only fatigue; new needs appear here by themselves).
// The director sends values with their rate per minute at the moment of the decision; between decisions the page runs them on.
const NEED = { fatigue: 'Усталость', boredom: 'Скука', social: 'Общение', recognition: 'Признание', fun: 'Развлечение',
  coffee: 'Кофе', nicotine: 'Никотин', alcohol: 'Алкоголь', stress: 'Стресс', drunk: 'Опьянение', hunger: 'Голод' };
let needsCss = false;
function scales(state, now) {
  if (!needsCss) { needsCss = true; const st = document.createElement('style'); st.textContent = `
    #settings .needs { margin:6px 0 10px; } #settings .nd { display:grid; grid-template-columns:1fr auto; gap:3px 8px; margin:8px 0; font-size:13px; }
    #settings .nd .nv { color:var(--muted); font-variant-numeric:tabular-nums; font-size:12px; }
    #settings .nd .nb { grid-column:1 / -1; height:7px; border-radius:4px; background:rgba(255,255,255,.09); overflow:hidden; }
    #settings .nd .nb i { display:block; height:100%; border-radius:4px; background:linear-gradient(90deg,#7fa36b,#e0913a); }
    #settings .nd.hi .nb i { background:linear-gradient(90deg,#e0913a,#d9483b); }
    #settings .nd.task .nb i { background:#8aa7c9; }`; document.head.append(st); }
  const box = el('div', 'needs'), mins = Math.max(0, (now - state.at) / 60000);
  for (const [k, n] of Object.entries(state.needs || {})) {
    const v = Math.max(0, Math.min(100, (n.v ?? 0) + (n.rate ?? 0) * mins)), r = n.rate ?? 0;
    const trend = r > 0 ? ` ↑ +${r}/мин` : r < 0 ? ` ↓ ${r}/мин` : '';
    const row = el('div', 'nd' + (v >= 70 ? ' hi' : '')), bar = el('div', 'nb'), fill = el('i');
    fill.style.width = v.toFixed(1) + '%'; bar.append(fill);
    row.append(el('span', null, NEED[k] || k), el('span', 'nv', `${Math.round(v)} из 100${trend}`), bar); box.append(row);
  }
  const t = state.task;
  if (t) {
    const run = t.working ? Math.max(0, (now - Math.max(state.at, t.from || state.at)) / 60000) : 0, done = Math.min(t.need, t.done + run);
    const row = el('div', 'nd task'), bar = el('div', 'nb'), fill = el('i');
    fill.style.width = (100 * done / t.need).toFixed(1) + '%'; bar.append(fill);
    row.append(el('span', null, `Правка «${t.title}»`), el('span', 'nv', `${done.toFixed(1).replace('.', ',')} из ${t.need} мин${t.working ? '' : ' · отложена'}`), bar); box.append(row);
  }
  box.append(el('div', 'hint', t ? `В очереди ещё ${state.queue ?? 0} ${['сообщение', 'сообщения', 'сообщений'][(q => q % 10 === 1 && q % 100 !== 11 ? 0 : [2, 3, 4].includes(q % 10) && ![12, 13, 14].includes(q % 100) ? 1 : 2)(state.queue ?? 0)]} с ленты.` : 'Сообщений с ленты в работе нет.'));
  return box;
}

export function addDirectorStatus(section, get, loadJournal) {
  if (!section) return;
  const sec = section('🧠 Режиссёр (Jev)', 'director'), box = el('div', 'rep'); sec.append(box);
  if (loadJournal) { const b = el('div', 'btns'), btn = el('button', null, '📜 Журнал действий'); btn.addEventListener('click', () => openJournal(loadJournal)); b.append(btn); sec.append(b); }
  function render() {
    const { net, world, now } = get(), e = world?.editor;
    const rows = [];
    rows.push(['Связь с редакцией', net.online ? `есть · смотрят: ${net.viewers ?? '—'}` : (net.reason === 'no_relay' ? 'не настроена' : 'нет')]);
    if (e) {
      const who = e.source === 'jev' ? `Jev${e.confidence != null ? ` (уверенность ${Math.round(e.confidence * 100)} %)` : ''}` :
        e.source === 'rule' ? 'простое правило — Jev недоступен или исчерпан дневной лимит' : e.source === 'start' ? 'стартовое состояние' : (e.source || '—');
      rows.push(['Последнее решение', who]);
      rows.push(['Когда', typeof e.at === 'number' ? ago(now - e.at) : '—']);
      if (e.label) rows.push(['Что делает', e.label]);
      rows.push(['Jev сейчас', e.source === 'jev' ? '✅ работает' : e.source === 'rule' ? '⚠️ не отвечает, решает правило' : 'ждёт первого решения']);
    } else rows.push(['Последнее решение', 'ещё не получено']);
    const tb = el('table'); for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('td', 'dim', k), el('td', null, v)); tb.append(tr); }
    const st = world?.state, sub = el('div', 'sub', 'Шкалы потребностей');
    const needs = st && typeof st.at === 'number' ? scales(st, now) : el('div', 'hint', 'Шкалы появятся после следующего решения режиссёра.');
    box.replaceChildren(sub, needs, tb, el('div', 'hint', 'Jev думает, только пока редакцию кто-то смотрит. Время редакции (и шкалы) идёт тоже только при зрителях.'));
  }
  setInterval(() => { if (sec.open) render(); }, 1000);
  sec.addEventListener('toggle', () => { if (sec.open) render(); });
  render();
}
