import {moneyPanel,moneyOverview} from './money-view.js';
import {relationshipView} from './relationship-view.js';
// The people and money tabs share the currently selected character.
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function ago(ms) { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return 'только что'; const m = Math.round(s / 60); if (m < 60) return m + ' мин назад'; return Math.round(m / 60) + ' ч назад'; }
// journal: the people's recent actions and who chose each one (read from the relay, newest first); a filter by person
const TXT = { continue: 'продолжает' };
function who(e) {
  if (e.source === 'qwen') return 'Qwen3.8 27B Free';
  if (e.source === 'jev') return 'Jev' + (e.confidence != null ? ` · ${Math.round(e.confidence * 100)} %` : '');
  return e.source === 'rule' ? 'правило' : e.source === 'start' ? 'старт' : (e.source || '—');
}
let css = false;
function openJournal(load, only = null, names = {}) {
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
    #journal .hint { padding:10px 0; } #journal .jn { color:#e7c9a0; font-weight:600; margin-right:6px; }
    #journal header select { margin-left:auto; margin-right:8px; background:#2a221b; color:inherit; border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:3px 6px; font:inherit; }`; document.head.append(st); }
  document.getElementById('journal')?.remove();
  const wrap = el('div'); wrap.id = 'journal';
  const box = el('div', 'jb'), head = el('header'), close = el('button', null, '✕'), list = el('div', 'jl');
  const pick = el('select'); pick.setAttribute('aria-label', 'Чьи действия');
  close.setAttribute('aria-label', 'Закрыть'); head.append(el('b', null, '📜 Журнал: что делали в редакции'), pick, close); box.append(head, list); wrap.append(box);
  const shut = () => { wrap.remove(); removeEventListener('keydown', esc, true); };
  const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); shut(); } };
  close.addEventListener('click', shut); wrap.addEventListener('click', (ev) => { if (ev.target === wrap) shut(); }); addEventListener('keydown', esc, true);
  list.append(el('div', 'hint', 'Загружаю…')); document.body.append(wrap);
  load().then(({ entries: all, now }) => {
    const nameOf = (e) => e.name || names[e.char || 'columnist'] || (e.char ? e.char : 'Колумнист');   // entries before 29.09 evening: the columnist alone
    const ids = [...new Set((all || []).map((e) => e.char || 'columnist'))];
    pick.replaceChildren(el('option', null, 'Все'), ...ids.map((id) => { const o = el('option', null, nameOf((all || []).find((e) => (e.char || 'columnist') === id))); o.value = id; return o; }));
    pick.firstChild.value = ''; pick.value = only && ids.includes(only) ? only : '';
    const draw = () => { list.replaceChildren(); const entries = (all || []).filter((e) => !pick.value || (e.char || 'columnist') === pick.value);
    if (!entries?.length) { list.append(el('div', 'hint', 'Записей пока нет: журнал ведётся с 29.09, пока редакцию смотрят.')); return; }
    const off = Date.now() - (now || Date.now()); let day = '';
    for (const e of entries) {
      const d = new Date(e.at + off), dd = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      if (dd !== day) { day = dd; list.append(el('div', 'jd', dd === new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) ? 'Сегодня' : dd)); }
      const r = el('div', 'jr'), verb = (e.action || '').split('@')[0];
      r.append(el('span', 'jt', d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })),
        (() => { const t = el('span'); if (ids.length > 1) t.append(el('span', 'jn', nameOf(e))); t.append((TXT[verb] ? TXT[verb] + ': ' : '') + (e.label || e.action || '—')); return t; })(),
        el('span', 'js ' + (e.source || ''), who(e)));
      const extra = [e.moved ? 'идёт на новое место' : '', e.fatigue != null ? `усталость ${e.fatigue}` : '', ago((now || Date.now()) - e.at)].filter(Boolean).join(' · ');
      r.append(el('span', 'ja', extra)); list.append(r);
    }
    const n = entries.length, w = n % 10 === 1 && n % 100 !== 11 ? 'решение' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'решения' : 'решений';
    list.append(el('div', 'hint', `Последние ${n} ${w}. Jev думает, только пока редакцию кто-то смотрит.`)); };
    pick.addEventListener('change', draw); draw();
  }).catch(() => { list.replaceChildren(el('div', 'hint', 'Журнал не загрузился: нет связи с редакцией.')); });
}

// needs scales: whatever needs the director sends in world.state (today only fatigue; new needs appear here by themselves).
// The director sends values with their rate per minute at the moment of the decision; between decisions the page runs them on.
const NEED = { flirt: 'Интерес к флирту', fatigue: 'Усталость', boredom: 'Скука', social: 'Общение', recognition: 'Признание', fun: 'Развлечение',
  coffee: 'Кофе', nicotine: 'Никотин', alcohol: 'Алкоголь', stress: 'Стресс', drunk: 'Опьянение', hunger: 'Голод', music: 'Тяга к музыке', dance: 'Желание танцевать' };
// the scales may be moved by any viewer (owner 30.09): the value goes to the director when the finger lets go, and the person decides again;
// Only the actively dragged control owns a local value. On release the panel
// resumes the director's state/rate, even while the assignment is in transit.
const editing=new Set();
function slider(k, v, nv, row, ctl) {
  const i = el('input', 'nr'); i.type = 'range'; i.min = 0; i.max = 100; i.step = 1; i.value = v; i.setAttribute('aria-label', NEED[k] || k); i.dataset.peopleFocus = 'need:' + k; i.setAttribute('aria-description', row.title);
  let keyboard=false;
  i.addEventListener('keydown',ev=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(ev.key)){keyboard=true;editing.add(i);}});
  i.addEventListener('keyup',()=>{keyboard=false;editing.delete(i);});
  i.addEventListener('blur',()=>{keyboard=false;editing.delete(i);});
  const rel=()=>{editing.delete(i);};
  i.addEventListener('pointerdown', ev=>{keyboard=false;editing.add(i);i.setPointerCapture?.(ev.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])i.addEventListener(event,rel);
  i.addEventListener('input', () => { nv.textContent = `${i.value}%`; row.classList.toggle('hi', +i.value >= 70); });
  i.addEventListener('change', () => { if(!keyboard)rel();ctl.set(k,+i.value);if(!keyboard)ctl.refresh(); });
  return i;
}
let needsCss = false;
function scales(state, now, ctl) {
  if (!needsCss) { needsCss = true; const st = document.createElement('style'); st.textContent = `
    #settings .needs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 16px; margin:4px 0 10px; }
    #settings .nd { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:0 5px; align-content:start; margin:0; min-width:0; font-size:12px; }
    #settings .needs > .hint, #settings .needs > .task, #settings .nd > .hint { grid-column:1 / -1; }
    #settings .nd .nv { color:var(--muted); font-variant-numeric:tabular-nums; font-size:12px; }
    #settings .nd .nb { grid-column:1 / -1; height:7px; border-radius:4px; background:rgba(255,255,255,.09); overflow:hidden; }
    #settings .nd .nb i { display:block; height:100%; border-radius:4px; background:linear-gradient(90deg,#7fa36b,#e0913a); }
    #settings .nd.hi .nb i { background:linear-gradient(90deg,#e0913a,#d9483b); }
    #settings .nd.task .nb i { background:#8aa7c9; }
    #settings .nd input.nr { grid-column:1 / -1; width:100%; margin:0; height:22px; accent-color:#e0913a; } #settings .nd.hi input.nr { accent-color:#d9483b; }`; document.head.append(st); }
  const box = el('div', 'needs'), mins = Math.max(0, (now - state.at) / 60000);
  for (const [k, n] of Object.entries(state.needs || {})) {
    const v = Math.max(0, Math.min(100, (n.v ?? 0) + (n.rate ?? 0) * mins)), r = n.rate ?? 0;
    const trend = r > 0 ? ` ↑ +${r}/мин` : r < 0 ? ` ↓ ${r}/мин` : '';
    const row = el('div', 'nd' + (v >= 70 ? ' hi' : '')), nv = el('span', 'nv', `${Math.round(v)}%${r > 0 ? ' ↑' : r < 0 ? ' ↓' : ''}`);
    row.title = `${NEED[k] || k}: ${Math.round(v)} из 100${trend}`;
    row.append(el('span', null, ({music:'Музыка',dance:'Танцы'})[k] || NEED[k] || k), nv);
    if (ctl) row.append(slider(k, Math.round(v), nv, row, ctl));
    else { const bar = el('div', 'nb'), fill = el('i'); fill.style.width = v.toFixed(1) + '%'; bar.append(fill); row.append(bar); }
    box.append(row);
    if(state.needLimitations?.[k])row.append(el('div','hint',state.needLimitations[k]));
  }
  const t = state.task;
  if (t) {
    const run = t.working&&!t.confirmedOnly ? Math.max(0, (now - Math.max(state.at, t.from || state.at)) / 60000) : 0, done = Math.min(t.need, t.done + run);
    const row = el('div', 'nd task'), bar = el('div', 'nb'), fill = el('i');
    fill.style.width = (100 * done / t.need).toFixed(1) + '%'; bar.append(fill);
    row.append(el('span', null, `Правка «${t.title}»`), el('span', 'nv', `${done.toFixed(1).replace('.', ',')} из ${t.need} мин${t.working ? '' : ' · отложена'}`), bar); box.append(row);
  }
  box.append(el('div', 'hint', t ? `В очереди ещё ${state.queue ?? 0} ${['сообщение', 'сообщения', 'сообщений'][(q => q % 10 === 1 && q % 100 !== 11 ? 0 : [2, 3, 4].includes(q % 10) && ![12, 13, 14].includes(q % 100) ? 1 : 2)(state.queue ?? 0)]} с ленты.` : 'Сообщений с ленты в работе нет.'));
  return box;
}

// the people in the world: {id: entry}; an old world ({editor}) is the columnist alone
const peopleOf = (w) => Object.entries(w?.chars || (w?.editor ? { columnist: { name: 'Колумнист', ...w.editor, state: w.state } } : {}));
export function addDirectorStatus(section, get, loadJournal) {
  if (!section) return null;
  const sec = section('Персонажи', 'director'), tabs = el('div', 'btns ptabs'), box = el('div', 'rep'); sec.append(tabs, box);
  const moneySec=section('Деньги','money'),moneyBox=el('div','money-content');moneySec.append(moneyBox);
  const visible=s=>s.open&&!s.closest('[hidden]');
  if (!document.getElementById('ptabs-css')) { const st = document.createElement('style'); st.id = 'ptabs-css'; st.textContent = `
    #settings .ptabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; margin:6px 0 10px; }
    #settings .ptabs button { padding:6px; border-radius:7px; font-size:12px; }
    #settings .ptabs button[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }
    #settings .person-now { margin:0 0 8px; font-size:12px; }
    #settings .person-now .dim { margin-right:5px; }
    #settings .person-vitals { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px 12px; margin:0 0 10px; font-size:12px; }
    #settings .person-vitals > div { display:flex; justify-content:space-between; gap:6px; }
    #settings .person-vitals strong { font-variant-numeric:tabular-nums; }
    #settings .person-vitals .hi strong { color:#f3ae62; }
    #settings .person-fold { border-top:1px solid var(--line); }
    #settings .person-fold > summary { cursor:pointer; padding:10px 0; font-weight:600; }
    #settings .person-fold > :last-child { margin-bottom:10px; }
    #settings .person-fold .relationships > .sub:first-child { display:none; }
    #settings .person-fold .hint { line-height:1.4; }
  `; document.head.append(st); }
  const names = () => Object.fromEntries(peopleOf(get().world).map(([id, e]) => [id, e.name || id]));
  if (loadJournal) { const b = el('div', 'btns'), btn = el('button', null, '📜 Журнал действий'); btn.addEventListener('click', () => openJournal(loadJournal, get().focus, names())); b.append(btn); sec.append(b); }
  let tabKey = '',moneyKey='',renderedMoneyActor=null,renderedRelationshipsActor=null;const moneyOpen=new Map(),relationshipOpen=new Map(),peopleOpen=new Map();
  function renderMoney(){
    const {world,focus,setFocus}=get(),list=peopleOf(world),id=list.some(([k])=>k===focus)?focus:list[0]?.[0],entry=list.find(([k])=>k===id)?.[1];
    const key=JSON.stringify([id,list.map(([k,e])=>[k,e.name,e.finances])]);
    if(key===moneyKey)return;
    const active=moneyBox.contains(document.activeElement)?document.activeElement.dataset.moneyFocus:null;
    if(renderedMoneyActor)moneyOpen.set(renderedMoneyActor,new Map(Array.from(moneyBox.querySelectorAll('[data-money-section]')).map(d=>[d.dataset.moneySection,d.open])));
    const detail=moneyPanel(entry,names()),opened=moneyOpen.get(id);
    for(const d of detail.querySelectorAll('[data-money-section]'))d.open=opened?.get(d.dataset.moneySection)??false;
    moneyBox.replaceChildren(moneyOverview(list,id,k=>{setFocus(k);renderMoney();}),detail);
    moneyKey=key;renderedMoneyActor=id;
    if(active)Array.from(moneyBox.querySelectorAll('[data-money-focus]')).find(n=>n.dataset.moneyFocus===active)?.focus({preventScroll:true});
  }
  function render() {
    if(editing.size)return; // native pointer capture releases even outside the row
    const focused = sec.contains(document.activeElement) ? document.activeElement.dataset.peopleFocus : null;
    const { net, world, executionStatus, now, focus, setFocus, setNeed } = get(), list = peopleOf(world);
    const id = list.some(([k]) => k === focus) ? focus : list[0]?.[0], e = list.find(([k]) => k === id)?.[1];
    const key = list.map(([k, x]) => k + ':' + (x.name || '')).join('|') + '#' + id;
    if (key !== tabKey) { tabKey = key; tabs.replaceChildren(...(list.length > 1 ? list.map(([k, x]) => { const b = el('button', null, '👤 ' + (x.name || k)); b.setAttribute('aria-pressed', String(k === id)); b.dataset.peopleFocus = 'actor:' + k;
      b.addEventListener('click', () => { setFocus(k); render(); }); return b; }) : [])); }
    const rows = [];
    rows.push(['Связь с редакцией', net.online ? `есть · смотрят: ${net.viewers ?? '—'}` : (net.reason === 'no_relay' ? 'не настроена' : 'нет')]);
    if (e) {
      const who = e.source === 'qwen' ? 'Qwen3.8 27B Free' : e.source === 'jev' ? `Jev${e.confidence != null ? ` (уверенность ${Math.round(e.confidence * 100)} %)` : ''}` :
        e.source === 'rule' ? 'простое правило — Jev недоступен или исчерпан дневной лимит' : e.source === 'start' ? 'стартовое состояние' : (e.source || '—');
      rows.push(['Последняя команда', who]);
      rows.push(['Когда', typeof e.at === 'number' ? ago(now - e.at) : '—']);
      rows.push(['Что делает сейчас', executionStatus?.(id)?.label || 'исполнение ещё не подтверждено']);
      if (e.label) rows.push(['Назначено', e.label]);
    } else rows.push(['Последнее решение', 'ещё не получено']);
    const tb = el('table'); for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('td', 'dim', k), el('td', null, v)); tb.append(tr); }
    const st = e?.state || (list.length === 1 ? world?.state : null);
    const ctl = setNeed && net.online && e && st ? {set:(k,val)=>setNeed(id,k,val),refresh:render} : null;
    const needs = st && typeof st.at === 'number' ? scales(st, now, ctl) : el('div', 'hint', 'Шкалы появятся после следующего решения режиссёра.');
    const sleepInfo=el('div','hint');
    sleepInfo.append(el('div',null,'При усталости 95% персонаж отправляется спать. Во сне усталость и опьянение снижаются; после восстановления сил до 30% усталости он просыпается.'));
    if(e?.sleepPending)sleepInfo.append(el('div',null,'Сон назначен: '+({sleep_executor_unavailable:'ожидает загрузки движений сна',finishing_safe_exit:'завершает текущее движение',waiting_for_free_desk:'ожидает освобождения стола',waiting_for_free_chair:'ожидает освобождения стула у круглого стола',ready:'готовится ко сну'}[e.sleepPending.reason]||'готовится ко сну')+'.'));
    if(e?.sleep)sleepInfo.append(el('div',null,({entering:'Готовится ко сну',asleep:'Спит',waking:'Просыпается'}[e.sleep.phase]||'Сон')+` · подтверждено сна: ${Math.round(e.sleep.confirmedMs/1000)} с`));
    const lastSleep=e?.memory?.filter(x=>x.event==='sleep_finished').at(-1);
    if(lastSleep)sleepInfo.append(el('div',null,`Помнит: ${id==='heroine'?'спала':'спал'} ${lastSleep.kind==='chair'?'на стуле у круглого стола':'за столом'} ${Math.round(lastSleep.participatingSeconds)} с; усталость ${Math.round(lastSleep.fatigueBefore)} → ${Math.round(lastSleep.fatigueAfter)}. ${lastSleep.reason==='restored'?'Силы восстановлены.':'Закончился период сна.'}`));
    for(const detail of box.querySelectorAll('[data-relationship-section]'))if(renderedRelationshipsActor)relationshipOpen.set(renderedRelationshipsActor+':'+detail.dataset.relationshipSection,detail.open);
    for(const detail of box.querySelectorAll('[data-people-section]'))if(renderedRelationshipsActor)peopleOpen.set(renderedRelationshipsActor+':'+detail.dataset.peopleSection,detail.open);
    const relations=relationshipView(e,names());for(const detail of relations.querySelectorAll('[data-relationship-section]')){detail.open=relationshipOpen.get(id+':'+detail.dataset.relationshipSection)??false;detail.querySelector('summary').dataset.peopleFocus='relation:'+detail.dataset.relationshipSection;}
    renderedRelationshipsActor=id;
    const fold=(key,title,content,initial=false)=>{const d=el('details','person-fold'),summary=el('summary',null,title);d.dataset.peopleSection=key;summary.dataset.peopleFocus='section:'+key;d.open=peopleOpen.get(id+':'+key)??initial;d.append(summary,content);return d;};
    const current=el('div','person-now');current.append(el('span','dim','Сейчас:'),el('span',null,executionStatus?.(id)?.label||'исполнение ещё не подтверждено'));
    const vitals=el('div','person-vitals');
    if(st&&typeof st.at==='number')for(const k of ['fatigue','hunger','stress','drunk']){const n=st.needs?.[k];if(!n)continue;const v=Math.max(0,Math.min(100,(n.v??0)+(n.rate??0)*Math.max(0,(now-st.at)/60000))),row=el('div',v>=70?'hi':null);row.append(el('span','dim',NEED[k]),el('strong',null,Math.round(v)+'%'));vitals.append(row);}
    const info=el('div');info.append(tb,el('div','hint','Jev думает, только пока редакцию кто-то смотрит. Время редакции (и шкалы) идёт тоже только при зрителях.'+(ctl?' Потяните шкалу — человек пересмотрит, чем заняться (это увидят все зрители).':'')));
    const sleepTitle=e?.sleep?({entering:'Сон · готовится',asleep:'Сон · спит',waking:'Сон · просыпается'}[e.sleep.phase]||'Сон и восстановление'):e?.sleepPending?'Сон · назначен':'Сон и восстановление';
    box.replaceChildren(current,vitals,fold('needs','Все потребности'+(ctl?' · изменить':''),needs),fold('relationships','Отношения с коллегами',relations),fold('sleep',sleepTitle,sleepInfo),fold('decisions','Решения и связь',info));
    if(focused) Array.from(sec.querySelectorAll('[data-people-focus]')).find(i=>i.dataset.peopleFocus===focused)?.focus({preventScroll:true});
  }
  const refresh=()=>{if(visible(sec))render();if(visible(moneySec))renderMoney();};
  setInterval(refresh,1000);
  for(const s of [sec,moneySec])for(const event of ['toggle','sectionopen'])s.addEventListener(event,refresh);
  refresh();
  return (id) => { const g = get(); g.setFocus(id); g.open?.(); sec.show?.(); sec.open = true; render(); sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); };   // a click on a person in the room
}
