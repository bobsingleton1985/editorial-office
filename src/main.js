import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createLighting, SUN_DIR } from './lighting.js';
import { loadSettings, buildPanel, presetFor } from './settings.js';
import { addRepertoire } from './repertoire.js';
import { addDirectorStatus } from './director-status.js';
import { createEditor } from './editor.js';
import { connectLive } from './live.js';
import { createQuality } from './quality.js';
import { createStaticCache } from './cache.js';
import { CHAIR_NODE, DESKS, S as PACK_S } from './layout.js';
import { createTypewriters } from './typewriter.js';
import { createWeather } from './weather.js';
import { createBlinds } from './blinds.js';
import { createSunbeams } from './sunbeams.js';

const Q = new URLSearchParams(location.search);
const GLB = Q.get('m') || 'assets/office-v29c.glb', GLB_SIZE = 3880516;
const RELAY_URL = 'https://135-106-229-50.sslip.io';     // shared newsroom: relay on the VPS (also hosts the character files)
const RELAY = ((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))(Q.get('relay') ?? RELAY_URL);   // '/' = same origin (local test)
const CHAR_BASE = Q.get('charbase') ?? (RELAY && RELAY !== '/' ? RELAY + '/' : '');
const CHAR = Q.get('char') ?? CHAR_BASE + 'assets/editor2A-web-v01.glb';
const CHAR_TYPE = CHAR_BASE + 'assets/editor2A-type-v13.glb';          // add-on: rig + typing clip (editor2A v13, approved page «Редактор в офисе»)
const TYPEWRITER = 'assets/typewriter-v01.glb';                          // compact flat typewriter, pack table frame
const $ = (id) => document.getElementById(id);
const status = $('status'), bar = $('bar'), fpsEl = $('fps'), who = $('who');
document.body.classList.add('js');
const T0 = performance.now();
const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',');

// ---------- renderer, light, environment (as in the page brief)
const S = loadSettings();
const QL = createQuality(Q.get('q') || S.quality || 'auto');   // weak devices (TVs): lower resolution, no shadows
const r = new THREE.WebGLRenderer({ antialias: QL.antialias });
r.setPixelRatio(QL.pixelRatio());
r.toneMapping = THREE.ACESFilmicToneMapping;
r.outputColorSpace = THREE.SRGBColorSpace;
$('view').appendChild(r.domElement);
const sc = new THREE.Scene();
sc.background = new THREE.Color(0x1b1714);
const pm = new THREE.PMREMGenerator(r);
sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const L = createLighting(sc, r);                          // lamps with shadows, ambient, window light
let SC = null;                                             // static picture cache (weak devices), made once the camera exists
let WX = null;                                             // what is outside the windows: evening or day with the weather
const eff = (s) => (s.shadows && (QL.level.shadows || QL.level.cache) ? s : { ...s, shadows: false });   // cached levels: shadows drawn once with the room
let ttyTimer = null;
function applyScene(s) {
  clearInterval(ttyTimer); ttyTimer = s.autoTTY ? setInterval(() => incoming(), 45000) : null;
  fpsEl.style.display = s.showFps ? '' : 'none';
}
window.__set = (p) => { Object.assign(S, p); L.apply(eff(S)); applyScene(S); SB?.set(S.sky === 'sun', S.beams); SC?.markDirty(); };

// ---------- weather: one for everyone, the real weather of the owner's city (the relay looks outside every 10 min)
const FORCE = Q.get('sky');                                // ?sky=snow — for checks only
const CHOICES = [['nyc', 'Нью-Йорк — настоящая погода'], ['msk', 'Москва — настоящая погода'], ['sun', '☀️ Солнце'], ['cloudy', '⛅ Облачно'],
  ['rain', '🌧 Дождь'], ['snow', '❄️ Снег'], ['night', '🌙 Ночь']];
let wx = null, litSky = null, PANEL = null;              // wx: {choice, city, name, day, sky, fall, ground, desc, temp, utc, manual}
const outside = () => (FORCE ? { sky: FORCE } : wx ? { sky: wx.sky, fall: wx.fall, ground: wx.ground } : { sky: 'night', fall: null, ground: false });
let ownerToken = null;                                     // later, when testing ends: only the owner (opened the site with #owner=…) may change it
try { const m = location.hash.match(/owner=([\w-]{24,})/); if (m) { ownerToken = m[1]; history.replaceState(null, '', location.pathname + location.search); localStorage.setItem('editorial.owner', m[1]); }
  ownerToken = ownerToken || localStorage.getItem('editorial.owner'); } catch (e) { /* private mode: key lives until the tab closes */ }
function applyWeather(w) {
  if (w) wx = w;
  const o = outside();
  if (o.sky !== litSky) { litSky = o.sky; Object.assign(S, presetFor(o.sky)); PANEL?.sync(); }   // the room light follows the sky; sliders may still tweak it
  S.sky = o.sky; L.apply(eff(S)); WX?.apply(o.sky, o); SB?.set(o.sky === 'sun', S.beams); SC?.markDirty(); showOutside();
}

// ---------- blinds: one setting for everyone (how far down, how shut); the sun and its beams follow them
let BL = null, SB = null, blinds = { down: 0.63, tilt: 0 }, blindsUI = null, sendT = null;
function applyBlinds(b, fromNet) {
  if (fromNet && blindsUI?.busy) return;                    // this viewer is dragging a slider right now
  blinds = { down: +b.down, tilt: +b.tilt };
  BL?.set(blinds); SB?.setBlinds(blinds); L.touch(); SC?.markDirty(); blindsUI?.sync();
}
function sendBlinds() {
  clearTimeout(sendT);
  sendT = setTimeout(async () => {
    try {
      const res = await fetch((RELAY === '/' ? '' : RELAY) + '/settings/blinds', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ownerToken ? { Authorization: 'Bearer ' + ownerToken } : {}) }, body: JSON.stringify(blinds) });
      if (res.status === 429) sendBlinds();
    } catch (e) { /* offline: stays local */ }
  }, 150);
}
function buildBlindsUI(box) {
  const ui = { busy: false, rows: [] };
  for (const [k, label] of [['down', 'Жалюзи: подняты ↔ опущены'], ['tilt', 'Ламели: открыты ↔ закрыты']]) {
    const l = document.createElement('label'); l.className = 'row';
    const sp = document.createElement('span'); sp.textContent = label; l.append(sp);
    const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.01;
    i.addEventListener('pointerdown', () => { ui.busy = true; });
    i.addEventListener('input', () => { applyBlinds({ ...blinds, [k]: +i.value }); });
    i.addEventListener('change', () => { ui.busy = false; if (RELAY) sendBlinds(); });
    l.append(i); box.append(l); ui.rows.push([k, i]);
  }
  ui.sync = () => { for (const [k, i] of ui.rows) if (+i.value !== blinds[k]) i.value = blinds[k]; };
  ui.sync();
  return ui;
}
window.__weather = applyWeather; window.__blinds = (b) => (b ? applyBlinds(b) : blinds);
const ICON = { sun: '☀️', cloudy: '⛅', rain: '🌧', snow: '❄️' };
let wxBox = null;
function showOutside(note) {
  const box = wxBox; if (!box) return;
  box.textContent = '';
  const p = document.createElement('div'); p.className = 'hint';
  const t = wx && Number.isFinite(wx.temp) ? `, ${wx.temp > 0 ? '+' : ''}${wx.temp}°` : '';
  p.textContent = !wx ? 'За окном вечер. Настоящая погода появится, когда будет связь с редакцией.'
    : wx.manual ? `${ICON[wx.sky] || '🌙'} За окном: ${wx.desc} (выбрано вручную, для всех)`
    : `${wx.fall ? ICON[wx.fall] : wx.day ? ICON[wx.sky] : '🌙'} За окном — ${wx.name}: ${wx.day ? 'день' : 'ночь'}, ${wx.desc}${t}`;
  box.append(p);
  if (!RELAY) return;
  const l = document.createElement('label'); l.className = 'row';
  const sp = document.createElement('span'); sp.textContent = 'Погода за окном (меняется у всех)'; l.append(sp);
  const sel = document.createElement('select');
  for (const [v, tx] of CHOICES) { const op = document.createElement('option'); op.value = v; op.textContent = tx; sel.append(op); }
  sel.value = wx?.choice || 'nyc';
  sel.addEventListener('change', () => choose(sel.value));
  l.append(sel); box.append(l);
  if (note) { const n = document.createElement('div'); n.className = 'hint'; n.textContent = note; box.append(n); }
}
async function choose(choice) {
  try {
    const res = await fetch((RELAY === '/' ? '' : RELAY) + '/settings/weather', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ownerToken ? { Authorization: 'Bearer ' + ownerToken } : {}) }, body: JSON.stringify({ choice }) });
    if (res.status === 403) return showOutside('Менять погоду может только владелец.');
    if (res.status === 429) return showOutside('Слишком часто, попробуйте через пару секунд.');
    const j = await res.json(); applyWeather(j.weather);
  } catch (e) { showOutside('Не удалось сменить погоду: нет связи с редакцией.'); }
}
window.__cam = (pos, tgt, zoom = 1) => { cam.position.copy(B(...pos)); ctl.target.copy(B(...tgt)); cam.zoom = zoom; cam.updateProjectionMatrix(); ctl.update(); SC?.markDirty(); };
L.apply(eff(S));
let qMode = S.quality;
PANEL = buildPanel(S, (s) => { if (s.quality !== qMode) { qMode = s.quality; QL.set(s.quality); applyQuality(); } s.sky = outside().sky; L.apply(eff(s)); applyScene(s); SB?.set(s.sky === 'sun', s.beams); SC?.markDirty(); },
  { resetTo: () => presetFor(outside().sky) });
{ wxBox = document.createElement('div'); const bb = document.createElement('div');
  PANEL.outside.append(wxBox, bb); blindsUI = buildBlindsUI(bb); }
applyWeather();
const diag = { textContent: '' }; window.__diag = diag;   // technical line (GPU, frame time): console only — window.__diag.textContent
const gpuName = (() => { try { const gl = r.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } })();
function applyQuality() { r.setPixelRatio(QL.pixelRatio()); fit(); L.apply(eff(S)); if (SC) { SC.enabled = QL.level.cache; SC.roomScale = QL.roomScale(); SC.markDirty(); } }
window.__quality = () => ({ level: QL.level.id, auto: QL.auto, tv: QL.tv, ratio: r.getPixelRatio(), aa: QL.antialias, cache: !!SC?.enabled, calls: r.info.render.calls, cpu_ms: +cpuMs.toFixed(1) });

// ---------- main camera: orthographic, south-east (Blender coords -> three: x, z, -y)
const B = (x, y, z) => new THREE.Vector3(x, z, -y);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
cam.position.copy(B(5.3, -7.05, 4.5));
const target = B(0.4, 1.5, 1.5);
function fit() {
  const a = innerWidth / innerHeight;
  const v = a < 11.33 / 8.5 ? Math.min(8.2 / a, 16) : 8.5;   // portrait phones: crop the sides a little
  cam.left = -v * a / 2; cam.right = v * a / 2; cam.top = v / 2; cam.bottom = -v / 2;
  cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); SC?.markDirty();
}
fit(); addEventListener('resize', fit);
const ctl = new OrbitControls(cam, r.domElement);
ctl.target.copy(target); ctl.enableDamping = true; ctl.screenSpacePanning = true;
ctl.minZoom = 0.8; ctl.maxZoom = 5;
const off = cam.position.clone().sub(target), az0 = Math.atan2(off.x, off.z);
ctl.minAzimuthAngle = az0 - 0.7; ctl.maxAzimuthAngle = az0 + 0.7;
ctl.minPolarAngle = 0.75; ctl.maxPolarAngle = 1.45;
ctl.update();
SC = createStaticCache(r, sc, cam); SC.enabled = QL.level.cache; SC.roomScale = QL.roomScale();
ctl.addEventListener('change', () => SC.markDirty());

// ---------- load the office with a visible byte counter (to see if the network cuts the file)
async function fetchGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const cl = +res.headers.get('content-length');
  const total = res.headers.get('content-encoding') || !cl ? GLB_SIZE : cl;
  const rd = res.body.getReader(); const chunks = []; let got = 0, last = performance.now();
  const dog = setInterval(() => {
    if (performance.now() - last > 12000)
      status.textContent = `Загрузка остановилась на ${Math.round(got / 1024)} КБ. Похоже, сеть обрывает соединение.`;
  }, 2000);
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    chunks.push(value); got += value.length; last = performance.now();
    const s = (last - T0) / 1000;
    status.textContent = `Загрузка офиса: ${mb(got)} из ${mb(total)} МБ · ${mb(got / s)} МБ/с`;
    bar.style.width = Math.min(100, 100 * got / total).toFixed(1) + '%';
  }
  clearInterval(dog);
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  return { buffer: buf.buffer, got };
}

let mixer = null, typebox = null, paperMat = null, tvMat = null, tvOrig = null, newsTex = null;
const clockPivots = [], tty = [];
let paperTarget = 0, lastX = null, returning = false, ttyBusy = false;

function setup(g) {
  sc.add(g.scene); window.__scene = sc; window.__THREE = THREE;   // for automated checks
  L.attach(g.scene);
  mixer = new THREE.AnimationMixer(g.scene);
  for (const clip of g.animations) {
    if (clip.name.startsWith('CLOCK')) continue;                 // clock hands follow real time instead
    const a = mixer.clipAction(clip);
    if (clip.name.startsWith('TTY incoming')) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; tty.push(a); }
    else a.play();                                                // turntable, fan: loop
  }
  g.scene.traverse((o) => {
    const m = o.name.match(/CLOCK_\|_(hour|minute|second)_hand_(S|N)_pivot/);
    if (m) clockPivots.push({ o, kind: m[1], sign: m[2] === 'S' ? -1 : 1 });
    if (/typebox_\(/.test(o.name)) typebox = o;
    if (o.isMesh) for (const mt of [].concat(o.material)) {
      if (mt.name === 'TTY v24 paper') paperMat = mt;
      if (mt.name === 'TV | screen image') tvMat = mt;
    }
  });
  { // everything that moves goes to the cache's dynamic layer; the rest of the room is drawn once
    const dyn = new Set();
    for (const clip of g.animations) for (const t of clip.tracks) { const o = g.scene.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName); if (o) dyn.add(o); }
    for (const p of clockPivots) dyn.add(p.o);
    g.scene.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.name === 'TV | screen image' || m.name === 'TTY v24 paper')) dyn.add(o); });
    for (const n of Object.values(CHAIR_NODE)) { const o = g.scene.getObjectByName(n); if (o) dyn.add(o); }
    dyn.forEach((o) => SC.addDynamic(o)); SC.lightsEverywhere(); window.__dynCount = dyn.size;
  }
  WX = createWeather(sc, g.scene, r);
  WX.onDynamic = (o) => SC.addDynamic(o);                     // rain and snow move every frame
  WX.onReady = () => SC.markDirty();                          // day facades arrived: redraw the cached room
  BL = createBlinds(g.scene); sc.add(BL.group);                 // blinds and sun rays in the air (still: part of the cached room)
  SB = createSunbeams(SUN_DIR); sc.add(SB.group); SC.addDynamic(SB.dust);   // dust twinkles every frame
  applyBlinds(blinds);
  applyWeather();
  if (paperMat && paperMat.map) paperTarget = paperMat.map.offset.y;
  if (tvMat) tvOrig = { map: tvMat.map, emissiveMap: tvMat.emissiveMap };
  new THREE.TextureLoader().load('assets/tv_news.jpg', (t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; newsTex = t;
  });
  if (S.autoTTY) setTimeout(incoming, 6000);
  applyScene(S);
  $('tty').disabled = false;
  if (CHAR) loadEditor(g.scene);
}

// ---------- the first character: editor2A, driven by the shared director
let editor = null, live = null, pending = null, net = { online: false }, typewriters = null;
const PLACE = { deskA: 'за столом A', deskB: 'за столом B', deskC: 'за столом C', benchS: 'на скамье', benchM: 'на скамье', benchN: 'на скамье', window: 'у окна', teletype: 'у телетайпа' };
function showWho() {
  if (!who) return;
  const st = editor ? editor.status() : null;
  let t = editor ? '👤 Редактор' : '👤 Редактор загружается…';
  if (st) t += ': ' + (st.label || (st.mode === 'seated' ? 'сидит ' + (PLACE[st.seat] || '') : st.motion));
  if (!net.online) t += net.reason === 'no_relay' ? ' · редакция пока не на связи' : ' · нет связи с редакцией';
  else if (net.viewers) t += ` · смотрят: ${net.viewers}`;
  who.textContent = t;
}
async function loadEditor(office) {
  try {
    showWho();
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
    const opt = (u) => get(u).catch(() => null);                          // add-ons are optional: without them he just sits
    const [buf, tracks, tbuf, wbuf] = await Promise.all([get(CHAR), fetch(CHAR_BASE + 'assets/chair-tracks-v30.json').then((r) => r.json()), opt(CHAR_TYPE), opt(TYPEWRITER)]);
    const ld = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await ld().parseAsync(buf, '');
    const extra = {};
    if (tbuf) extra.typeClip = (await ld().parseAsync(tbuf, '')).animations[0];
    if (wbuf) { typewriters = createTypewriters(sc, await ld().parseAsync(wbuf, ''), DESKS, PACK_S);
      for (const g of typewriters.groups) L.attach(g); for (const g of typewriters.groups) SC.addDynamic(g); SC.markDirty(); extra.typewriters = typewriters; }
    editor = createEditor(sc, office, gltf, tracks, extra);
    L.attach(editor.holder); SC.addDynamic(editor.holder);
    window.__editor = editor; window.__tw = typewriters; window.__look = (pos, tgt) => { const c = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100); c.position.copy(B(...pos)); c.lookAt(B(...tgt)); c.layers.enableAll(); r.render(sc, c); return r.domElement.toDataURL('image/jpeg', 0.85); };
    if (pending) { editor.apply(pending, live.now()); pending = null; }
    showWho(); setInterval(showWho, 1000);
  } catch (e) { if (who) who.textContent = '👤 Редактор не загрузился: ' + e.message; window.__err = String(e); }
}
// ☰ panel: animation chains and clips (registry), director status
addRepertoire(PANEL.section, CHAR_BASE + 'assets/registry-live.json', () => {
  const st = editor ? editor.status() : null; if (!st) return null;
  if (st.mode === 'walk' || st.mode === 'turn') return 'walk';
  if (st.seat?.startsWith('desk')) return 'desk'; if (st.seat?.startsWith('bench')) return 'bench';
  return st.mode === 'idle' ? 'spot' : null;
});
let lastWorld = null;
addDirectorStatus(PANEL.section, () => ({ net, world: lastWorld, now: live ? live.now() : Date.now() }));
live = connectLive(RELAY, (w) => { lastWorld = w; if (editor) editor.apply(w, live.now()); else pending = w; }, (s) => { net = s; showWho(); }, { weather: applyWeather, blinds: (b) => applyBlinds(b, true) });

function tvNews(on) {
  if (!tvMat || !tvOrig) return;
  const t = on && newsTex ? newsTex : null;
  tvMat.map = t || tvOrig.map; tvMat.emissiveMap = t || tvOrig.emissiveMap;
}
function incoming() {
  if (ttyBusy || !tty.length) return;
  ttyBusy = true; for (const a of tty) a.reset().play(); tvNews(true);
  setTimeout(() => { ttyBusy = false; }, 9700);
  setTimeout(() => tvNews(false), 30000);
}
$('tty').addEventListener('click', incoming);

// ---------- per-frame life: clock, paper feed, TV flicker
let cpuMs = 0;
let prev = performance.now(), fAcc = 0, fN = 0, flick = 1, flickT = 0, rollT = 25 + Math.random() * 15, roll = -1;
function tick(now) {
  const raw = (now - prev) / 1000, dt = Math.min(0.1, raw); prev = now;
  if (QL.tick(raw, window.__ready)) applyQuality();
  if (!window.__pause) step(dt);
  requestAnimationFrame(tick);
}
window.__dbg = () => ({ paper: paperMat && paperMat.map.offset.y, target: paperTarget, tvNews: !!(tvMat && newsTex && tvMat.map === newsTex), clocks: clockPivots.length, tty: tty.length, typebox: !!typebox });
window.__step = (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt, i === n - 1); };   // for automated checks
function step(dt, draw = true) {
  const t0 = performance.now();
  if (mixer) mixer.update(dt);
  WX?.update(dt); SB?.update(dt, r.getPixelRatio());
  const d = wx && Number.isFinite(wx.utc) ? new Date(live.now() + wx.utc * 1000) : null;   // the clock shows the time of the city outside
  const h = d ? d.getUTCHours() : new Date().getHours(), m = d ? d.getUTCMinutes() : new Date().getMinutes(), s = d ? d.getUTCSeconds() : new Date().getSeconds();
  const ang = { hour: ((h % 12) + m / 60) * Math.PI / 6, minute: (m + s / 60) * Math.PI / 30, second: s * Math.PI / 30 };
  for (const p of clockPivots) p.o.rotation.set(0, 0, p.sign * ang[p.kind]);
  if (typebox && paperMat && paperMat.map) {                    // one line of paper per carriage return
    const x = typebox.position.x;
    if (lastX !== null) {
      const dx = x - lastX;
      if (dx < -0.004 && !returning) { returning = true; paperTarget -= 24 / 4096; }
      if (dx >= 0) returning = false;
    }
    lastX = x;
    const o = paperMat.map.offset; o.y += (paperTarget - o.y) * Math.min(1, dt * 12);
  }
  if (tvMat) {
    flickT -= dt; if (flickT <= 0) { flickT = 0.08 + Math.random() * 0.06; flick = 0.94 + Math.random() * 0.1; }
    tvMat.emissiveIntensity += (flick - tvMat.emissiveIntensity) * Math.min(1, dt * 20);
    rollT -= dt; if (rollT <= 0) { roll = 0; rollT = 20 + Math.random() * 20; }
    if (roll >= 0) {
      roll += dt / 0.3; const y = roll >= 1 ? 0 : roll;
      for (const t of new Set([tvMat.map, tvMat.emissiveMap])) if (t) t.offset.y = y;
      if (roll >= 1) roll = -1;
    }
  }
  if (editor) editor.update(dt, window.__simNow ?? live.now());   // __simNow: automated checks run on their own clock
  if (!draw) return;
  L.update(dt, editor && editor.moving() && QL.level.live, SC.enabled); ctl.update(); SC.render();
  cpuMs += (performance.now() - t0 - cpuMs) * 0.1;
  fAcc += dt; fN++;
  if (fAcc >= 2) {
    const fps = fN / fAcc; fpsEl.textContent = `${Math.round(fps)} кадров/с · ${QL.level.label}${QL.auto ? ' (авто)' : ''}`;
    diag.textContent = `Для отладки: ${gpuName || 'видеокарта неизвестна'} · ${r.domElement.width}×${r.domElement.height} · кадр ${Math.round(1000 / fps)} мс, из них подготовка ${Math.round(cpuMs)} мс · ${SC.enabled ? 'кэш комнаты' : 'без кэша'}, отрисовок ${r.info.render.calls}`;
    fAcc = 0; fN = 0;
  }
}
requestAnimationFrame(tick);

fetchGLB(GLB).then(({ buffer, got }) => {
  status.textContent = 'Собираю сцену…';
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buffer, '', (g) => {
    setup(g);
    const s = ((performance.now() - T0) / 1000).toFixed(1).replace('.', ',');
    status.textContent = `Офис загружен: ${mb(got)} МБ за ${s} с`;
    document.body.classList.add('ready');
    window.__ready = true;
  }, (e) => { status.textContent = 'Ошибка сборки сцены: ' + e.message; window.__err = String(e); });
}).catch((e) => { status.textContent = 'Не удалось загрузить офис: ' + e.message; window.__err = String(e); });
