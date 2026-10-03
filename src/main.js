import {conversationGazeChars} from './social-turns.js';
import {createNeedSender} from './need-control.js';
import * as THREE from 'three';
import { loadSocialAssets, participationPacket } from './social-playback.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createLighting, SUN_DIR } from './lighting.js';
import { loadSettings, buildPanel, presetFor } from './settings.js';
import { addRepertoire } from './repertoire.js';
import { addDirectorStatus } from './director-status.js';
import { createEditor } from './editor.js';
import { createShared } from './office-shared.js';
import { connectLive } from './live.js';
import { createQuality } from './quality.js';
import { createStaticCache } from './cache.js';
import { CHAIR_NODE, DESKS, S as PACK_S, RADIUS, CHAIR_REST, chairBox, SPOTS } from './layout.js';
import { createCrowd } from './crowd.js';
import { GRID } from './navgrid.js';
import { createTypewriters } from './typewriter.js';
import { createPhones } from './phone.js';
import { createSound } from './sound.js';
import { createWeather } from './weather.js';
import { createBlinds } from './blinds.js';
import { createSunbeams } from './sunbeams.js';
import { createNeon } from './neon.js';
import { createTvScreen, loadVideoTexture } from './tv-crt.js';
import { createTvSchedule } from './tv-schedule.js';
import { createBulletin, BULLETIN_SEC } from './tv-bulletin.js';
import { createTalk } from './talk.js';
import { parseWhisky } from './whisky.js';

const Q = new URLSearchParams(location.search);
const GLB = Q.get('m') || 'assets/office-v31c.glb', GLB_SIZE = 3909868;   // v31: banker lamps (green glass, glow baked to a texture); v30: the lunch table
const RELAY_URL = 'https://135-106-229-50.sslip.io';     // shared newsroom: relay on the VPS (also hosts the character files)
const DEMO = window.__DEMO || Q.get('demo') || '';            // a scripted newsroom without the director (review pages)
const RELAY = ((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))(DEMO ? '' : Q.get('relay') ?? RELAY_URL);   // '/' = same origin (local test)
const CHAR_BASE = Q.get('charbase') ?? (RELAY && RELAY !== '/' ? RELAY + '/' : '');
const CHAR = Q.get('char') ?? CHAR_BASE + 'assets/editor2A-web-v01.glb';
const CHAR_TYPE = CHAR_BASE + 'assets/editor2A-type-v13.glb';          // add-on: rig + typing clip (editor2A v13, approved page «Редактор в офисе»)
const TYPEWRITER = 'assets/typewriter-v01.glb';                          // compact flat typewriter, pack table frame
const SMOKE = Q.get('smoke') ?? CHAR_BASE + 'assets/editor2A-smoke-web-v01.glb';
const COFFEE = Q.get('coffee') ?? CHAR_BASE + 'assets/editor2A-coffee-web-v01.glb';
const DRINK_L = CHAR_BASE + 'assets/editor2A-drinkL-web-v01.glb';   // add-on: coffee with the left hand while smoking («Курилка» v8)
const GESTURES = CHAR_BASE + 'assets/editor2A-gestures-web-v01.glb';     // add-on: small gestures in the pauses (MC Seated / MC Idles)
const PHONE = 'assets/phone-v02.glb';                                     // 1950s desk telephone (faceted, after the owner's reference), pack table frame
const PHONE_CLIPS = CHAR_BASE + 'assets/editor2A-phoneL-web-v01.glb';    // add-on: taking the handset (left hand, the nearest), talking seated and standing, hanging up
const LUNCH = Q.get('lunch') ?? CHAR_BASE + 'assets/editor2A-lunch-web-v02.glb';   // add-on: dishes, utensils, the eating clips
const WALKS = Q.get('walks') ?? CHAR_BASE + 'assets/editor2A-walks-web-v02.glb';   // add-on: Mixamo Walking1 (his walk since 29.09) + the drunk walk
const WHISKY = Q.get('whisky') ?? CHAR_BASE + 'assets/whisky-solo-v01.bin';     // whisky alone: the approved page v7 recorded (bar and desk), whisky.js
const FEETUP = CHAR_BASE + 'assets/editor2A-feetup-web-v01.glb';     // add-on: feet on the desk (MC Seated SitChairTableFeetUp + the chair's track), «Ноги на стол» v5
const WRITE = CHAR_BASE + 'assets/editor2A-write-web-v01.glb';       // add-on: writing by hand (MC Seated WriteLetter + the pack's pencil and sheet), «Пишет от руки» v6
const JAZZ = CHAR_BASE + 'assets/editor2A-jazz-web-v01.glb';         // add-on: listening to music at the TV, standing (5 loops), «Джаз у телевизора» v4
const TVSWITCH = CHAR_BASE + 'assets/editor2A-tvswitch-web-v01.glb'; // add-on: crouching at the TV to turn the channel knob, «Включает музыку» v2
const DANCE = CHAR_BASE + 'assets/editor2A-dance-web-v01.glb';       // add-on: five swing dances (Mixamo), «Танцы у телевизора» v1
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
r.localClippingEnabled = true;                               // the typewriter sheets: the part still inside the machine is cut off
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
function applyScene(s) {
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
  S.sky = o.sky; L.apply(eff(S)); WX?.apply(o.sky, o); SB?.set(o.sky === 'sun', S.beams); NE?.set(o.sky); SC?.markDirty(); showOutside();
}

// ---------- blinds: one setting for everyone (how far down, how shut); the sun and its beams follow them
let BL = null, SB = null, NE = null, blinds = { down: 0.63, tilt: 0 }, blindsUI = null, sendT = null;
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
const sendNeed=createNeedSender((person,need,value)=>fetch((RELAY === '/' ? '' : RELAY) + '/settings/needs', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ownerToken ? { Authorization: 'Bearer ' + ownerToken } : {}) }, body: JSON.stringify({ person, need, value }) })
);
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
const sound = createSound();                                   // ☰ → «Звук»: the phone ring (off until the viewer switches it on)
{ const d = PANEL.section('Звук', 'sound'), l = document.createElement('label'), cb = document.createElement('input'), sp = document.createElement('span');
  l.className = 'row'; cb.type = 'checkbox'; cb.id = 'sound-phone'; cb.checked = sound.on; sp.textContent = '🔔 Звонок телефона';
  cb.addEventListener('change', () => sound.set(cb.checked)); l.append(sp, cb); d.append(l); window.__sound = sound; }
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

let mixer = null, typebox = null, paperMat = null, tvMat = null, newsTex = null, tv = null, sched = null, bulletinTV = null;
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
  NE = createNeon(); sc.add(NE.group); SC.addDynamic(NE.group);   // the sign buzzes now and then: drawn every frame
  applyBlinds(blinds);
  applyWeather();
  if (paperMat && paperMat.map) paperTarget = paperMat.map.offset.y;
  { // CHANNEL 7: CRT shader + a broadcast grid shared by every viewer (channel and clip position come from UTC)
    let screen = null; g.scene.traverse((o) => { if (!screen && o.isMesh && /TV[ _]v14[ _]crt[ _]face/.test(o.name)) screen = o; });
    if (screen) {
      tv = createTvScreen(screen, { flipY: false });             // the CHANNEL 7 test card from the GLB stays in tv.testcard
      sched = createTvSchedule(tv, loadVideoTexture, { base: 'assets/tv/', cityHour: () => cityTime().h, night: 'jazz', now: () => (live ? live.now() : Date.now()) });
      bulletinTV = createBulletin({ fallback: () => newsTex?.image });   // NEWS BULLETIN: rendered clip + the story's headline
      window.__bulletin = (en = 'TEST BULLETIN') => { bulletinTV.start(en, 0); sched.bulletin(bulletinTV.texture, BULLETIN_SEC); };   // for checks
      window.__tv = () => ({ bulletin: bulletinTV.active, ch: sched.current, t: tv.uniforms.map.value?.userData?.video?.currentTime ?? null, snow: tv.uniforms.snow.value });
    }
  }
  new THREE.TextureLoader().load('assets/tv_news.jpg', (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; newsTex = t; });
  applyScene(S);
  $('tty').disabled = false;
  if (CHAR) loadEditor(g.scene);
}

// ---------- the people of the newsroom, driven by the shared director: world.chars = {id: {name, glb, chairBack, home, seq, from, cmd, at, label, …}}.
// A new person needs no change here: the director names him, his body comes from the VPS, the clips are shared (one skeleton).
// Old worlds ({editor}) are the columnist alone.
let talk = null, editor = null, live = null, pending = null, net = { online: false }, typewriters = null, shared = null, base = null, officeScene = null;
const people = {}, order = [];                                     // id → {ed, name, loading}; order: as the director lists them
const PLACE = { deskA: 'за столом A', deskB: 'за столом B', deskC: 'за столом C', benchS: 'на скамье', benchM: 'на скамье', benchN: 'на скамье', window: 'у окна', window2: 'у окна', teletype: 'у телетайпа' };
const charsOf = (w) => w?.chars || (w?.editor ? { columnist: { name: 'Колумнист', ...w.editor, seq: w.seq } } : {});
let focus = null;                                                  // the person the viewer picked (click on him): his scales and journal
function showWho() {
  if (!who) return;
  const lines = order.length ? order.map((id) => { const P = people[id], st = P.ed ? P.ed.status() : null;
    return `👤 ${P.name}` + (P.error ? ' не загрузился' : !st ? ' загружается…' : ': ' + (st.label || (st.mode === 'seated' ? 'сидит ' + (PLACE[st.seat] || '') : st.motion))); })
    : [base ? '👤 Ждём редакцию…' : '👤 Редакция загружается…'];
  let t = !net.online ? (net.reason === 'no_relay' ? 'редакция пока не на связи' : 'нет связи с редакцией') : net.viewers ? `смотрят: ${net.viewers}` : '';
  who.replaceChildren(...lines.map((l) => { const d = document.createElement('div'); d.textContent = l; return d; }), ...(t ? [Object.assign(document.createElement('div'), { textContent: t })] : []));
}
const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
const opt = (u) => get(u).catch(() => null);                          // add-ons are optional: without them he just sits
const ld = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function loadShared(office) {                                   // once: the clips' file, the add-ons, the things on the desks
  showWho();
  const [buf, tracks, tbuf, wbuf, sbuf, cbuf, dbuf, gbuf, lbuf, pbuf, pcbuf, wkbuf, whbuf, fubuf, wrbuf, jzbuf, tsbuf, dnbuf] = await Promise.all([get(CHAR), fetch(CHAR_BASE + 'assets/chair-tracks-v30.json').then((r) => r.json()), opt(CHAR_TYPE), opt(TYPEWRITER), SMOKE ? opt(SMOKE) : null, COFFEE ? opt(COFFEE) : null, opt(DRINK_L), opt(GESTURES), LUNCH ? opt(LUNCH) : null, opt(PHONE), opt(PHONE_CLIPS), WALKS ? opt(WALKS) : null, WHISKY ? opt(WHISKY) : null, opt(FEETUP), opt(WRITE), opt(JAZZ), opt(TVSWITCH), opt(DANCE)]);
  const parse = (b) => (b ? ld().parseAsync(b.slice(0), '').catch(() => null) : null);
  let social=null;try{social=await loadSocialAssets(get,b=>ld().parseAsync(b.slice(0),''));}catch(e){console.warn('social unavailable:',e);}
  const B = { social, buf, tracks, sbuf, lbuf, wkbuf, wrbuf, feetup: await parse(fubuf), jazz: await parse(jzbuf), tvswitch: await parse(tsbuf), dance: await parse(dnbuf), typeClip: tbuf ? (await parse(tbuf))?.animations[0] : null, gestures: await parse(gbuf) };
  if (wbuf) { typewriters = createTypewriters(sc, await ld().parseAsync(wbuf, ''), DESKS, PACK_S);
    for (const g of typewriters.groups) L.attach(g); for (const g of typewriters.groups) SC.addDynamic(g); }
  let phones = null;
  if (pbuf && pcbuf) { phones = createPhones(sc, await ld().parseAsync(pbuf, ''), DESKS, PACK_S, sound);     // phones on every desk; without the clips no phones
    for (const g of phones.groups) L.attach(g); for (const g of phones.groups) SC.addDynamic(g); window.__phones = phones; B.phoneClips = await parse(pcbuf); }
  let crowd = null;                                                              // walking together (Recast crowd); ?crowd=0 — the old one-person paths
  if (Q.get('crowd') !== '0') { try { crowd = await createCrowd(GRID, Object.keys(DESKS).map((k) => chairBox(k, CHAIR_REST)), RADIUS); window.__crowd = crowd; } catch (e) { console.warn('crowd unavailable:', e); } }
  shared = createShared({ scene: sc, office, typewriters, phones, coffeeAddon: await parse(cbuf), drinkLAddon: await parse(dbuf), crowd,
    whisky: (() => { try { return whbuf ? parseWhisky(whbuf) : null; } catch (e) { console.warn('whisky recording unreadable:', e); return null; } })() });
  for (const g of shared.groups) { L.attach(g); SC.addDynamic(g); } SC.markDirty();
  window.__tw = typewriters; window.__shared = shared;
  talk = createTalk({ scene: sc, addDynamic: (o) => SC.addDynamic(o), chars: () => conversationGazeChars(charsOf(latest),people), people: () => people, now: () => window.__simNow ?? live.now(), show: () => S.bubbles !== false });
  window.__talk = talk;
  window.__look = (pos, tgt) => { const c = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100); c.position.copy(B3(...pos)); c.lookAt(B3(...tgt)); c.layers.enableAll(); r.render(sc, c); return r.domElement.toDataURL('image/jpeg', 0.85); };
  base = B; setInterval(showWho, 1000);
  if (pending) { const w = pending; pending = null; onWorld(w); }
}
const B3 = (x, y, z) => new THREE.Vector3(x, z, -y);
const glbOf = (e) => (typeof e.glb === 'string' && /^assets\/[\w.-]+\.glb$/.test(e.glb) ? CHAR_BASE + e.glb : null);
async function loadPerson(id, e) {
  const P = people[id] = { name: typeof e.name === 'string' ? e.name.slice(0, 40) : id, ed: null, loading: true }; order.push(id); showWho();
  try {
    const url = glbOf(e), parse = (b) => (b ? ld().parseAsync(b.slice(0), '').catch(() => null) : null);
    const clips = await ld().parseAsync(base.buf.slice(0), '');                       // his own copy of the shared clips (the page edits clips in place)
    const bodyG = url && url !== CHAR ? await ld().parseAsync(await get(url), '') : clips;
    const extra = { shared, id, chairBack: Number.isFinite(e.chairBack) ? Math.max(-0.2, Math.min(0.2, e.chairBack)) : 0, home: e.home, mouth: e.mouth, phoneMouth: e.phoneMouth,
      social:base.social,socialPartner:(id)=>{const ed=people[id]?.ed,h=ed?.holder;if(!h)return null;h.updateMatrixWorld(true);const head=ed.root.getObjectByName('head'),face=head?.getWorldPosition(new THREE.Vector3());return {x:h.position.x,z:h.position.z,face:face?{x:face.x,y:face.y,z:face.z}:null};},
      talk, typeClip: base.typeClip, gestures: base.gestures, smoke: await parse(base.sbuf), lunch: await parse(base.lbuf), walks: await parse(base.wkbuf), feetup: base.feetup, write: await parse(base.wrbuf), jazz: base.jazz, tvswitch: base.tvswitch, dance: base.dance, camera: cam, renderer: r,
      ...(Q.has('drunk') ? { drunk: Q.get('drunk') !== '0' } : {}),
      ...(base.phoneClips ? { phones: shared.phonesFor(id), phoneClips: base.phoneClips } : {}) };
    const ed = createEditor(sc, officeScene, { scene: bodyG.scene, animations: clips.animations }, base.tracks, extra);
    if (ed.lunchGroup) { L.attach(ed.lunchGroup); SC.addDynamic(ed.lunchGroup); } for (const g of ed.writeGroups) { L.attach(g); SC.addDynamic(g); }
    L.attach(ed.holder); SC.addDynamic(ed.holder); if (ed.fx) SC.addDynamic(ed.fx); SC.markDirty();
    P.ed = ed; P.loading = false; if (!editor) { editor = ed; window.__editor = ed; }
    window.__people = people;
    // Initial commands are applied together, in time order, after all bodies load.
  } catch (e2) { P.error = String(e2); P.loading = false; console.warn('person', id, e2); window.__err = String(e2); }
  showWho();
}
let latest = null;let reportElapsed=0,reportPrevious='',reportSend=0;
function reportExecution(dt) {
  const now=live.now(),pairs=participationPacket(charsOf(latest),people);
  const signature=JSON.stringify(pairs.map(p=>[p.conversationId,p.actors]));
  const active=pairs.length>0&&pairs.every(p=>Object.values(p.actors).every(a=>a.ready));
  reportElapsed=active&&signature===reportPrevious&&dt<0.25?Math.min(2000,reportElapsed+dt*1000):0;reportPrevious=signature;
  if(now-reportSend<1000)return;reportSend=now;
  const actors={};eachPerson((ed,id)=>{const s=ed.socialStatus();actors[id]={loaded:s.loaded,seq:s.seq,activity:s.activity,executing:s.executing};});
  const styles=base?.social?.styles.map(x=>x.id)||[];
  live.execution({pairs:pairs.map(p=>({...p,elapsedMs:reportElapsed})),capabilities:{actors,styles}});reportElapsed=0;
}
let loadingPeople = false;const activatedPeople=new Set();
function onWorld(w) {
  latest = w;
  if (!base) { pending = w; return; }
  shared.initChairs(w.chairs);
  if (loadingPeople) {for(const [id] of Object.entries(charsOf(w)))if(activatedPeople.has(id))people[id].ed?.apply(w,window.__simNow??live.now());return;}
  const entries=Object.entries(charsOf(w)).filter(([id])=>/^[a-z][a-z0-9_]{0,30}$/.test(id));
  const missing=entries.filter(([id])=>!people[id]);
  if(missing.length) {
    loadingPeople=true;
    for(const [id] of entries)if(activatedPeople.has(id))people[id].ed?.apply(w.chars?w:{...w,chars:{[id]:charsOf(w)[id]}},window.__simNow??live.now());
    Promise.allSettled(missing.map(([id,e])=>loadPerson(id,e))).then(()=>{loadingPeople=false;if(latest)onWorld(latest);});
    return;
  }
  // A late viewer must replay the earlier departure before the later arrival.
  // Applying in model-download order can reserve a future destination over the earlier start.
  entries.sort(([a,x],[b,y])=>(x.at-y.at)||a.localeCompare(b));
  for(const [id] of entries){people[id].ed?.apply(w.chars?w:{...w,chars:{[id]:charsOf(w)[id]}},window.__simNow??live.now());if(people[id].ed)activatedPeople.add(id);}
  showWho();
}
window.__world = (w) => onWorld(w);                              // for automated checks: a world by hand (page opened with ?relay=)
const eachPerson = (f) => { for (const id of order) if (people[id].ed) f(people[id].ed, id); };
function loadEditor(office) { officeScene = office; loadShared(office).catch((e) => { if (who) who.textContent = '👤 Редакция не загрузилась: ' + e.message; window.__err = String(e); }); }
// click on a person: the ☰ panel opens on his scales and journal
{ const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  r.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  r.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return; down = null;
    ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    let best = null, bd = 0.32;                                                      // distance from the ray to his body line (office units)
    eachPerson((ed, id) => { const h = ed.root.getObjectByName('head'), f = ed.holder;
      if (!h) return; const a = f.getWorldPosition(new THREE.Vector3()).setY(0.15), b = h.getWorldPosition(new THREE.Vector3());
      const d = ray.ray.distanceSqToSegment(a, b); if (Math.sqrt(d) < bd) { bd = Math.sqrt(d); best = id; } });
    if (best) { focus = best; window.__focus = best; openPerson?.(best); }
  });
}
let openPerson = null;
// ☰ panel: animation chains and clips (registry), director status
addRepertoire(PANEL.section, CHAR_BASE + 'assets/registry-live.json', () => {
  const ed = (focus && people[focus]?.ed) || editor, st = ed ? ed.status() : null; if (!st) return null;
  if (st.mode === 'walk' || st.mode === 'turn') return 'walk';
  if (st.seat?.startsWith('desk')) return 'desk'; if (st.seat?.startsWith('bench')) return 'bench';
  return st.mode === 'idle' ? 'spot' : null;
});
let lastWorld = null;
openPerson = addDirectorStatus(PANEL.section, () => ({ net, world: lastWorld, now: live ? live.now() : Date.now(), focus, setFocus: (id) => { focus = id; }, setNeed: RELAY && !DEMO ? sendNeed : null, open: () => { if ($('settings').hidden) $('menu').click(); } }),
  RELAY ? () => fetch((RELAY === '/' ? '' : RELAY) + '/journal?n=150', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) : null);
live = connectLive(RELAY, (w) => { lastWorld = w; ttyFrom(w); bulletinFrom(w); onWorld(w); }, (s) => { net = s; showWho(); }, { weather: applyWeather, blinds: (b) => applyBlinds(b, true) });

if (DEMO === 'lunch') {   // review: at the desk → lunch on the bench, all six dishes one after another → back to work, round and round
  const CH = { A: 0, B: 0.1174, C: 0.1174 }, T = { A: -0.25, B: 0.1174, C: 0.1174 }, R = { A: 0.1174, B: 0.1174, C: 0.1174 };
  // the dish is chosen by the decision number (seq % 6): soup, steak, noodles, burger, sandwich, sweets
  const DISH_T = { 36: 22, 37: 17, 38: 42, 39: 27, 40: 27, 41: 35 };      // seq % 6: soup, steak, noodles, burger, sandwich, sweets
  const dishes = (Q.get('dishes') || window.__DISHES || '36,37,38,39,40,41').split(',').map((x) => [+x, DISH_T[+x] || 30]);   // a review page may show only some
  const script = [[{ seat: 'deskA' }, null, 'work', 'работает за столом A', CH, 8, 30],
    ...dishes.map(([sq, sec], i) => [i ? { seat: 'benchM' } : { seat: 'deskA' }, i ? null : { seat: 'benchM' }, 'lunch', 'обедает за общим столом', i ? R : CH, sec + (i ? 0 : 14), sq]),
    [{ seat: 'benchM' }, { seat: 'deskA' }, 'work', 'работает за столом A', T, 14, 42]];
  let i = 0, round = 0;
  const next = () => { const [from, cmd, activity, label, chairs, sec, sq] = script[i % script.length]; if (i && i % script.length === 0) round++; i++;
    const w = { seq: sq + round * 60, chairs, editor: { from, cmd, at: live.now(), label, activity, source: 'demo' } }; onWorld(w); setTimeout(next, sec * 1000); };
  net = { online: true, viewers: 0 }; next();
}
if (DEMO === 'smoke') {   // review: at the desk → a cigarette at the desk → a cigarette at the window → back to work, round and round
  const CH = { A: 0, B: 0.1174, C: 0.1174 }, T = { A: -0.25, B: 0.1174, C: 0.1174 };
  const script = [[{ seat: 'deskA' }, null, 'work', 'работает за столом A', CH, 12], [{ seat: 'deskA' }, null, 'smoke', 'курит за столом A', CH, 58],
    [{ seat: 'deskA' }, { spot: 'window' }, 'smoke', 'курит у окна', CH, 62], [{ spot: 'window' }, { seat: 'deskA' }, 'work', 'работает за столом A', T, 16]];
  let seq = 0, i = 0;
  const next = () => { const [from, cmd, activity, label, chairs, sec] = script[i % script.length]; i++; seq++;
    const w = { seq, chairs, editor: { from, cmd, at: live.now(), label, activity, source: 'demo' } }; onWorld(w); setTimeout(next, sec * 1000); };
  net = { online: true, viewers: 0 }; next();
}

if (DEMO === 'smokecoffee') {   // review stand: ?scn=desk — at desk A a cigarette with coffee (a sip after every drag); ?scn=window — a cigarette standing at the window; ?scn=type — typing (the paper feeds out)
  const CH = { A: 0, B: 0.1174, C: 0.1174 }, scn = window.__SCN || Q.get('scn') || 'desk';
  const script = scn === 'window' ? [[{ spot: 'window' }, null, 'smoke', 'курит у окна', CH, 58], [{ spot: 'window' }, null, 'wait', 'стоит у окна', CH, 5]]
    : scn === 'type' ? [[{ seat: 'deskA' }, null, 'work', 'печатает за столом A', CH, 600]]
    : [[{ seat: 'deskA' }, null, 'work', 'работает за столом A', CH, 5], [{ seat: 'deskA' }, null, 'smoke_coffee', 'курит и пьёт кофе за столом A', CH, 49]];
  let seq = 0, i = 0;
  const next = () => { const [from, cmd, activity, label, chairs, sec] = script[i % script.length]; i++; seq++;
    const w = { seq, chairs, editor: { from, cmd, at: live.now(), label, activity, source: 'demo' } }; onWorld(w); setTimeout(next, sec * 1000); };
  net = { online: true, viewers: 0 }; next();
}
if (DEMO === 'gestures') {   // review: small gestures in the pauses — resting at the desk (the machine is cleared away), standing at the window; fresh, then tired
  const CH = { A: 0, B: 0.1174, C: 0.1174 }, T = { A: -0.25, B: 0.1174, C: 0.1174 };
  const script = [[12, { seat: 'deskA' }, null, 'work', 'работает за столом A', 30, CH, 10], [374, { seat: 'deskA' }, null, 'rest_desk', 'отдыхает за столом A', 30, CH, 50],
    [128, { seat: 'deskA' }, { spot: 'window' }, 'wait', 'стоит у окна', 30, CH, 40], [128, { spot: 'window' }, { seat: 'deskA' }, 'rest_desk', 'устал, отдыхает за столом A', 80, T, 60],
    [313, { seat: 'deskA' }, { spot: 'window' }, 'wait', 'устал, стоит у окна', 80, CH, 35], [11, { spot: 'window' }, { seat: 'deskA' }, 'work', 'работает за столом A', 30, T, 20]];
  let i = 0;
  const next = () => { const [seq, from, cmd, activity, label, fatigue, chairs, sec] = script[i % script.length]; i++;
    const w = { seq, chairs, editor: { from, cmd, at: live.now(), label, activity, fatigue, source: 'demo' } }; onWorld(w); setTimeout(next, sec * 1000); };
  net = { online: true, viewers: 0 }; next();
}
if (DEMO === 'phone') {   // review: the owner calls (button «Позвонить»): at the desk he answers seated; standing at the window he walks to the phone
  const CH = { A: 0, B: 0.1174, C: 0.1174 }, T = { A: -0.25, B: 0.1174, C: 0.1174 };
  let seq = 100, place = { seat: 'deskA' }, timer = 0;
  const send = (from, cmd, activity, label, chairs) => { seq++; const w = { seq, chairs, editor: { from, cmd, at: live.now(), label, activity, source: 'demo' } };
    onWorld(w); };
  const btn = document.createElement('button'); btn.id = 'call'; btn.textContent = '☎️ Позвонить';
  btn.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:20;padding:10px 18px;font-size:16px';
  document.body.appendChild(btn);
  const mv = document.createElement('button'); mv.id = 'where'; mv.textContent = '🚶 К окну';
  mv.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:20;padding:8px 14px;font-size:14px';
  document.body.appendChild(mv);
  let inCall = false;
  const idle = () => { inCall = false; btn.textContent = '☎️ Позвонить';
    if (place.seat) send(place, null, 'rest_desk', 'отдыхает за столом A', CH); else send(place, null, 'wait', 'стоит у окна', T); };
  mv.onclick = () => { if (inCall) return; const to = place.seat ? { spot: 'window' } : { seat: 'deskA' };
    send(place, to, to.seat ? 'rest_desk' : 'wait', to.seat ? 'отдыхает за столом A' : 'стоит у окна', place.seat ? CH : T); place = to; mv.textContent = to.seat ? '🚶 К окну' : '🪑 За стол'; };
  btn.onclick = () => { clearTimeout(timer);
    if (inCall) { idle(); return; }                                 // «Положить трубку»: the call is over
    inCall = true; btn.textContent = '📴 Положить трубку';
    if (place.seat) send(place, null, 'phone', 'говорит по телефону за столом A', CH);
    else { send(place, { spot: 'phoneA' }, 'phone', 'подходит к телефону', T); place = { spot: 'phoneA' }; mv.textContent = '🪑 За стол'; }
    timer = setTimeout(idle, 60000); };
  window.__call = () => btn.onclick(); window.__where = () => mv.onclick();
  net = { online: true, viewers: 0 }; send(place, null, 'rest_desk', 'отдыхает за столом A', CH);
}

// NEWS BULLETIN on the TV for 20 s when the editor takes a new story off the wire (director's teletype tasks)
const stories = new Set();
function bulletinFrom(w) { for (const e of Object.values(charsOf(w))) bulletinOf(e); }
function bulletinOf(e) {
  const m = /правит «(.+?)»/.exec(e?.label || '');
  const key = e?.story?.id || (m ? m[1] : null);                  // the director names the story; old worlds: from the label
  if (!key || stories.has(key)) return; stories.add(key);          // only the first time he takes this story
  if (!sched || !bulletinTV || !Number.isFinite(e.at)) return;
  const since = Math.max(0, (live.now() - e.at) / 1000);           // a late viewer gets only the rest of it
  if (BULLETIN_SEC - since > 1) { bulletinTV.start(e.story?.en || '', since); sched.bulletin(bulletinTV.texture, BULLETIN_SEC - since); }
}
// the teletype clacks when a story really comes in on the director's wire (3-4 an hour), for every viewer at once
let ttySeen = null;
function ttyFrom(w) {
  const t = w?.teletype; if (!t?.id || t.id === ttySeen) return;
  const first = ttySeen === null; ttySeen = t.id;
  if (!first || (live.now() - t.at) < 10000) incoming();          // a viewer who opens the page later does not hear an old story
}
function incoming() {
  if (ttyBusy || !tty.length) return;
  ttyBusy = true; for (const a of tty) a.reset().play();
  setTimeout(() => { ttyBusy = false; }, 9700);
}
$('tty').addEventListener('click', incoming);

// MUSIC ON THE TV (director's activity 'tvmusic', owner 30.09): someone turns the knob and the TV plays the music channel for everybody
// until world.tv.until. A viewer who sees the knob turned switches at that moment; the others (late ones) at world.tv.from.
let tvSeen = null, tvTune = null, knobAt = 0;
function tvMusic(now) {
  if (!sched) return;
  const t = latest?.tv;
  if (t !== tvSeen) { tvSeen = t; tvTune = t && t.ch === 'jazz' && Number.isFinite(t.from) && Number.isFinite(t.until) && Number.isFinite(t.at) ? { ch: t.ch, from: t.from, until: t.until, at: t.at } : null;
    sched.tune(tvTune && knobAt >= tvTune.at ? { ...tvTune, from: Math.min(tvTune.from, knobAt) } : tvTune); }
  if (tvTune && !(knobAt >= tvTune.at) && now < tvTune.until) eachPerson((ed) => { if (!(knobAt >= tvTune.at) && ed.knobTurn() > 0.5) { knobAt = now; sched.tune({ ...tvTune, from: Math.min(tvTune.from, now) }); } });
}
// ---------- per-frame life: clock, paper feed, TV flicker
let cpuMs = 0;
let prev = performance.now(), fAcc = 0, fN = 0;
function cityTime() {                                           // time of the city outside (relay weather), else local
  const d = wx && Number.isFinite(wx.utc) && live ? new Date(live.now() + wx.utc * 1000) : null;
  const n = new Date();
  return d ? { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() } : { h: n.getHours(), m: n.getMinutes(), s: n.getSeconds() };
}
function tick(now) {
  const raw = (now - prev) / 1000, dt = Math.min(0.1, raw); prev = now;
  if (QL.tick(raw, window.__ready)) applyQuality();
  if (!window.__pause) step(dt);
  requestAnimationFrame(tick);
}
window.__dbg = () => ({ paper: paperMat && paperMat.map.offset.y, target: paperTarget, tv: sched ? sched.current : null, clocks: clockPivots.length, tty: tty.length, typebox: !!typebox });
window.__step = (dt, n = 1, draw = true) => { for (let i = 0; i < n; i++) step(dt, draw && i === n - 1); };   // for automated checks
function step(dt, draw = true) {
  const t0 = performance.now();
  if (mixer) mixer.update(dt);
  WX?.update(dt); SB?.update(dt, r.getPixelRatio()); NE?.update(dt);
  const { h, m, s } = cityTime();                               // the clock shows the time of the city outside
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
  if (tv) {                                                     // flicker and snow live in tv-crt.js; the room glow follows the screen
    sched.update(); bulletinTV?.update(dt); tv.update(dt);
    if (tvMat) tvMat.emissiveIntensity = 1 + tv.uniforms.flicker.value - 0.5 * tv.uniforms.snow.value;
  }
  { const now = window.__simNow ?? live.now(); talk?.beginFrame(); eachPerson((ed) => ed.update(dt, now)); talk?.flush(); shared?.applyProps(); tvMusic(now); }
  talk?.update((cam.top - cam.bottom) / cam.zoom);                  // bubbles over the heads (invitations)   // __simNow: automated checks run on their own clock
  typewriters?.update(dt);                                      // paper feed of the desk typewriters
  if (!draw) return;
  let moving = false; eachPerson((ed) => { moving = moving || ed.moving(); });
  L.update(dt, moving && QL.level.live, SC.enabled); ctl.update(); SC.render();
  if(live?.execution && !DEMO && window.__simNow===undefined) reportExecution(dt);
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

if (DEMO === 'invite') {   // review stand (owner 30.09): one calls the other for a smoke; the answer is yes / no / not now — a bubble (the thing + the answer) and the head
  const NAME = { columnist: 'Колумнист', reporter: 'Репортёр' }, HOME = { columnist: 'deskA', reporter: 'deskB' }, SPOT = ['window', 'window2'];
  const SEATS_OF = { deskA: DESKS.A, deskB: DESKS.B }, DESK = { deskA: 'столом A', deskB: 'столом B' }, ACC = { columnist: 'колумниста', reporter: 'репортёра' };
  const body = { columnist: { name: 'Колумнист', glb: 'assets/editor2A-web-v01.glb', home: 'deskA', chairBack: 0 },
    reporter: { name: 'Репортёр', glb: 'assets/reporter-web-v03.glb', home: 'deskB', chairBack: 0.05, mouth: [-4.1, -4.2, 0], phoneMouth: [-1.7, -20.7, 0] } };
  const LAG = 4, C = {}, NOW = () => window.__simNow ?? live.now(); let wseq = 0, timers = [], busy = false, who0 = 'columnist';
  const send = () => { wseq++; onWorld({ seq: wseq, chairs: { A: -0.25, B: -0.25, C: -0.25 }, chars: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { ...body[k], ...v }])) }); };
  const decide = (id, from, cmd, activity, label, extra = {}) => { C[id] = { seq: (C[id]?.seq || 0) + 1, from, cmd, at: NOW(), activity, label, source: 'demo', talk: C[id]?.talk, ...extra }; };   // the last words stay (their bubble runs out by itself)
  const say = (id, to, mark) => { C[id] = { ...C[id], talk: { at: NOW(), to, icon: 'smoke', mark } }; };
  let t0 = 0; const later = (sec, f) => timers.push({ t: t0 + sec * 1000, f });   // on the page's clock (the automated checks step it)
  const tick = () => { const T = NOW(); for (const x of timers.filter((x) => T >= x.t)) { timers.splice(timers.indexOf(x), 1); x.f(); send(); } };
  setInterval(tick, 50);
  const atDesk = (id) => decide(id, { seat: HOME[id] }, null, 'work', 'работает за ' + DESK[HOME[id]]);
  for (const id of ['columnist', 'reporter']) atDesk(id);
  net = { online: true, viewers: 0 }; send();
  // the panel
  const css = 'font:15px/1.3 system-ui,sans-serif;padding:8px 12px;border-radius:8px;border:1px solid #6b5a48;background:#f4e8cc;color:#2e2219;cursor:pointer';
  const box = document.createElement('div'); box.id = 'invite';
  box.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:20;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;max-width:calc(100vw - 32px);background:rgba(30,22,16,.82);padding:10px 12px;border-radius:12px;color:#f4e8cc;font:14px system-ui,sans-serif';
  const line = document.createElement('div'); line.style.cssText = 'flex-basis:100%;text-align:center;min-height:1.3em';
  const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = css; b.onclick = f; box.appendChild(b); return b; };
  const whoBtn = mk('', () => { if (busy) return; who0 = who0 === 'columnist' ? 'reporter' : 'columnist'; paint(); });
  const bYes = mk('🚬 Да', () => run('yes')), bNo = mk('🚬 Нет', () => run('no')), bLater = mk('🚬 Не сейчас', () => run('later'));
  box.appendChild(line); document.body.appendChild(box);
  const paint = (msg) => { const o = who0 === 'columnist' ? 'reporter' : 'columnist';
    whoBtn.textContent = `Зовёт: ${NAME[who0]} → ${ACC[o]}`; for (const b of [whoBtn, bYes, bNo, bLater]) { b.disabled = busy; b.style.opacity = busy ? 0.5 : 1; }
    line.textContent = msg || (busy ? '' : 'Выберите, кто зовёт, и ответ приглашённого'); };
  function run(ans) {
    if (busy) return; busy = true; timers = []; t0 = NOW();
    const a = who0, b = a === 'columnist' ? 'reporter' : 'columnist';
    paint(`${NAME[a]} зовёт ${ACC[b]} покурить…`);
    decide(a, { seat: HOME[a] }, null, 'invite', `зовёт ${ACC[b]} покурить`); say(a, b, 'q'); send();
    later(2.2, () => { say(b, a, ans); paint(`${NAME[b]}: ${ans === 'yes' ? 'да' : ans === 'no' ? 'нет' : 'не сейчас'}`); });
    // who stands where: the pair of places with the shorter walk in sum (then nobody walks past the other already standing there)
    const dist = (id, k) => { const s0 = SEATS_OF[HOME[id]], p = SPOTS[k]; return Math.hypot(s0.x - p.x, s0.z - p.z); };
    const sp = dist(a, SPOT[0]) + dist(b, SPOT[1]) <= dist(a, SPOT[1]) + dist(b, SPOT[0]) ? { [a]: SPOT[0], [b]: SPOT[1] } : { [a]: SPOT[1], [b]: SPOT[0] };
    if (ans !== 'yes') sp[a] = SPOT[0];                                  // alone: the usual place
    // the one who called gets up first; the other finishes his line and follows a few seconds later — so they do not smoke in step (owner 30.09)
    later(4.5, () => decide(a, { seat: HOME[a] }, { spot: sp[a] }, 'smoke', 'курит у окна'));
    if (ans === 'yes') later(4.5 + LAG, () => decide(b, { seat: HOME[b] }, { spot: sp[b] }, 'smoke', 'курит у окна'));
    if (ans === 'later') { sp[b] = SPOT[1]; later(16, () => { decide(b, { seat: HOME[b] }, { spot: sp[b] }, 'smoke', 'курит у окна'); paint(`${NAME[b]} подошёл позже`); }); }
    const back = (id, sec) => later(sec, () => decide(id, { spot: sp[id] }, { seat: HOME[id] }, 'work', 'работает за ' + DESK[HOME[id]]));
    const tb = ans === 'later' ? 16 : 4.5 + LAG;
    back(a, 4.5 + 66); if (ans !== 'no') back(b, tb + 66);
    later((ans === 'no' ? 4.5 : tb) + 66 + 12, () => { busy = false; paint(); });
  }
  paint(); window.__invite = { run, tick, who: (w) => { who0 = w; paint(); }, C };
}
