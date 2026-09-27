import * as THREE from 'three';

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
const DESK_I = 6.0, FLOOR_I = 22.0, TV_I = 0.6;

export function createLighting(sc, r) {
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.shadowMap.autoUpdate = false;                       // the room is static: refresh a few times a second

  const hemi = new THREE.HemisphereLight(0xffe9d0, 0x2a2420, 0.5);
  const win = new THREE.DirectionalLight(0xb9c7ff, 0.45);   // cool light from the west windows
  win.position.copy(B(-12, 1, 9)); win.target.position.copy(B(0, 0, 0));
  sc.add(hemi, win, win.target);

  const spot = (pos, tgt, angle, pen, near) => {
    const l = new THREE.SpotLight(0xffffff, 1, 0, angle, pen, 2);
    l.position.copy(pos); l.target.position.copy(tgt);
    l.castShadow = true; l.shadow.bias = -0.0004; l.shadow.normalBias = 0.015; l.shadow.radius = 4;
    l.shadow.camera.near = near; l.shadow.camera.far = 7;
    sc.add(l, l.target); return l;
  };
  const lamps = {};
  for (const [k, [x, y]] of Object.entries(DESK)) lamps[k] = spot(B(x, y + 0.06, 1.675), B(x, y + 0.14, 1.18), 1.0, 0.55, 0.03);
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
    sc.environmentIntensity = s.env; r.toneMappingExposure = s.exposure;
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

  function update(dt) {                                  // TV spill follows the screen flicker; shadows at ~5 Hz
    if (tvMat) tv.intensity = TV_I * tvMat.emissiveIntensity;
    tAcc += dt;
    if (needs || tAcc > 0.2) { r.shadowMap.needsUpdate = true; tAcc = 0; needs = false; }
  }
  return { attach, apply, update };
}
