// Lunch at the common table — the page «Столовая редакции» v3 moved onto the office character.
// The MC Seated eating clips are recorded at a chair and a desk; the table by the bench was moved 8.5 cm towards the bench
// (office v30) so its edge is where the desk's edge is, and the clips fit the bench as they are.
// One dish per director decision (soup, steak, noodles, burger, sandwich or sweets, chosen by the decision number), eaten
// by the lunch clock: every viewer — and a late one — sees the same spoonful. The food goes down in stages, utensils sit in
// the fingers, the hand is taken to the mouth and to the dish by two-bone IK on the fly (as on the approved page).
// All food numbers are the page's, in pack metres in the pack's table frame; the frame is placed at the bench seat (TF).
import * as THREE from 'three';

const FPS = 30, XF = 0.3, WAIT = 1.5;
export const MEAL = {
  soup: ['soup_start', 'soup_stir', 'soup_eat', 'soup_eat', 'soup_eat', 'soup_stop'],
  steak: ['steak', 'steak', 'steak'],
  noodles: ['nd_start', 'nd_1', 'nd_2', 'nd_1', 'nd_stop'],
  burger: ['bg_start', 'bg_1', 'bg_2', 'bg_3', 'bg_stop'],
  sandwich: ['bg_start', 'bg_1', 'bg_2', 'bg_3', 'bg_stop'],
  sweets: ['fr_start', 'fr_1', 'fr_2', 'fr_stop', 'fl_start', 'fl_1', 'fl_stop'],
};
export const DISHES = ['soup', 'steak', 'noodles', 'burger', 'sandwich', 'sweets'];
export const DISH_NAME = { soup: 'суп', steak: 'стейк', noodles: 'лапшу', burger: 'бургер', sandwich: 'сэндвич', sweets: 'пончики и печенье' };
const SPOT = new THREE.Vector3(0.006, 0.76, 0.41);                  // one place for every dish
const CUT_X = [-0.066, -0.039, -0.012];
const SOUP_LV = [0.048, 0.039, 0.030, 0.021], NOOD_TOP = [0.073, 0.060, 0.048, 0.037];
const BITE = { bg_1: { sw: 18, mouth: [6, 14, 20, 26] }, bg_2: { sw: 26, mouth: [12, 20, 28, 34] }, bg_3: { sw: 28, mouth: [16, 24, 31, 37] } };   // to the mouth over 8 frames, not 5 (owner: too fast)
const NOOD = { nd_1: { hump: [49, 53, 59, 63], sw: 61, bite: [61, 72], mouth: [58, 66, 73, 79] }, nd_2: { hump: [33, 37, 43, 47], sw: 45, bite: [45, 58], mouth: [42, 50, 61, 67] } };   // to the mouth over 8 frames, not 5 (owner: too fast)
const SWEET = { fr_start: { s: 'r', g: 49, v: 83 }, fr_1: { s: 'r', g: 45, v: 85 }, fr_2: { s: 'r', g: 37, v: 77 }, fl_start: { s: 'l', g: 25, v: 53 }, fl_1: { s: 'l', g: 49, v: 75 }, fl_2: { s: 'l', g: 17, v: 57 } };
// the chopsticks to the mouth and back are slowed down (owner: «too fast»): clip frames [a, b] play at speed k, easing over 4 frames
const SLOW = { nd_1: [45, 85, 0.3], nd_2: [35, 70, 0.3],   // chopsticks: from lifting the noodles, to the mouth and back
  bg_1: [4, 30, 0.35], bg_2: [10, 38, 0.35], bg_3: [14, 41, 0.35] };   // burger and sandwich: to the mouth, the bite, back
function makeWarp(n, cd) {
  const w = SLOW[n]; if (!w) return { real: cd, clip: (x) => x, toReal: (x) => x };
  const [a, b, k] = w, h = 1 / (FPS * 4), C = [0], R = [0];
  for (let c = 0; c < cd; c += h) { const f = c * FPS + 1, s = 1 - (1 - k) * hump(f, a - 4, a, b, b + 4); C.push(Math.min(cd, c + h)); R.push(R[R.length - 1] + h / s); }
  const lerp = (X, Y, x) => { if (x <= X[0]) return Y[0]; let lo = 0, hi = X.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= x) lo = m; else hi = m; }
    const u = (x - X[lo]) / Math.max(1e-9, X[hi] - X[lo]); return Y[lo] + (Y[hi] - Y[lo]) * Math.min(1, Math.max(0, u)); };
  return { real: R[R.length - 1], clip: (x) => lerp(R, C, x), toReal: (x) => lerp(C, R, x) };
}
const STAGE_AT = { soup_eat: 13, steak: 43, nd_1: 61, nd_2: 45, bg_1: 18, bg_2: 26, bg_3: 28 };   // frame where the food goes down a stage

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const hump = (f, a, b, c, d) => (f < a || f > d ? 0 : f < b ? smooth((f - a) / (b - a)) : f <= c ? 1 : 1 - smooth((f - c) / (d - c)));
const ramp = (f, a, b) => smooth((f - a) / (b - a));
const norm = (s) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
const findIn = (o, k) => { let r = null; o.traverse((x) => { if (!r && norm(x.name) === k) r = x; }); return r; };

export function createLunch({ root, B, addon, strip, seatBase, S, clipsOut }) {
  const TF = new THREE.Group(); TF.name = 'LUNCH table frame'; TF.matrixAutoUpdate = false;
  const TFi = new THREE.Matrix4(), TFd = new THREE.Matrix3();
  const setFrame = (F) => {                                           // F = the pack table frame of a seat {x, z, th}
    TF.matrix.makeRotationY(F.th).setPosition(F.x, 0, F.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
    TF.matrixWorldNeedsUpdate = true; TF.updateMatrixWorld(true); TFi.copy(TF.matrixWorld).invert(); TFd.setFromMatrix4(TF.matrixWorld);
  };
  const _w = new THREE.Vector3();
  const wpos = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);
  const L = (o, v = new THREE.Vector3()) => o.getWorldPosition(v).applyMatrix4(TFi);    // position in the table frame (pack metres)
  const toW = (d) => d.clone().applyMatrix3(TFd);                                          // table-frame vector → world vector

  // ---------- clips: body only, pelvis relative to the seated frame (as the other seated clips)
  const boneOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName;
  const rigName = B.pelvis.parent.name;
  const dur = {};
  for (const c of addon.animations) {
    const x = c.clone(); x.tracks = x.tracks.filter((t) => B[boneOf(t)] || boneOf(t) === rigName);
    const s = strip('L_' + c.name, x, seatBase); dur[c.name] = s.clip.duration; clipsOut[c.name] = s.clip;
  }

  const warps = {}; for (const n of Object.keys(dur)) warps[n] = makeWarp(n, dur[n]);

  // ---------- props: utensils on the character's bones, dishes and markers in the table frame
  const onBone = (k) => { const o = findIn(addon.scene, k); if (!o) return null; const bone = B[o.parent.name]; if (!bone) return null; bone.add(o); return o; };
  const P = {}, D = {}, K = {};
  P.spoon = onBone('smpropspoonsoup'); P.spoonful = findIn(P.spoon, 'foodsoupspoonful');
  P.spoon0 = [P.spoon.position.clone(), P.spoon.quaternion.clone(), P.spoon.scale.clone()];
  P.forkL = onBone('foodsteakforkl'); P.knifeR = onBone('foodsteakknifer'); P.piece = findIn(P.forkL, 'foodsteakpiece'); P.forkTip = findIn(P.forkL, 'mkforktip');
  P.forkQcut = P.forkL.quaternion.clone(); P.forkQeat = onBone('mkforkeat').quaternion.clone();
  P.sticks = onBone('foodnoodleschopstickr1'); P.sticksTip = findIn(P.sticks, 'mksstickstip') || findIn(P.sticks, 'mkstickstip'); P.bite = findIn(P.sticks, 'foodnoodlesbite');
  P.sticks2 = onBone('foodnoodleschopstickr2');
  P.sticksAll = [P.sticks, P.sticks2].map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));   // the grip in the fingers (as on the page)
  P.knifeTip = findIn(P.knifeR, 'mkknifetip');                     // a node of the knife in the add-on (quantization moves the knife's frame)
  const inTF = (k) => { const e = findIn(addon.scene, k); TF.add(e); return e; };
  const rest1 = inTF('mkstick1rest'), rest2 = inTF('mkstick2rest'), spoonRest = inTF('mkspoontablestop');
  const grips = { burger: [onBone('mkburgergrip'), onBone('mkburgereat')], sandwich: [onBone('mksandwichgrip'), onBone('mksandwicheat')] };
  const dishKey = { soup: 'foodsoup', steak: 'foodsteak', noodles: 'foodnoodles', burger: 'foodburger', sandwich: 'foodsandwich', sweets: 'fooddonuts' };
  for (const [d, k] of Object.entries(dishKey)) { const r = findIn(addon.scene, k); TF.add(r); const shift = SPOT.clone().sub(r.position); r.position.copy(SPOT); D[d] = { root: r, shift }; }
  const stagesOf = (d, prefix) => [0, 1, 2, 3].map((i) => findIn(D[d].root, prefix + i));
  D.soup.stages = stagesOf('soup', 'foodsoupsoupl');
  D.steak.stages = stagesOf('steak', 'foodsteaksteakl'); D.steak.restFork = findIn(D.steak.root, 'foodsteakfork'); D.steak.restKnife = findIn(D.steak.root, 'foodsteakknife');
  D.noodles.stages = stagesOf('noodles', 'foodnoodlesnoodlesl');
  for (const d of ['burger', 'sandwich']) { const R = D[d];
    R.stages = d === 'burger' ? stagesOf(d, 'foodburgerburgerl') : stagesOf(d, 'foodsandwichhalfal');
    R.biteMk = findIn(R.root, d === 'burger' ? 'mkburgerbite' : 'mksandwichbite');
    R.carrier = new THREE.Group(); TF.add(R.carrier); R.carrier.position.copy(R.root.position);
    [...R.stages, R.biteMk].forEach((o) => R.carrier.add(o)); R.grip = grips[d][0]; R.eat = grips[d][1];
    R.centerMk = new THREE.Object3D(); R.centerMk.position.set(...(d === 'burger' ? [0, 0.045, 0] : [-0.038, 0.04, 0.036])); R.carrier.add(R.centerMk); }
  D.sweets.items = [1, 2, 3, 4, 5].map((i) => { let o = null; D.sweets.root.traverse((x) => { if (!o && norm(x.name).startsWith('fooddonutsitem' + i)) o = x; });
    const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
    return { o, p: o.position.clone(), q: o.quaternion.clone(), r: Math.max(sz.x, sz.z) / 2, h: sz.y }; });
  const props = [P.spoon, P.forkL, P.knifeR, P.sticks, P.sticks2];
  const shade = (o) => o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; x.frustumCulled = false; } });
  props.forEach(shade); shade(TF);
  // mouth: the smoking add-on hangs its mouth points on the head; without it — a point in front of the head
  // looked up when first needed: the smoking add-on puts them on the head after this module is created
  let mouthMk = null, fwdMk = null;
  const mouthPoint = () => { if (!mouthMk) { mouthMk = findIn(root, 'smkmouth'); fwdMk = findIn(root, 'smkmouthfwd'); }
    if (!mouthMk) return L(B.head).add(new THREE.Vector3(0, 0.05, 0.1));
    const m = L(mouthMk), f = L(fwdMk).sub(m).normalize(); return m.addScaledVector(f, 0.008); };
  const mouthFwd = () => { mouthPoint(); if (!mouthMk) return new THREE.Vector3(0, 0, 1); const v = L(fwdMk).sub(L(mouthMk)); v.y = 0; return v.normalize(); };
  const tipOf = (s) => { const a = L(B['index_02_' + s]), b = L(B['index_03_' + s]); return b.clone().addScaledVector(b.clone().sub(a), 0.8); };
  const thumbTip = (s) => { const a = L(B['thumb_02_' + s]), b = L(B['thumb_03_' + s]); return b.clone().addScaledVector(b.clone().sub(a), 0.8); };
  const pinch = (s) => tipOf(s).add(thumbTip(s)).multiplyScalar(0.5);

  // ---------- two-bone IK in world space, the hand keeps its world rotation (the page's)
  const _v = [...Array(8)].map(() => new THREE.Vector3()), _q = [...Array(6)].map(() => new THREE.Quaternion());
  function setWorldQuat(bone, qw) { const pq = bone.parent.getWorldQuaternion(_q[5]).invert(); bone.quaternion.copy(pq.multiply(qw)); bone.updateMatrixWorld(true); }
  function ik(s, dLocal) {
    if (dLocal.lengthSq() < 1e-10) return; const delta = toW(dLocal);
    const up = B['upperarm_' + s], lo = B['lowerarm_' + s], ha = B['hand_' + s];
    const Sp = wpos(up, _v[0]), E = wpos(lo, _v[1]), Wr = wpos(ha, _v[2]), hq = ha.getWorldQuaternion(_q[0]).clone();
    const l1 = E.distanceTo(Sp), l2 = Wr.distanceTo(E);
    const Wn = _v[3].copy(Wr).add(delta); let Dd = Wn.distanceTo(Sp); Dd = Math.min(Dd, l1 + l2 - 1e-4);
    const u = _v[4].copy(Wn).sub(Sp).normalize(), p = _v[5].copy(E).sub(Sp); p.addScaledVector(u, -p.dot(u)).normalize();
    const al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + Dd * Dd - l2 * l2) / (2 * l1 * Dd))));
    const En = _v[6].copy(Sp).addScaledVector(u, l1 * Math.cos(al)).addScaledVector(p, l1 * Math.sin(al)); Wn.copy(Sp).addScaledVector(u, Dd);
    const R1 = _q[1].setFromUnitVectors(_v[7].copy(E).sub(Sp).normalize(), En.clone().sub(Sp).normalize());
    setWorldQuat(up, _q[2].copy(R1).multiply(up.getWorldQuaternion(_q[3])));
    const E2 = wpos(lo, new THREE.Vector3()), W2 = wpos(ha, new THREE.Vector3());
    const R2 = _q[1].setFromUnitVectors(W2.sub(E2).normalize(), Wn.clone().sub(E2).normalize());
    setWorldQuat(lo, _q[2].copy(R2).multiply(lo.getWorldQuaternion(_q[3]))); setWorldQuat(ha, hq);
  }
  // utensil tip over the dish: lift the hand so the tip stays on the food (critically damped spring per hand)
  const LT = { r: { x: 0, v: 0 }, l: { x: 0, v: 0 } };
  function tipLift(s, tip, targetY, center, dt) {
    const t = L(tip), hd = Math.hypot(t.x - center.x, t.z - center.z), need = Math.max(0, targetY - t.y) * (1 - smooth((hd - 0.12) / 0.04));
    const T = LT[s], w = 22, y0 = T.x - need, k = T.v + w * y0, e = Math.exp(-w * dt);
    T.x = need + (y0 + k * dt) * e; T.v = (T.v - k * w * dt) * e; return Math.max(0, T.x);
  }
  const setWorld = (o, W) => { const inv = new THREE.Matrix4().copy(o.parent.matrixWorld).invert(); inv.multiply(W).decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true); };
  const blendW = (A, Bm, t) => { const p1 = new THREE.Vector3(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3();
    A.decompose(p1, q1, s1); Bm.decompose(p2, q2, s2); return new THREE.Matrix4().compose(p1.lerp(p2, t), q1.slerp(q2, t), s1.lerp(s2, t)); };

  // ---------- measured once: where each sweets clip pinches (table frame), which item each one takes
  setFrame({ x: 0, z: 0, th: 0 });
  const probeGrab = (mixer, holderFrame) => {
    const saved = mixer._actions.filter((a) => a.isRunning()).map((a) => [a, a.getEffectiveWeight()]); saved.forEach(([a]) => a.setEffectiveWeight(0));
    setFrame(holderFrame()); K.grab = {};
    for (const [n, e] of Object.entries(SWEET)) { if (!clipsOut[n]) continue; const a = mixer.clipAction(clipsOut[n]); a.reset().play(); a.setEffectiveWeight(1);
      a.time = (e.g - 1) / FPS; mixer.update(0); root.updateMatrixWorld(true); K.grab[n] = pinch(e.s); a.stop(); a.setEffectiveWeight(0); }
    saved.forEach(([a, w]) => a.setEffectiveWeight(w)); mixer.update(0);
    // each sweets clip takes the nearest item still on the plate (the order is the same for every meal)
    const left = new Set(D.sweets.items), plate = D.sweets.root.position; K.pick = {};
    MEAL.sweets.forEach((n, i) => { const g = K.grab[n]; if (!g || !SWEET[n]) return; let best = null, bd = 1e9;
      for (const it of left) { const c = it.p.clone().add(plate), dd = c.distanceTo(g); if (dd < bd) { bd = dd; best = it; } }
      if (best) { left.delete(best); K.pick[i] = best; } });
  };

  // ---------- the meal timeline: clip i starts when the one before ends; 0.3 s cross-fade; before and after — the seated idle
  function timeline(dish) {
    const list = MEAL[dish], T = []; let t = WAIT;
    for (const n of list) { const W = warps[n]; T.push({ n, t0: t, d: W.real, cd: dur[n], W }); t += W.real; }
    return { list: T, end: t };
  }
  const stageAt = (tl, t) => { let s = 0; for (const c of tl.list) { const k = STAGE_AT[c.n]; if (k && t >= c.t0 + c.W.toReal((k - 1) / FPS)) s++; } return Math.min(3, s); };

  // ---------- state for one meal
  let meal = null;              // { dish, tl, seat }
  const st = { lastG: null };
  function showDish(d) {
    for (const [k, v] of Object.entries(D)) { v.root.visible = k === d; if (v.carrier) v.carrier.visible = k === d; }
    P.spoon.visible = d === 'soup'; P.sticks.visible = P.sticks2.visible = d === 'noodles';
    P.forkL.visible = P.knifeR.visible = false; P.piece.visible = P.bite.visible = P.spoonful.visible = false;
  }
  function resetDish(d) {
    const R = D[d]; st.lastG = null; LT.r.x = LT.r.v = LT.l.x = LT.l.v = 0;
    if (R.carrier) { R.carrier.position.copy(R.root.position); R.carrier.quaternion.copy(R.root.quaternion); R.carrier.scale.copy(R.root.scale); }
    if (d === 'sweets') R.items.forEach((it) => { R.root.add(it.o); it.o.position.copy(it.p); it.o.quaternion.copy(it.q); it.o.visible = true; });
    P.spoon.position.copy(P.spoon0[0]); P.spoon.quaternion.copy(P.spoon0[1]); P.spoon.scale.copy(P.spoon0[2]);
  }
  const setStage = (d, i) => { const s = D[d].stages; if (s) s.forEach((m, k) => { m.visible = k === i; }); };
  function begin(dish, F, seat) {
    setFrame(F); meal = { dish, tl: timeline(dish), seat }; TF.visible = true; showDish(dish); resetDish(dish); setStage(dish, 0);
  }
  function end() { meal = null; TF.visible = false; showDish(null); }
  end();

  // the clip playing at meal time t: [{n, local time, weight}], weights sum to 1 (idle included as n = null)
  function mix(t) {
    if (!meal) return [];
    const L_ = meal.tl.list, out = [];
    let i = -1; for (let k = 0; k < L_.length; k++) if (t >= L_[k].t0) i = k;
    if (i < 0) return [{ n: null, i: -1, lt: 0, w: 1 }];
    const c = L_[i], lt = t - c.t0;
    if (lt >= c.d) {                                                      // after the last clip: back to the seated idle
      const k = Math.min(1, (lt - c.d) / XF); return [{ n: c.n, i, lt: c.cd - 1e-4, w: 1 - k }, { n: null, i: -1, lt: 0, w: k }];
    }
    const k = Math.min(1, lt / XF);
    out.push({ n: c.n, i, lt: c.W.clip(lt), w: k });                     // lt: time in the clip (slowed parts stretched)
    if (k < 1) out.push(i > 0 ? { n: L_[i - 1].n, i: i - 1, lt: L_[i - 1].cd - 1e-4, w: 1 - k } : { n: null, i: -1, lt: 0, w: 1 - k });
    return out;
  }
  const done = (t) => !meal || t >= meal.tl.end + XF;

  // ---------- after the mixer: props, stages, hands (the page's food logic, driven by the lunch clock)
  const dbg = {};
  function post(t, dt) {
    if (!meal) return;
    root.updateMatrixWorld(true);
    const d = meal.dish, m = mix(t), top = m[0], name = top && top.n && top.w > 0 ? top.n : 'idle';
    const f = name === 'idle' ? 0 : top.lt * FPS + 1, idx = top ? top.i : -1;
    const stage = stageAt(meal.tl, t), stage0 = idx >= 0 ? stageAt(meal.tl, meal.tl.list[idx].t0) : 0;
    setStage(d, stage);
    const dR = new THREE.Vector3(), dL = new THREE.Vector3();
    dbg.f = f; dbg.name = name; dbg.dR = dR; dbg.dL = dL;
    if (d === 'soup') {
      let w = 1;
      if (name === 'idle') w = 0; else if (name === 'soup_start') w = ramp(f, 22, 30); else if (name === 'soup_stop') w = 1 - ramp(f, 13, 21);
      P.spoonful.visible = name === 'soup_eat' && f >= 13 && f <= 45;
      const lv = SOUP_LV[stage0];
      if (name === 'soup_stir') dR.y -= (0.048 - lv) * hump(f, 5, 13, 67, 75);
      if (name === 'soup_eat') dR.y -= (0.048 - lv) * hump(f, 5, 11, 17, 23);
      ik('r', dR); root.updateMatrixWorld(true);
      P.spoon.position.copy(P.spoon0[0]); P.spoon.quaternion.copy(P.spoon0[1]); P.spoon.scale.copy(P.spoon0[2]); P.spoon.updateMatrixWorld(true);
      if (w < 1) setWorld(P.spoon, blendW(spoonRest.matrixWorld, P.spoon.matrixWorld.clone(), w));
    }
    if (d === 'steak') {
      const eating = name === 'steak';
      P.forkL.visible = P.knifeR.visible = eating; D.steak.restFork.visible = D.steak.restKnife.visible = !eating;
      if (eating) {
        const we = f < 55 ? ramp(f, 43, 50) : 1 - ramp(f, 61, 68);
        P.forkL.quaternion.copy(P.forkQcut).slerp(P.forkQeat, we); P.piece.visible = f >= 43 && f <= 58;
        root.updateMatrixWorld(true);
        const c = D.steak.root.position;
        const toXZ = (tip, lx, ly, w) => { if (w <= 0) return new THREE.Vector3(); const tt = L(tip); return new THREE.Vector3(c.x + lx - tt.x, 0, c.z - ly - tt.z).multiplyScalar(w); };
        dR.add(toXZ(P.knifeTip, CUT_X[Math.min(stage0, 2)] - 0.004, 0.02, hump(f, 1, 9, 40, 48)));
        dL.add(toXZ(P.forkTip, 0.02, 0.01, hump(f, 3, 10, 38, 44)));
        dR.y += tipLift('r', P.knifeTip, 0.772, c, dt); dL.y += tipLift('l', P.forkTip, 0.783, c, dt);
        const wm = hump(f, 44, 50, 58, 66); if (wm > 0) dL.addScaledVector(mouthPoint().sub(L(P.forkTip)), wm);
        ik('r', dR); ik('l', dL);
      } else P.piece.visible = false;
    }
    if (d === 'noodles') {
      const ev = NOOD[name];
      let handW = 1; if (name === 'idle') handW = 0; if (name === 'nd_start') handW = ramp(f, 2, 6); if (name === 'nd_stop') handW = 1 - ramp(f, 36, 44);
      if (ev) { P.bite.visible = f >= ev.bite[0] && f <= ev.bite[1]; dR.y -= (NOOD_TOP[0] - NOOD_TOP[stage0]) * hump(f, ...ev.hump); } else P.bite.visible = false;
      for (const x of P.sticksAll) { x.o.position.copy(x.p); x.o.quaternion.copy(x.q); x.o.scale.copy(x.s); x.o.updateMatrixWorld(true); }   // back into the fingers every frame: the put-down blend below moves them
      if (ev) { const w = hump(f, ...ev.mouth); if (w > 0) dR.addScaledVector(mouthPoint().sub(L(P.sticksTip)), w); }
      if (ev) { const c = D.noodles.root.position, tt = L(P.sticksTip), v = new THREE.Vector3(tt.x - c.x, 0, tt.z - c.z), Ln = v.length(), Rr = 0.045;
        if (Ln > Rr) dR.addScaledVector(v, -(1 - Rr / Ln) * hump(f, ev.hump[0] - 6, ev.hump[1], ev.hump[2], ev.hump[3] + 4)); }
      if (handW > 0) dR.y += tipLift('r', P.sticksTip, 0.76 + NOOD_TOP[stage] - 0.012, D.noodles.root.position, dt);
      ik('r', dR); root.updateMatrixWorld(true);
      if (handW < 1) for (const [o, r] of [[P.sticks, rest1], [P.sticks2, rest2]]) setWorld(o, blendW(r.matrixWorld, o.matrixWorld.clone(), handW));
      if (P.bite.visible) { P.bite.quaternion.copy(P.bite.parent.getWorldQuaternion(new THREE.Quaternion()).invert()); P.bite.updateMatrixWorld(true); }
    }
    if (d === 'burger' || d === 'sandwich') {
      const R = D[d], ev = BITE[name];
      const held = (name === 'bg_start' && f >= 47) || !!ev || (name === 'bg_stop' && f < 37);
      const level = (W) => { const p = new THREE.Vector3().setFromMatrixPosition(W), rw = R.root.matrixWorld, q = new THREE.Quaternion(), s = new THREE.Vector3(), pr = new THREE.Vector3();
        rw.decompose(pr, q, s); p.y = pr.y; return new THREE.Matrix4().compose(p, q, s); };
      const G = () => { let W = R.eat.matrixWorld.clone();
        if (name === 'bg_start') W = blendW(R.grip.matrixWorld, R.eat.matrixWorld, ramp(f, 47, 58));
        if (name === 'bg_stop') { W = blendW(R.eat.matrixWorld, R.grip.matrixWorld, ramp(f, 21, 31)); W = blendW(W, level(W), ramp(f, 29, 37)); }
        return W; };
      const reach = name === 'bg_start' ? hump(f, 33, 44, 47, 56) : name === 'bg_stop' ? hump(f, 25, 33, 37, 45) : 0;
      if (reach > 0) dR.addScaledVector(R.shift, reach);
      if (held) {
        setWorld(R.carrier, G());
        if (ev) { const w = hump(f, ...ev.mouth); if (w > 0) {
          // no turn of the wrist (owner). The clip holds the food tilted, its top edge nearest the face: that edge goes to the mouth
          // (not the centre — the round burger would then cover the nose). Edge = centre + radius along the food's plane, upwards.
          const c = L(R.centerMk), b = L(R.biteMk), r = c.distanceTo(b), m3 = new THREE.Matrix3().setFromMatrix4(TFi);
          const ax = new THREE.Vector3(0, 1, 0).transformDirection(R.carrier.matrixWorld).applyMatrix3(m3).normalize();
          const u = new THREE.Vector3(0, 1, 0).addScaledVector(ax, -ax.y); if (u.lengthSq() < 1e-6) u.set(0, 0, -1); u.normalize();
          const edge = c.clone().addScaledVector(u, r);
          dR.addScaledVector(mouthPoint().sub(edge), w); } }
        ik('r', dR); root.updateMatrixWorld(true); setWorld(R.carrier, G()); st.lastG = R.carrier.matrixWorld.clone();
      } else if (reach > 0) { ik('r', dR); root.updateMatrixWorld(true); }
      if (!held && (name === 'bg_stop' && f >= 37 || (name === 'idle' && idx >= 0))) {       // put down: level, where the hand left it
        if (st.lastG) setWorld(R.carrier, level(st.lastG));
      }
    }
    if (d === 'sweets') {
      const R = D.sweets, ev = SWEET[name];
      R.items.forEach((it) => { let gone = false, inHand = false;
        meal.tl.list.forEach((c, k) => { const e = SWEET[c.n]; if (!e || K.pick[k] !== it) return; const tg = c.t0 + (e.g - 1) / FPS, tv = c.t0 + (e.v - 1) / FPS;
          if (t >= tv) gone = true; else if (t >= tg) inHand = true; });
        it.o.visible = !gone; it.hand = inHand; });
      if (ev) {
        const s = ev.s, it = K.pick[idx];
        if (it && !it.hand && it.o.visible) {                           // reach for its near edge
          const g = K.grab[name], c = it.p.clone().add(R.root.position), h = new THREE.Vector3(g.x - c.x, 0, g.z - c.z).normalize();
          it.edge = c.clone().addScaledVector(h, it.r * 0.7).add(new THREE.Vector3(0, it.h * 0.6, 0));
          const w = hump(f, ev.g - 10, ev.g - 2, ev.g, ev.g + 6); if (w > 0) (s === 'r' ? dR : dL).addScaledVector(it.edge.clone().sub(pinch(s)), w);
        }
        ik(s, s === 'r' ? dR : dL); root.updateMatrixWorld(true);
      }
      R.items.forEach((it) => {                                          // in the fingers: its edge stays at the pinch
        if (it.hand) { const k = meal.tl.list.findIndex((c, j) => K.pick[j] === it); const e = SWEET[meal.tl.list[k].n];
          const edge = it.edge || it.p.clone().add(R.root.position);
          const pw = pinch(e.s).sub(edge.clone().sub(it.p.clone().add(R.root.position))).sub(R.root.position);
          it.o.position.copy(pw); it.o.quaternion.copy(it.q); }
        else { it.o.position.copy(it.p); it.o.quaternion.copy(it.q); } });
    }
    root.updateMatrixWorld(true); TF.updateMatrixWorld(true);
    const tip = d === 'steak' ? P.forkTip : d === 'noodles' ? P.sticksTip : (d === 'burger' || d === 'sandwich') ? D[d].biteMk : null;
    let near = tip ? L(tip) : null;
    if (D[d]?.centerMk) { const c = L(D[d].centerMk), r = c.distanceTo(L(D[d].biteMk)), ax = new THREE.Vector3(0, 1, 0).transformDirection(D[d].carrier.matrixWorld).applyMatrix3(new THREE.Matrix3().setFromMatrix4(TFi)).normalize();
      const u = new THREE.Vector3(0, 1, 0).addScaledVector(ax, -ax.y).normalize(); near = c.clone().addScaledVector(u, r); }
    dbg.dist = near ? near.distanceTo(mouthPoint()) : null;
    if (D[d]?.centerMk) { const st = D[d].stages.find((m) => m.visible); if (st) { const bb = new THREE.Box3().setFromObject(st); const cw = bb.getCenter(new THREE.Vector3()).applyMatrix4(TFi);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(st.matrixWorld).applyMatrix3(new THREE.Matrix3().setFromMatrix4(TFi)).normalize(); dbg.up = up.toArray().map((v) => +v.toFixed(2));
      const bl = L(D[d].biteMk).sub(L(D[d].centerMk)); dbg.biteDir = bl.normalize().toArray().map((v) => +v.toFixed(2)); dbg.fw = mouthFwd().toArray().map((v) => +v.toFixed(2));
      const m = mouthPoint(); dbg.bbDy = cw.y - m.y; dbg.bbH = (bb.max.y - bb.min.y) / S; dbg.bbLat = (() => { const fw = mouthFwd(), v = cw.clone().sub(m); return v.x * fw.z - v.z * fw.x; })(); } }             // food-to-mouth distance (burger, sandwich: the edge facing the mouth), for checks
    dbg.tip = near ? (D[d]?.centerMk ? L(D[d].centerMk) : near).toArray() : null;
    if (D[d]?.centerMk && tip) { const c = L(D[d].centerMk).sub(mouthPoint()); const fw = mouthFwd(); c.y = 0; dbg.lat = Math.abs(c.x * fw.z - c.z * fw.x); } else dbg.lat = null;
  }
  return { dbg, group: TF, clips: clipsOut, dur, begin, end, mix, post, done, active: () => !!meal, dish: () => meal?.dish || null, seat: () => meal?.seat || null, probeGrab, setFrame };
}
