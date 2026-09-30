// Whisky alone (approved «Виски колумниста» v7, owner 30.09): recorded frame by frame on the approved page and only played here —
// his body, where he stands, and the things: at the bar (pours, takes the glass the way the pour clip holds it, drinks standing,
// puts it back) and seated at a desk (the approved DrinkR with a tumbler, a bottle on the desk). Director's activity 'whisky'.
// The recording (whisky-solo-v01.bin): bar — in the bar root's own frame (the office's «BAR | root» is the same frame);
// desk — in his seat frame. Bones as int16 quaternions, 30 frames a second.
import * as THREE from 'three';

export function parseWhisky(buf) {
  const hl = new DataView(buf).getUint32(0, true), H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl;
  const T = { f32: Float32Array, i16: Int16Array, u8: Uint8Array, u16: Uint16Array, u32: Uint32Array };
  H.arr = (r) => (r ? new T[r.type](buf, base + r.off, r.len) : null);
  for (const k of ['bar', 'desk']) { const P = H[k]; P.holderA = H.arr(P.holder); P.pelvisA = H.arr(P.pelvis); P.quatA = H.arr(P.quat); P.D = (P.n - 1) / H.fps; }
  return H;
}

// the body as a clip for one person (only the bones he has)
export function bakedClip(W, part, has) {
  const P = W[part], n = P.n, nb = W.bones.length, times = Float32Array.from({ length: n }, (_, i) => i / W.fps), tracks = [];
  W.bones.forEach((name, b) => {
    if (!has(name)) return;
    const v = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const o = (i * nb + b) * 4; let x = P.quatA[o], y = P.quatA[o + 1], z = P.quatA[o + 2], w = P.quatA[o + 3]; const l = Math.hypot(x, y, z, w) || 1;
      v[i * 4] = x / l; v[i * 4 + 1] = y / l; v[i * 4 + 2] = z / l; v[i * 4 + 3] = w / l; }
    tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v));
  });
  tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, Float32Array.from(P.pelvisA)));
  return new THREE.AnimationClip('whisky_' + part, P.D, tracks);
}
// where he stands at time t of the bar recording, in the bar root's frame (x, z, turn)
export function barHolder(W, t) {
  const P = W.bar, f = Math.min(P.n - 1, Math.max(0, t * W.fps)), i = Math.floor(f), j = Math.min(P.n - 1, i + 1), k = f - i, h = P.holderA;
  const d = Math.atan2(Math.sin(h[j * 3 + 2] - h[i * 3 + 2]), Math.cos(h[j * 3 + 2] - h[i * 3 + 2]));
  return { x: h[i * 3] + (h[j * 3] - h[i * 3]) * k, z: h[i * 3 + 1] + (h[j * 3 + 1] - h[i * 3 + 1]) * k, th: h[i * 3 + 2] + d * k };
}

// the things, shared by everybody: the bar's bottle, cap, glass, whisky and stream (they take the place of the office's own), a glass
// and a bottle for every desk
export function createWhiskyProps({ scene, office, W, DESKS }) {
  const key = (s) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const mats = new Map();
  const mat = (m) => { const k = JSON.stringify(m); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color('#' + m.color), roughness: m.rough, metalness: m.metal,
    transparent: !!m.transparent, opacity: m.opacity, side: m.side === 2 ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !m.transparent })); return mats.get(k); };
  const build = (k) => { const g = new THREE.Group(); g.name = 'WHISKY ' + k; g.matrixAutoUpdate = false;
    for (const m of W.geo[k].meshes) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(W.arr(m.pos), 3));
      if (m.nrm) geo.setAttribute('normal', new THREE.BufferAttribute(W.arr(m.nrm), 3)); if (m.idx) geo.setIndex(new THREE.BufferAttribute(W.arr(m.idx), 1)); if (!m.nrm) geo.computeVertexNormals();
      const me = new THREE.Mesh(geo, mat(m.mat)); me.matrixAutoUpdate = false; me.matrix.fromArray(m.local); me.castShadow = !m.mat.transparent; me.receiveShadow = true; g.add(me); }
    return g; };
  const groups = [];
  // ---------- the bar
  let root = null; const hide = new Set(['bartumblerserve', 'barwhiskybottle', 'barbottlecap']);
  office.updateMatrixWorld(true);
  office.traverse((o) => { const n = key(o.name); if (!root && n === 'barroot') root = o; if (hide.has(n)) o.visible = false; });
  const bar = new THREE.Group(); bar.name = 'WHISKY bar'; bar.matrixAutoUpdate = false; if (root) bar.matrix.copy(root.matrixWorld); scene.add(bar); groups.push(bar);
  const REC = { tumblerserve: 'tumbler', whiskybottle: 'bottle', bottlecap: 'cap', whiskyinglass: 'whisky', whiskystream: 'stream' }, P = {};
  for (const [r, g] of Object.entries(REC)) { const o = build(g); bar.add(o); P[r] = { o, m: W.arr(W.bar.props[r].m), v: W.arr(W.bar.props[r].vis) }; }
  const rootM = bar.matrix, rootYaw = (() => { const d = new THREE.Vector3(0, 0, 1).transformDirection(rootM); return Math.atan2(d.x, d.z); })();
  let barT = -1;
  function setBar(t) {                                  // the bar's things at time t of the recording (0: as they stand)
    const f = Math.min(W.bar.n - 1, Math.max(0, t * W.fps)), i = Math.floor(f), j = Math.min(W.bar.n - 1, i + 1), k = f - i;
    if (Math.abs(f - barT) < 1e-6) return; barT = f;
    for (const p of Object.values(P)) { const e = p.o.matrix.elements; for (let c = 0; c < 16; c++) e[c] = p.m[i * 16 + c] + (p.m[j * 16 + c] - p.m[i * 16 + c]) * k; p.o.visible = !!p.v[i]; }
    bar.updateMatrixWorld(true);
  }
  setBar(0);
  // bar-frame pose → world (x, z, turn)
  const toWorld = (h) => { const p = new THREE.Vector3(h.x, 0, h.z).applyMatrix4(rootM); return { x: p.x, z: p.z, th: h.th + rootYaw }; };
  // ---------- the desks
  const desks = {}, gM = W.arr(W.desk.glass.m), gV = W.arr(W.desk.glass.vis);
  for (const k of Object.keys(DESKS)) {
    const g = new THREE.Group(); g.name = 'WHISKY desk ' + k; g.matrixAutoUpdate = false; g.visible = false;
    const glass = build('deskGlass'), bottle = build('deskBottle'); bottle.matrix.fromArray(W.desk.bottle); g.add(glass, bottle); scene.add(g); groups.push(g);
    desks[k] = { g, glass, t: -1, framed: false };
  }
  function setDesk(k, t) { const d = desks[k]; if (!d) return; const f = Math.min(W.desk.n - 1, Math.max(0, t * W.fps)), i = Math.floor(f), j = Math.min(W.desk.n - 1, i + 1), x = f - i;
    if (Math.abs(f - d.t) < 1e-6) return; d.t = f; const e = d.glass.matrix.elements; for (let c = 0; c < 16; c++) e[c] = gM[i * 16 + c] + (gM[j * 16 + c] - gM[i * 16 + c]) * x;
    d.glass.visible = !!gV[i]; d.g.updateMatrixWorld(true); }
  function deskFrame(k, pose) { const d = desks[k]; if (!d || d.framed) return; d.framed = true; d.g.matrix.makeRotationY(pose.th).setPosition(pose.x, 0, pose.z); d.g.updateMatrixWorld(true); setDesk(k, 0); }
  const showDesk = (k, v) => { const d = desks[k]; if (d && d.g.visible !== v) { d.g.visible = v; if (!v) setDesk(k, 0); } };
  return { groups, setBar, toWorld, barReady: !!root, deskFrame, setDesk, showDesk };
}
