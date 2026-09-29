import * as THREE from 'three';
import { NEON } from './neon.js';

// Blender (x, y, z) -> three (x, z, -y)
const B = (x, y, z) => new THREE.Vector3(x, z, -y);

// warm 2200 K ... cool 4000 K (approximate blackbody tints)
const TEMPS = [[1.0, 0.82, 0.64], [1.0, 0.75, 0.47], [1.0, 0.66, 0.33], [1.0, 0.58, 0.23]];
export function tint(warmth) {
  const t = Math.min(0.999, Math.max(0, warmth)) * (TEMPS.length - 1), i = Math.floor(t), f = t - i;
  const a = TEMPS[i], b = TEMPS[i + 1];
  return new THREE.Color(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

// desk lamps: centre of the green shade (Blender coords); the chair side of each desk is +y
const DESK = { A: [-3.52, 1.766], B: [1.08, 2.67], C: [4.58, 2.666] };
const DESK_I = 5.0, FLOOR_I = 22.0, TV_I = 0.6, NEON_I = 24;
// light from the windows and the sky dome for each state of the weather: [window, hemisphere sky, hemisphere ground]
const SKY_LIGHT = { night: [0xb9c7ff, 0xffe9d0, 0x2a2420], sun: [0xfff0d8, 0xe4ecf8, 0x5a4a3c], cloudy: [0xe2e8f0, 0xdfe4ea, 0x4a4440],
  rain: [0xc8d2de, 0xcfd6de, 0x3a3634], snow: [0xeef2fb, 0xedf1f8, 0x6a6660] };

// afternoon sun through the west windows: direction the light travels (from west-south-west, 32° above the horizon)
const EL = 32 * Math.PI / 180, AZ = 18 * Math.PI / 180;
export const SUN_DIR = new THREE.Vector3(Math.cos(EL) * Math.cos(AZ), -Math.sin(EL), -Math.cos(EL) * Math.sin(AZ));

export function createLighting(sc, r) {
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.shadowMap.autoUpdate = false;                       // the room is static: refresh a few times a second

  const hemi = new THREE.HemisphereLight(0xffe9d0, 0x2a2420, 0.5);
  const win = new THREE.DirectionalLight(0xb9c7ff, 0.45);   // cool light from the west windows
  win.position.copy(B(-12, 1, 9)); win.target.position.copy(B(0, 0, 0));
  sc.add(hemi, win, win.target);
  // the sun: hard light with shadows, so the window frames and the slats draw stripes on the floor and desks
  const sun = new THREE.DirectionalLight(0xffe6c4, 0);
  { const c = new THREE.Vector3(0, 2, 0); sun.target.position.copy(c); sun.position.copy(c).addScaledVector(SUN_DIR, -20);
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02; sun.shadow.radius = 2;
    const cam = new THREE.OrthographicCamera(); cam.position.copy(sun.position); cam.lookAt(c); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse, lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = lo.clone().negate(), v = new THREE.Vector3();
    for (const x of [-5.45, 3.5]) for (const y of [0, 4.75]) for (const z of [-6.05, 6.05]) { v.set(x, y, z).applyMatrix4(inv); lo.min(v); hi.max(v); }
    const sc_ = sun.shadow.camera; sc_.left = lo.x; sc_.right = hi.x; sc_.bottom = lo.y; sc_.top = hi.y; sc_.near = -hi.z - 1; sc_.far = -lo.z + 1; sc_.updateProjectionMatrix(); }
  sc.add(sun, sun.target);
  // red light of the neon sign across the street: through the windows and the blinds onto the floor (night only, steady)
  const neonL = new THREE.SpotLight(0xff3346, 0, 16, 1.05, 0.75, 2);
  neonL.position.set(...NEON.light); neonL.target.position.set(-1.2, 0.2, NEON.light[2] + 0.4);   // the glow comes from above the sign: over the sill, onto the floor
  neonL.shadow.bias = -0.0004; neonL.shadow.normalBias = 0.02; neonL.shadow.radius = 3; neonL.shadow.camera.near = 0.2; neonL.shadow.camera.far = 16;
  sc.add(neonL, neonL.target);

  const spot = (pos, tgt, angle, pen, near) => {
    const l = new THREE.SpotLight(0xffffff, 1, 0, angle, pen, 2);
    l.position.copy(pos); l.target.position.copy(tgt);
    l.castShadow = true; l.shadow.bias = -0.0004; l.shadow.normalBias = 0.015; l.shadow.radius = 4;
    l.shadow.camera.near = near; l.shadow.camera.far = 7;
    sc.add(l, l.target); return l;
  };
  const lamps = {};
  // banker lamps sit at the back-right corner of each desk: aim into the desk (−x, +y), cut the light off before the floor
  for (const [k, [x, y]] of Object.entries(DESK)) {
    const l = spot(B(x - 0.02, y + 0.05, 1.675), B(x - 0.45, y + 0.35, 1.18), 0.8, 0.9, 0.03);
    l.distance = 1.5; lamps[k] = l;
  }
  lamps.floor = spot(B(4.88, -5.62, 2.2), B(4.88, -5.62, 0), 1.15, 0.85, 0.05);
  const tv = new THREE.PointLight(0x9fb8ff, TV_I, 4, 2);   // blue-grey spill in front of the screen
  tv.position.copy(B(2.77, -0.87, 1.75)); sc.add(tv);

  const mats = { desk: {}, amber: null, bulb: null }, base = new Map();
  let tvMat = null, needs = true, tAcc = 0, cur = null;

  function attach(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const ms = [].concat(o.material);
      const city = /CITY/.test(o.name) || /CITY/.test(o.parent?.name || '');
      const lampItself = /FLOOR_LAMP/.test(o.name) || /FLOOR_LAMP/.test(o.parent?.name || '');
      o.receiveShadow = !city;
      o.castShadow = !city && !lampItself && !ms.some((m) => m.transparent);
      for (const m of ms) {
        const d = m.name.match(/^OFFICE \| lamp underside ([ABC])$/); if (d) mats.desk[d[1]] = m;
        if (m.name === 'LAMP | amber glass') mats.amber = m;
        if (m.name === 'LAMP | bulb') mats.bulb = m;
        if (m.name === 'TV | screen image') tvMat = m;
        if (!base.has(m)) base.set(m, m.emissiveIntensity);
      }
    });
    if (cur) apply(cur);
  }

  function apply(s) {
    cur = s;
    hemi.intensity = s.ambient; win.intensity = s.windowLight;
    const sl = SKY_LIGHT[s.sky] || SKY_LIGHT.night;
    win.color.setHex(sl[0]); hemi.color.setHex(sl[1]); hemi.groundColor.setHex(sl[2]);
    sc.environmentIntensity = s.env; r.toneMappingExposure = s.exposure;
    const sunny = s.sky === 'sun' && (s.sunLight ?? 0) > 0;
    sun.intensity = sunny ? s.sunLight : 0; sun.castShadow = sunny && s.shadows;
    const neonOn = s.sky === 'night' && (s.neon ?? 0) > 0;
    neonL.intensity = neonOn ? NEON_I * s.neon : 0; neonL.castShadow = neonOn && s.shadows;
    const ns = { low: 512, medium: 1024, high: 2048 }[s.shadowQ] || 1024;
    if (neonL.shadow.mapSize.x !== ns) { neonL.shadow.mapSize.set(ns, ns); neonL.shadow.map?.dispose(); neonL.shadow.map = null; }
    const ss = { low: 1024, medium: 2048, high: 2048 }[s.shadowQ] || 2048;
    if (sun.shadow.mapSize.x !== ss) { sun.shadow.mapSize.set(ss, ss); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    const col = tint(s.warmth), size = { low: 512, medium: 1024, high: 2048 }[s.shadowQ] || 1024;
    for (const k of ['A', 'B', 'C', 'floor']) {
      const l = lamps[k], on = s.lamps[k];
      l.visible = on; l.color.copy(col);
      l.intensity = (k === 'floor' ? FLOOR_I * s.floor : DESK_I * s.desk);
      l.castShadow = s.shadows;
      if (l.shadow.mapSize.x !== size) { l.shadow.mapSize.set(size, size); l.shadow.map?.dispose(); l.shadow.map = null; }
      const m = k === 'floor' ? mats.amber : mats.desk[k];
      if (m) m.emissiveIntensity = on ? base.get(m) : base.get(m) * (k === 'floor' ? 0.15 : 0);
    }
    if (mats.bulb) mats.bulb.emissiveIntensity = s.lamps.floor ? base.get(mats.bulb) : 0;
    tv.visible = s.tvGlow;
    needs = true;
  }

  // TV spill follows the screen flicker; shadows at ~5 Hz, every frame while someone moves.
  // frozen (cached room on weak devices): shadows are drawn only when the lights or the blinds change, together with the room picture
  function update(dt, moving, frozen) {
    if (tvMat) tv.intensity = TV_I * tvMat.emissiveIntensity;
    tAcc += dt;
    if (needs || (!frozen && (moving || tAcc > 0.2))) { r.shadowMap.needsUpdate = true; tAcc = 0; needs = false; }
  }
  return { attach, apply, update, touch: () => { needs = true; }, sun };
}
