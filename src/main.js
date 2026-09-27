import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const GLB = 'assets/office-v27.glb', GLB_SIZE = 10621932;
const $ = (id) => document.getElementById(id);
const status = $('status'), bar = $('bar'), fpsEl = $('fps');
document.body.classList.add('js');
const T0 = performance.now();
const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',');

// ---------- renderer, light, environment (as in the page brief)
const r = new THREE.WebGLRenderer({ antialias: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.toneMapping = THREE.ACESFilmicToneMapping;
r.outputColorSpace = THREE.SRGBColorSpace;
$('view').appendChild(r.domElement);
const sc = new THREE.Scene();
sc.background = new THREE.Color(0x1b1714);
const pm = new THREE.PMREMGenerator(r);
sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
sc.environmentIntensity = 0.45;
sc.add(new THREE.HemisphereLight(0xfff1e0, 0x3a3530, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(4, 10, 6); sc.add(sun);

// ---------- main camera: orthographic, south-east (Blender coords -> three: x, z, -y)
const B = (x, y, z) => new THREE.Vector3(x, z, -y);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
cam.position.copy(B(5.3, -7.05, 4.5));
const target = B(0.4, 1.5, 1.5);
function fit() {
  const a = innerWidth / innerHeight;
  const v = a < 11.33 / 8.5 ? Math.min(8.2 / a, 16) : 8.5;   // portrait phones: crop the sides a little
  cam.left = -v * a / 2; cam.right = v * a / 2; cam.top = v / 2; cam.bottom = -v / 2;
  cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight);
}
fit(); addEventListener('resize', fit);
const ctl = new OrbitControls(cam, r.domElement);
ctl.target.copy(target); ctl.enableDamping = true; ctl.screenSpacePanning = true;
ctl.minZoom = 0.8; ctl.maxZoom = 5;
const off = cam.position.clone().sub(target), az0 = Math.atan2(off.x, off.z);
ctl.minAzimuthAngle = az0 - 0.7; ctl.maxAzimuthAngle = az0 + 0.7;
ctl.minPolarAngle = 0.75; ctl.maxPolarAngle = 1.45;
ctl.update();

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
  sc.add(g.scene);
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
  if (paperMat && paperMat.map) paperTarget = paperMat.map.offset.y;
  if (tvMat) tvOrig = { map: tvMat.map, emissiveMap: tvMat.emissiveMap };
  new THREE.TextureLoader().load('assets/tv_news.jpg', (t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; newsTex = t;
  });
  setTimeout(incoming, 6000); setInterval(incoming, 45000);
  $('tty').disabled = false;
}

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
let prev = performance.now(), fAcc = 0, fN = 0, flick = 1, flickT = 0, rollT = 25 + Math.random() * 15, roll = -1;
function tick(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  if (!window.__pause) step(dt);
  requestAnimationFrame(tick);
}
window.__dbg = () => ({ paper: paperMat && paperMat.map.offset.y, target: paperTarget, tvNews: !!(tvMat && newsTex && tvMat.map === newsTex), clocks: clockPivots.length, tty: tty.length, typebox: !!typebox });
window.__step = (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt, i === n - 1); };   // for automated checks
function step(dt, draw = true) {
  if (mixer) mixer.update(dt);
  const d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
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
  if (!draw) return;
  ctl.update(); r.render(sc, cam);
  fAcc += dt; fN++; if (fAcc >= 2) { fpsEl.textContent = `${Math.round(fN / fAcc)} кадров/с`; fAcc = 0; fN = 0; }
}
requestAnimationFrame(tick);

fetchGLB(GLB).then(({ buffer, got }) => {
  status.textContent = 'Собираю сцену…';
  new GLTFLoader().parse(buffer, '', (g) => {
    setup(g);
    const s = ((performance.now() - T0) / 1000).toFixed(1).replace('.', ',');
    status.textContent = `Офис загружен: ${mb(got)} МБ за ${s} с`;
    document.body.classList.add('ready');
    window.__ready = true;
  }, (e) => { status.textContent = 'Ошибка сборки сцены: ' + e.message; window.__err = String(e); });
}).catch((e) => { status.textContent = 'Не удалось загрузить офис: ' + e.message; window.__err = String(e); });
