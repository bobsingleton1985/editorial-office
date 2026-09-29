// Settings panel ("hamburger"): collapsible sections — light, lamps, picture, shadows, scene, plus sections added by other modules
// (animation chains, director). Values and open sections are saved per browser in localStorage.
const KEY = 'editorial.settings.v1';
const clonePreset = (p) => JSON.parse(JSON.stringify(p));
// room light for each state of the weather outside (the weather is shared: see main.js)
export const PRESETS = {
  evening: { sky: 'night', neon: 1, sunLight: 0, beams: 1, ambient: 0.3, windowLight: 0.35, env: 0.25, exposure: 1.1, desk: 1, floor: 1, warmth: 0.65, lamps: { A: true, B: true, C: true, floor: true } },
  sun: { sky: 'sun', neon: 0, sunLight: 8, beams: 1.5, ambient: 0.3, windowLight: 0.4, env: 0.32, exposure: 1.08, desk: 0.6, floor: 0.6, warmth: 0.45, lamps: { A: false, B: false, C: false, floor: false } },
  cloudy: { sky: 'cloudy', neon: 0, sunLight: 0, beams: 1, ambient: 0.85, windowLight: 1.3, env: 0.42, exposure: 1.05, desk: 0.7, floor: 0.6, warmth: 0.55, lamps: { A: true, B: true, C: true, floor: false } },
  rain: { sky: 'rain', neon: 0, sunLight: 0, beams: 1, ambient: 0.6, windowLight: 0.9, env: 0.35, exposure: 1.1, desk: 0.85, floor: 0.7, warmth: 0.6, lamps: { A: true, B: true, C: true, floor: true } },
  snow: { sky: 'snow', neon: 0, sunLight: 0, beams: 1, ambient: 0.95, windowLight: 1.7, env: 0.46, exposure: 1.0, desk: 0.7, floor: 0.6, warmth: 0.55, lamps: { A: true, B: true, C: true, floor: false } },
};
// room light for what is outside: night → evening lamps, day → the weather's preset
export const presetFor = (sky) => clonePreset(PRESETS[sky === 'night' || !PRESETS[sky] ? 'evening' : sky]);
export const DEFAULTS = {
  ...PRESETS.evening,
  lamps: { A: true, B: true, C: true, floor: true }, tvGlow: true,
  shadows: true, shadowQ: matchMedia('(max-width: 700px)').matches ? 'low' : 'medium',
  autoTTY: true, showFps: true, quality: 'auto',
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const OPEN_KEY = 'editorial.sections.v1';
const openSet = (() => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '["windows"]')); } catch (e) { return new Set(['windows']); } })();   // the windows section starts open
function saveOpen() { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet])); } catch (e) { /* ignore */ } }

export function loadSettings() {
  let s = clone(DEFAULTS);
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) s = { ...s, ...v, lamps: { ...s.lamps, ...(v.lamps || {}) } }; } catch (e) { /* private mode */ }
  return s;
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

const SLIDERS = [
  ['Свет', [
    ['ambient', 'Общий свет', 0, 2, 0.05],
    ['windowLight', 'Свет из окон', 0, 3, 0.05],
    ['env', 'Отражения', 0, 1, 0.05],
    ['exposure', 'Яркость картинки', 0.5, 2, 0.05],
    ['sunLight', 'Солнце в окнах (в ясный день)', 0, 14, 0.1],
    ['beams', 'Лучи и пылинки в воздухе', 0, 3, 0.05],
    ['neon', 'Свет неона с улицы (ночью)', 0, 3, 0.05],
  ]],
  ['Лампы', [
    ['desk', 'Настольные лампы', 0, 3, 0.05],
    ['floor', 'Торшер', 0, 3, 0.05],
    ['warmth', 'Цвет ламп: холоднее ↔ теплее', 0, 1, 0.05],
  ]],
];
const TOGGLES = [['lamps.A', 'Лампа на столе A'], ['lamps.B', 'Лампа на столе B'], ['lamps.C', 'Лампа на столе C'], ['lamps.floor', 'Торшер'], ['tvGlow', 'Свет от экрана ТВ']];
const get = (s, p) => p.split('.').reduce((o, k) => o[k], s);
const set = (s, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], s)[last] = v; };

export function buildPanel(state, onChange, opts = {}) {
  const btn = document.createElement('button');
  btn.id = 'menu'; btn.setAttribute('aria-label', 'Настройки'); btn.setAttribute('aria-expanded', 'false'); btn.textContent = '☰';
  const panel = document.createElement('aside'); panel.id = 'settings'; panel.hidden = true;
  document.body.append(btn, panel);
  const toggle = (open) => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? '✕' : '☰'; };
  btn.addEventListener('click', () => toggle(panel.hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  const inputs = [];
  const commit = () => { save(state); onChange(state); };
  const tail = document.createElement('div'); tail.className = 'btns';
  // a collapsible section; everything added after it goes inside until the next section
  let cur = panel;
  const section = (t, id = t, into = true) => {
    const d = document.createElement('details'); d.className = 'sec'; d.open = openSet.has(id);
    const sm = document.createElement('summary'); sm.textContent = t; d.append(sm);
    d.addEventListener('toggle', () => { if (d.open) openSet.add(id); else openSet.delete(id); saveOpen(); d.dispatchEvent(new CustomEvent('sectionopen')); });
    panel.insertBefore(d, tail); if (into) cur = d; return d;
  };
  const h = (t) => section(t);
  const row = (label, input, out) => {
    const l = document.createElement('label'); l.className = 'row';
    const sp = document.createElement('span'); sp.textContent = label; l.append(sp);
    if (out) l.append(out); l.append(input); cur.append(l);
  };
  panel.append(tail);
  // shared for everyone: weather outside and the blinds (filled by the page)
  const outside = document.createElement('div'); outside.className = 'outside'; section('Окна — меняются у всех', 'windows', false).append(outside);
  for (const [title, list] of SLIDERS) {
    h(title);
    if (title === 'Лампы') for (const [p, label] of TOGGLES) {
      const i = document.createElement('input'); i.type = 'checkbox';
      i.addEventListener('change', () => { set(state, p, i.checked); commit(); });
      inputs.push(() => { i.checked = get(state, p); }); row(label, i);
    }
    for (const [k, label, min, max, st] of list) {
      const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = st;
      const o = document.createElement('output');
      i.addEventListener('input', () => { state[k] = +i.value; o.textContent = (+i.value).toFixed(2); commit(); });
      inputs.push(() => { i.value = state[k]; o.textContent = (+state[k]).toFixed(2); }); row(label, i, o);
    }
  }
  h('Картинка');
  { const sel = document.createElement('select');
    for (const [v, t] of [['auto', 'Авто — по скорости устройства'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое (телевизор)'], ['lowest', 'Самое низкое']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
    sel.addEventListener('change', () => { state.quality = sel.value; commit(); });
    inputs.push(() => { sel.value = state.quality || 'auto'; }); row('Качество картинки', sel); }
  h('Тени');
  { const i = document.createElement('input'); i.type = 'checkbox';
    i.addEventListener('change', () => { state.shadows = i.checked; commit(); });
    inputs.push(() => { i.checked = state.shadows; }); row('Тени от ламп', i); }
  { const sel = document.createElement('select');
    for (const [v, t] of [['low', 'Низкое (телефон)'], ['medium', 'Среднее'], ['high', 'Высокое']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
    sel.addEventListener('change', () => { state.shadowQ = sel.value; commit(); });
    inputs.push(() => { sel.value = state.shadowQ; }); row('Качество теней', sel); }
  h('Сцена');
  for (const [k, label] of [['autoTTY', 'Телетайп сам раз в 45 с'], ['showFps', 'Показывать кадры/с']]) {
    const i = document.createElement('input'); i.type = 'checkbox';
    i.addEventListener('change', () => { state[k] = i.checked; commit(); });
    inputs.push(() => { i.checked = state[k]; }); row(label, i);
  }
  const reset = document.createElement('button'); reset.textContent = 'Сбросить';
  reset.addEventListener('click', () => { Object.assign(state, clone(DEFAULTS), opts.resetTo ? opts.resetTo() : {}); sync(); commit(); });
  const copy = document.createElement('button'); copy.textContent = 'Скопировать настройки';
  copy.title = 'Скопировать значения, чтобы прислать их в чат';
  copy.addEventListener('click', async () => {
    const txt = JSON.stringify(state);
    try { await navigator.clipboard.writeText(txt); copy.textContent = 'Скопировано ✓'; }
    catch (e) { prompt('Скопируйте настройки:', txt); }
    setTimeout(() => { copy.textContent = 'Скопировать настройки'; }, 1800);
  });
  tail.append(reset, copy); panel.append(tail);
  const sync = () => inputs.forEach((f) => f());
  sync();
  return { toggle, sync, outside, section: (t, id) => section(t, id, false) };
}
