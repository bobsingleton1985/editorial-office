// Writing by hand at the desk (add-on editor2A-write-web-v01.glb: the MC Seated WriteLetter clips + the pack's pencil and A4 sheet).
// While the desk is free for resting (the typewriter cleared away) a sheet and a pencil lie on it; writing, he takes the pencil
// (it goes from the desk into the right hand while the hand passes over it) and puts it back. In the hand it is fixed to the hand's
// bone as the owner set it in Blender.
import * as THREE from 'three';

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const TIP = 0.0853;   // the sharpened end: pencil local +Z, metres from its origin
export function createWriting({ scene, B, addon, DESKS, S }) {
  const find = (n) => { let r = null; addon.scene.traverse((o) => { if (!r && o.name.replace(/_/g, ' ') === n) r = o; }); return r; };
  const pencil0 = find('WRITE | pencil'), paper0 = find('WRITE | paper');
  const clips = addon.animations;
  const M = {};
  for (const [k, D] of Object.entries(DESKS)) {
    const g = new THREE.Group(); g.name = 'WRITE ' + k; g.position.set(D.x, 0, D.z); g.rotation.y = D.th; g.scale.setScalar(S); scene.add(g);
    const paper = new THREE.Group(), sheet = paper0.clone(); paper.add(sheet); paper.position.set(0.05, 0.7625, 0.47); paper.rotation.y = Math.PI / 2 + 0.09; g.add(paper);   // pack frame: 5 cm left, 47 cm ahead (under the writing hand)
    // (the meshes keep their own node transform: with quantized geometry it holds the scale back to metres)
    const ink = makeInk(sheet);
    const rest = new THREE.Object3D(); rest.position.set(-0.17, 0.766, 0.27); rest.rotation.set(0, 0.5, 0); g.add(rest);
    const pencil = new THREE.Group(); pencil.add(pencil0.clone()); pencil.matrixAutoUpdate = false; scene.add(pencil);
    for (const o of [paper, pencil]) o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
    g.updateMatrixWorld(true); pencil.rotation.set(0, 0, 0);
    M[k] = { g, paper, pencil, rest, on: false, ink, gid: null, prev: null, run: 0 };
  }
  // pencil lying: its rest frame lies flat (pencil +Z along the desk), the scale of the pack props
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function lying(k) { const m = M[k]; m.g.updateMatrixWorld(true); return m.rest.matrixWorld.clone(); }
  // in the hand: the pencil fixed to the right hand's bone, as the owner set it by hand in Blender (pencil-grip-v03.blend, 30.09)
  const GRIP = new THREE.Matrix4().fromArray([-4.21674, -22.6726, 97.3046, 0, -85.069, 51.8906, 8.40442, 0, -52.3974, -82.4217, -21.4754, 0, -7.45025, -0.86112, 4.80918, 1]);
  function inHand() {
    const H = B.hand_r.matrixWorld.clone().multiply(GRIP); tipW.set(0, 0, TIP).applyMatrix4(H); return H;
  }
  // the sheet gets its own canvas: what the pencil point draws while it touches the paper (a sheet 21 × 29.6 cm, 2 px per mm)
  function makeInk(sheet) {
    const cv = document.createElement('canvas'); cv.width = 420; cv.height = 592; const cx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = sheet.isMesh ? sheet : sheet.getObjectByProperty('isMesh', true);
    mesh.geometry = mesh.geometry.clone(); mesh.material = mesh.material.clone(); mesh.material.map = tex; mesh.material.color.set(0xffffff);
    const pos = mesh.geometry.attributes.position, uv = new Float32Array(pos.count * 2), v = new THREE.Vector3(); mesh.updateMatrix();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix); uv[i * 2] = (v.x + 0.105) / 0.21; uv[i * 2 + 1] = 1 - (v.z + 0.148) / 0.296; }
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const clear = () => { cx.fillStyle = '#efece3'; cx.fillRect(0, 0, cv.width, cv.height); tex.needsUpdate = true; };
    clear(); return { cv, cx, tex, clear };
  }
  // the pencil point on the sheet: paper frame (metres, y — height above the sheet). What appears is handwriting in rows: the row
  // grows under the point as the hand moves to the writer's right; when the hand goes back to the left, a new row begins a line lower.
  // Page coordinates for the writer: u to his right, v down the page (towards him); 2 px per mm.
  const PEN_DOWN = 0.006, ROW = 22, W = 420, H = 592;
  let tipW = new THREE.Vector3(), lastTip = null;
  const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  function script(cx, u0, u1, base, seed) {                          // cursive-looking loops between u0 and u1 on the base line
    cx.setTransform(0, -1, 1, 0, 0, H); cx.strokeStyle = 'rgba(28,28,40,0.95)'; cx.lineWidth = 1.9; cx.lineCap = 'round'; cx.lineJoin = 'round';
    let down = false; cx.beginPath();
    for (let u = u0; u <= u1; u += 0.5) {
      const w = Math.floor(u / 52), inWord = (u % 52) < 40 + 8 * hash(seed + w * 7);   // words of 40–48 px (2–2,5 cm), gaps between them
      if (!inWord) { if (down) { cx.stroke(); cx.beginPath(); down = false; } continue; }
      const L = Math.floor(u / 6.5), tall = hash(seed + L * 13) > 0.78 ? 2.1 : 1, ph = (u / 6.5) * Math.PI * 2;
      const x = u + 2.2 * Math.cos(ph), y = base - 5.2 * tall * (0.5 - 0.5 * Math.cos(ph)) - 0.7 * Math.sin(u * 0.13 + seed);
      if (!down) { cx.moveTo(x, y); down = true; } else cx.lineTo(x, y);
    }
    if (down) cx.stroke(); cx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function write(m, active) {
    if (!active) { m.pen = false; return; }
    const p = m.paper.worldToLocal(tipW.clone()); lastTip = p;
    const onSheet = Math.abs(p.x) < 0.1 && Math.abs(p.z) < 0.14 && p.y < PEN_DOWN;
    if (!onSheet) { m.pen = false; return; }
    const X = (p.x + 0.105) / 0.21 * W, Y = (p.z + 0.148) / 0.296 * H, u = H - Y, v = X;
    if (m.row === undefined) { m.row = 0; m.v0 = Math.min(W - 60, Math.max(36, v - 10)); m.head = u; m.seed = (m.gid ? m.gid.length * 97 : 0) + Math.floor(u); }
    if (u < m.head - 40) { m.row++; m.head = u; }                                        // the hand went back to the left: next row
    else if (u > m.head + 0.8) {
      const base = m.v0 + m.row * ROW; if (base < W - 20) { script(m.ink.cx, m.head, u, base, m.seed + m.row * 101); m.ink.tex.needsUpdate = true; }
      m.head = u; }
    m.pen = true;
  }
  // the pencil is fixed in the fingers; the actor's pencil was longer, so his hand writes 2–4 cm above the sheet. The arm brings the
  // hand down instead: how far (world metres) the hand has to go down so that the point touches the paper — the whole gap while the point
  // is near the sheet, easing off for the clear lifts between words and rows, nothing off the sheet
  const T = 0.03;
  function drop(k, w) {
    const m = M[k]; if (!m || !m.on || w <= 0) return 0;
    inHand(); const p = m.paper.worldToLocal(tipW.clone()), h = p.y - 0.0008;
    const f = (1 - smooth((Math.abs(p.x) - 0.1) / 0.03)) * (1 - smooth((Math.abs(p.z) - 0.14) / 0.03));
    return (h <= T ? h : Math.max(0, 2 * T - h)) * w * f * S;
  }
  // how high the lowest finger of a hand is above the desk (world metres): the knuckles and the fingertips
  const FING = ['index', 'middle', 'ring', 'pinky', 'thumb'], _f2 = new THREE.Vector3(), _f3 = new THREE.Vector3();
  function clearance(k, side) {
    const m = M[k]; if (!m || !m.on) return Infinity; const top = m.paper.getWorldPosition(new THREE.Vector3()).y; let lo = Infinity;
    for (const f of FING) { const b1 = B[f + '_01_' + side], b2 = B[f + '_02_' + side], b3 = B[f + '_03_' + side]; if (!b2 || !b3) continue;
      b2.getWorldPosition(_f2); b3.getWorldPosition(_f3); lo = Math.min(lo, _f2.y, _f3.y, _f3.y + 0.8 * (_f3.y - _f2.y), b1 ? b1.getWorldPosition(_f3).y : Infinity); }
    return lo - top;
  }
  function show(k, on) { const m = M[k]; if (!m) return; m.on = on; m.paper.visible = on; m.pencil.visible = on; }
  // w: how much the pencil is in the hand (0 on the desk, 1 in the fingers); only the desk being written at
  // seg: the clip being played (the writing ones leave a line where the point touches the sheet); gid: the gesture (a new one — a clean sheet)
  function post(k, w, seg, gid) {
    const m = M[k]; if (!m || !m.on) return;
    if (seg === 'write_start' && gid !== undefined && m.gid !== gid) { m.gid = gid; m.ink.clear(); m.row = undefined; }
    const L = lying(k);
    if (w <= 0) { m.pencil.matrix.copy(L); }
    else { const H = inHand(); L.decompose(_p, _q, _s); const p1 = new THREE.Vector3(), q1 = new THREE.Quaternion(); H.decompose(p1, q1, new THREE.Vector3());
      m.pencil.matrix.compose(_p.lerp(p1, w), _q.slerp(q1, w), _s); }
    const writing = w >= 1 && /^write_(01|02|secret)$/.test(seg || '');
    m.pencil.matrixWorldNeedsUpdate = true; m.pencil.updateMatrixWorld(true);
    write(m, writing);
  }
  // how much the pencil is in the hand for a running gesture (the start and stop clips: taken at frames 10–18, put back at 14–21)
  function segOf(g, u) { const a = g && g.segs.find((x) => u >= x.s && u < x.s + x.d && /^write_/.test(x.n)); return a ? a.n : null; }
  function hold(g, u) {
    if (!g) return 0;
    const seg = g.segs.find((x) => u >= x.s && u < x.s + x.d && /^write_/.test(x.n)); if (!seg) return 0;
    const f = (u - seg.s) * 30 + 1;
    return seg.n === 'write_start' ? smooth((f - 10) / 8) : seg.n === 'write_stop' ? 1 - smooth((f - 14) / 7) : 1;
  }
  for (const k in M) show(k, false);
  return { clips, show, post, hold, drop, clearance, segOf, tip: () => lastTip, groups: Object.values(M).flatMap((m) => [m.g, m.pencil]) };
}
