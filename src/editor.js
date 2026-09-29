// editor2A in the office: walking, sitting down at desks A/B/C and on the lounge bench, standing up, the desk chair
// following the pack's chair track. Movement logic is the approved seating page v6, moved into the office layout.
// The page never decides anything itself: it plays commands that arrive from the director ({from, cmd, at}).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createNav } from './nav.js';
import { GRID } from './navgrid.js';
import { S, DESKS, BENCH, SPOTS, RADIUS, chairBox, CHAIR_REST, CHAIR_TUCKED, CHAIR_NODE } from './layout.js';
import { createSmoking } from './smoke.js';
import { createCoffee, SIP } from './coffee.js';

const FPS = 30, FADE = 0.3, LEAD = 0.9;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const P = (x, z, th = 0) => ({ x, z, th });
const comp = (A, B) => { const c = Math.cos(A.th), s = Math.sin(A.th); return P(A.x + B.x * c + B.z * s, A.z - B.x * s + B.z * c, A.th + B.th); };
const inv = (A) => { const c = Math.cos(A.th), s = Math.sin(A.th); return P(-(A.x * c - A.z * s), -(A.x * s + A.z * c), -A.th); };
const fwd = (T) => [Math.sin(T.th), Math.cos(T.th)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const deg = THREE.MathUtils.degToRad;

export function createEditor(scene, office, gltf, chairTracks, extra = {}) {   // extra: { smoke, coffee: add-on gltfs, typeClip, typewriters, camera, renderer }
  const root = gltf.scene, Bn = {};
  const holder = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(S);
  holder.add(body); body.add(root); scene.add(holder); holder.name = 'EDITOR2A';
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } if (o.isBone) Bn[o.name] = o; });
  const setHolder = (T) => { holder.position.set(T.x, 0, T.z); holder.rotation.y = T.th; };
  const holderPose = () => P(holder.position.x, holder.position.z, holder.rotation.y);

  // ---------- eyelids: blink every 2–6 s
  const LID = [null, 'Lid_25', 'Lid_50', 'Lid_75', 'Blink'], lids = { meshes: [], t: 0, next: 2, phase: -1, dbl: false };
  root.traverse((o) => { if (o.isSkinnedMesh && o.morphTargetDictionary && o.morphTargetDictionary.Blink !== undefined) lids.meshes.push(o); });
  function setLid(a) { const k = Math.min(1, Math.max(0, a)) * 4, i = Math.min(3, Math.floor(k)), f = k - i;
    for (const m of lids.meshes) { const d = m.morphTargetDictionary, w = m.morphTargetInfluences; for (const n of LID) if (n && d[n] !== undefined) w[d[n]] = 0;
      if (i > 0) w[d[LID[i]]] = 1 - f; w[d[LID[i + 1]]] += f; } }
  function lidFrame(dt) { if (!lids.meshes.length) return; lids.t += dt;
    if (lids.phase < 0) { if (lids.t >= lids.next) { lids.phase = 0; lids.t = 0; } else return setLid(0); }
    const C = 0.07, H = 0.04, O = 0.13, t = lids.t; setLid(t < C ? smooth(t / C) : t < C + H ? 1 : t < C + H + O ? 1 - smooth((t - C - H) / O) : 0);
    if (t >= C + H + O) { lids.t = 0; if (!lids.dbl && Math.random() < 0.15) { lids.dbl = true; lids.next = 0.12; } else { lids.dbl = false; lids.next = 2 + Math.random() * 4; } lids.phase = -1; } }

  // ---------- root motion: sample each clip on a scratch skeleton, keep the pelvis relative to a ground frame
  const rig = Bn.pelvis.parent, rigRest = new THREE.Matrix4().compose(rig.position, rig.quaternion, rig.scale);
  const sg = new THREE.Group(); sg.scale.setScalar(S); const sclone = cloneSkinned(root); sg.add(sclone); sg.updateMatrixWorld(true);
  const sam = { pelvis: sclone.getObjectByName('pelvis'), thighL: sclone.getObjectByName('thigh_l'), thighR: sclone.getObjectByName('thigh_r'),
    ext: ['foot_l', 'foot_r', 'hand_l', 'hand_r', 'head'].map((n) => sclone.getObjectByName(n)) };
  const smix = new THREE.AnimationMixer(sclone);
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function groundFrame() {
    const pel = sam.pelvis.getWorldPosition(_v1), l = sam.thighL.getWorldPosition(_v2), r = sam.thighR.getWorldPosition(_v3);
    const Rr = new THREE.Vector3(r.x - l.x, 0, r.z - l.z).normalize(), f = new THREE.Vector3(0, 1, 0).cross(Rr);
    return P(pel.x, pel.z, Math.atan2(f.x, f.z));
  }
  const matOf = (T) => new THREE.Matrix4().makeRotationY(T.th).setPosition(T.x, 0, T.z);
  function stripClip(name, clip, mode) {
    const act = smix.clipAction(clip); smix.stopAllAction(); act.reset().play(); act.setEffectiveWeight(1);
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1), times = new Float32Array(n), pos = new Float32Array(n * 3), quat = new Float32Array(n * 4), traj = [];
    const pel = sam.pelvis, parent = pel.parent; let T0 = null, prevX = null; const spd = [], py = [];
    for (let k = 0; k < n; k++) {
      const t = Math.min(clip.duration, k / FPS); act.time = t; smix.update(0); sg.updateMatrixWorld(true);
      let T = groundFrame(); if (!T0) T0 = T; if (mode === 'first') T = T0; else if (typeof mode === 'object') T = mode;   // object: a fixed frame (the seat)
      traj.push(T); times[k] = t; py.push(pel.matrixWorld.elements[13]);
      const X = sam.ext.map((b) => b.getWorldPosition(new THREE.Vector3())); if (prevX) spd.push(Math.max(...X.map((p, i) => p.distanceTo(prevX[i]))) * FPS); prevX = X;
      const M = matOf(T).invert().multiply(pel.matrixWorld);
      const Pw = new THREE.Matrix4().copy(parent.parent.matrixWorld).multiply(rigRest);
      Pw.invert().multiply(M).decompose(_v1, _q, _s);
      pos.set([_v1.x, _v1.y, _v1.z], k * 3); quat.set([_q.x, _q.y, _q.z, _q.w], k * 4);
    }
    act.stop();
    const tracks = clip.tracks.filter((t) => t.name !== 'pelvis.position' && t.name !== 'pelvis.quaternion' && !t.name.startsWith(parent.name + '.'));
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, pos), new THREE.QuaternionKeyframeTrack('pelvis.quaternion', times, quat));
    const c = new THREE.AnimationClip(name, clip.duration, tracks);
    let last = spd.length - 1; while (last > 0 && spd[last] < 0.7) last--;
    const cutEnd = Math.min(clip.duration, (last + 1) / FPS + 0.1);
    let lo = 0; for (let k = 1; k < n; k++) if (py[k] < py[lo]) lo = k;
    const yEnd = py[n - 1]; let up = n - 1; for (let k = lo; k < n; k++) if (py[k] >= yEnd - 0.06) { up = k; break; }
    return { clip: c, traj, frames: n, cutEnd, cutUp: Math.min(cutEnd, up / FPS) };
  }
  const raw = {}; for (const c of gltf.animations) raw[c.name] = c;
  const walkClip = raw.walk.clone(); walkClip.tracks = walkClip.tracks.filter((t) => !t.name.startsWith(rig.name + '.'));
  let NATIVE = 1.9;
  { const a = smix.clipAction(raw.walk); a.play(); smix.setTime(0); sg.updateMatrixWorld(true); const p0 = sam.pelvis.getWorldPosition(new THREE.Vector3());
    const d = raw.walk.duration - 1e-4; smix.setTime(d); sg.updateMatrixWorld(true); const p1 = sam.pelvis.getWorldPosition(new THREE.Vector3());
    NATIVE = Math.hypot(p1.x - p0.x, p1.z - p0.z) / d; a.stop(); smix.uncacheAction(raw.walk); }
  { const t = walkClip.tracks.find((t) => t.name === 'pelvis.position'), v = t.values, T = t.times, n = T.length, d = [v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]];
    for (let i = 0; i < n; i++) { const k = (T[i] - T[0]) / (T[n - 1] - T[0]); for (let j = 0; j < 3; j++) v[i * 3 + j] -= d[j] * k; } }
  const CL = {};
  for (const [n, c] of Object.entries(raw)) if (n !== 'walk') CL[n] = stripClip(n, c, (n === 'stand_idle' || n === 'sit_idle') ? 'first' : 'traj');
  for (const [n, c] of Object.entries(CL)) { if (!/_stand_/.test(n)) continue; c.cutGo = c.cutUp;
    const tk = chairTracks[n.replace('desk_stand_', 'SitChairTable_Trans_Stand_')];
    if (n.startsWith('desk_') && tk) { const t = tk.track.map((v) => v[1]), fin = t[t.length - 1]; let pk = 0; t.forEach((v, k) => { if (v > t[pk]) pk = k; });
      let e = pk; while (e < t.length - 1 && t[e] > fin + 0.005) e++; c.cutGo = Math.max(c.cutUp, e / FPS + 0.6); }
    const k = Math.round(c.cutGo * FPS), a = c.traj[Math.max(0, k - 3)], b = c.traj[Math.min(c.traj.length - 1, k + 3)]; c.vGo = dist(a, b) / 6 * FPS; }
  const seatBase = CL.sit_idle.traj[0];                                   // seated ground frame of the pack (desk frame at its origin)
  // typing (MC Seated SitChairTablePC_01_Type, clip from editor2A v13 as on the approved page): the actor sits 4.5 cm nearer the desk; the chair stays put
  const TYPE_KEYS = [8, 25, 30, 34, 38, 42, 46, 51, 56, 60, 65, 69, 73, 76, 81, 89, 93, 103].map((f) => (f - 1) / FPS);   // fingertip strikes (type-contacts.json)
  if (extra.typeClip) CL.type = stripClip('type', extra.typeClip, seatBase);
  // coffee (director's activity 'coffee', seated at a desk): a mug stands on every desk, sips of the approved DrinkR clip
  let coffee = null;
  if (extra.coffee) { try { coffee = createCoffee({ scene, addon: extra.coffee, DESKS, S }); CL.drink = stripClip('drink', coffee.bodyClip, seatBase); }
    catch (e) { console.warn('coffee unavailable:', e); coffee = null; } }

  // ---------- seats in the office
  const SEATS = {};
  for (const k of Object.keys(DESKS)) SEATS['desk' + k] = { name: DESKS[k].label, desk: k, pose: comp(DESKS[k], seatBase),
    entries: [['L02a', 'desk_sit_L02a', 'left'], ['L03a', 'desk_sit_L03a', 'left'], ['R02a', 'desk_sit_R02a', 'right']],
    exits: [['L02a', 'desk_stand_L02a', 'left'], ['L03a', 'desk_stand_L03a', 'left'], ['R02a', 'desk_stand_R02a', 'right']] };
  const BENCH_TAGS = { S: [['R01', 'right']], M: [['L02', 'left'], ['R02', 'right']], N: [['L01', 'left']] };
  for (const k of Object.keys(BENCH)) SEATS['bench' + k] = { name: BENCH[k].label, pose: P(BENCH[k].x, BENCH[k].z, Math.PI / 2 + seatBase.th),
    entries: BENCH_TAGS[k].map(([t, s]) => [t, 'booth_sit_' + t, s]), exits: BENCH_TAGS[k].map(([t, s]) => [t, 'booth_stand_' + t, s]) };
  const anchorFor = (clipName, seat, at) => { const c = CL[clipName]; return comp(seat, inv(at === 'end' ? c.traj[c.traj.length - 1] : c.traj[0])); };
  function trajAt(c, t) { const k = Math.min(c.traj.length - 1, Math.max(0, t * FPS)), i = Math.floor(k), f = k - i, a = c.traj[i], b = c.traj[Math.min(i + 1, c.traj.length - 1)];
    return P(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, a.th + wrap(b.th - a.th) * f); }

  // ---------- desk chairs (office nodes) and walking
  const chairs = {}; office.updateMatrixWorld(true);
  for (const [k, name] of Object.entries(CHAIR_NODE)) { const node = office.getObjectByName(name);
    if (node) chairs[k] = { node, rest: node.getWorldPosition(new THREE.Vector3()), dy: CHAIR_REST, plan: CHAIR_REST }; }
  const nav = createNav(GRID, RADIUS);
  const syncBoxes = () => nav.setBoxes(Object.keys(DESKS).map((k) => chairBox(k, chairs[k] ? chairs[k].plan : CHAIR_REST)));
  function setChair(k, dy) { const c = chairs[k]; if (!c) return; c.dy = dy;
    const w = c.rest.clone(); w.z -= (dy - CHAIR_REST) * S; c.node.position.copy(c.node.parent.worldToLocal(w)); }
  syncBoxes();
  const path = (a, b) => nav.path(a, b, 0.25);

  function entryOptions(seatId, from) {
    const seat = SEATS[seatId];
    return seat.entries.map(([tag, clip, side]) => {
      const anc = anchorFor(clip, seat.pose, 'end'), E = comp(anc, CL[clip].traj[0]), f = fwd(E), P0 = P(E.x - f[0] * LEAD, E.z - f[1] * LEAD, E.th);
      const blocked = nav.solid(E.x, E.z), pts = blocked ? null : path(from, P0), cost = pts ? nav.length(pts) + LEAD : Infinity;
      return { tag, clip, side, E, P0, pts, cost, blocked, anc };
    });
  }
  function exitOptions(seatId, goal) {
    const seat = SEATS[seatId];
    return seat.exits.map(([tag, clip, side]) => {
      const anc = anchorFor(clip, seat.pose, 'start'), X = comp(anc, CL[clip].traj[CL[clip].traj.length - 1]), f = fwd(X), X1 = P(X.x + f[0] * 0.5, X.z + f[1] * 0.5, X.th);
      const tgt = goal.seat ? Math.min(...entryOptions(goal.seat, X1).map((o) => o.cost)) : nav.length(path(X1, goal.point));
      return { tag, clip, side, X, cost: nav.solid(X.x, X.z) ? Infinity : 0.5 + tgt, anc };
    });
  }

  // ---------- animation layers
  const mixer = new THREE.AnimationMixer(root), A = {}, W = {};
  function layer(name, clip, loop = true) { const a = mixer.clipAction(clip); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce); a.clampWhenFinished = true; a.play(); a.setEffectiveWeight(0); A[name] = a; W[name] = { cur: 0, target: 0, rate: 1 / FADE }; }
  layer('walk', walkClip); layer('stand_idle', CL.stand_idle.clip); layer('sit_idle', CL.sit_idle.clip); if (CL.type) layer('type', CL.type.clip);
  for (const n of Object.keys(CL)) if (n.startsWith('desk_') || n.startsWith('booth_')) layer(n, CL[n].clip, false);
  if (CL.drink) { layer('drink', CL.drink.clip, false); A.drink.paused = true; }
  function fadeTo(name, t = FADE) { for (const k in W) W[k].target = k === name ? 1 : 0; W[name].rate = 1 / t; }
  function stepWeights(dt) { let sum = 0; for (const k in W) { const w = W[k]; w.cur += Math.sign(w.target - w.cur) * Math.min(Math.abs(w.target - w.cur), dt * (w.rate || 3)); sum += w.cur; }
    for (const k in W) A[k].setEffectiveWeight(sum > 0 ? W[k].cur / sum : 0); }
  function snapWeights() { for (const k in W) W[k].cur = W[k].target; stepWeights(0); }

  // ---------- smoking (director's activity 'smoke'): standing at a spot, or seated at a desk
  let smoking = null;
  const deskFrame = {};
  for (const [k, D] of Object.entries(DESKS)) { const M = new THREE.Matrix4().makeRotationY(D.th).setPosition(D.x, 0, D.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
    deskFrame[k] = { inv: M.clone().invert(), dir: new THREE.Matrix3().setFromMatrix4(M) }; }
  if (extra.smoke) {
    try { smoking = createSmoking({ scene, root, B: Bn, mixer, U: S, addon: extra.smoke, strip: stripClip, camera: extra.camera, renderer: extra.renderer });
      smoking.setSitBase(CL.sit_idle.clip); }
    catch (e) { console.warn('smoking unavailable:', e); smoking = null; }
  }
  // «курит и пьёт кофе» (smoke_coffee, approved «Курилка» v8): the left hand drinks from a mug on the left while the right one holds the cigarette
  const mugL = {};
  if (smoking && extra.drinkL) {
    try { const dc = extra.drinkL.animations[0], nodeOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName; let slot = null;
      extra.drinkL.scene.traverse((o) => { if (!slot && /^PROP.*mug.*slot.*L$/i.test(o.name)) slot = o; });
      const body = stripClip('drink_l', new THREE.AnimationClip('drink_l', dc.duration, dc.tracks.filter((t) => nodeOf(t) !== slot.name)), seatBase).clip;
      const armR = new Set(), armL = new Set(); Bn.clavicle_r.traverse((o) => { if (o.isBone) armR.add(o.name); }); Bn.clavicle_l.traverse((o) => { if (o.isBone) armL.add(o.name); });
      const part = (keep, sfx) => new THREE.AnimationClip('drink_l' + sfx, body.duration, body.tracks.filter((t) => keep(nodeOf(t))));
      smoking.setDrinkL(part((b) => !armR.has(b) && !armL.has(b), '_core'), part((b) => armL.has(b), '_L'));
      const mugClip = new THREE.AnimationClip('drink_l_mug', dc.duration, dc.tracks.filter((t) => nodeOf(t) === slot.name));
      for (const [k, D] of Object.entries(DESKS)) {                  // a mug per desk in the pack's table frame (DESK × S), moved along the baked path
        const g = new THREE.Group(); g.name = 'COFFEE L ' + k; g.matrixAutoUpdate = false; g.matrix.makeRotationY(D.th).setPosition(D.x, 0, D.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
        const s = slot.clone(true); s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(s); g.visible = false; scene.add(g);
        const m = new THREE.AnimationMixer(s), a = m.clipAction(mugClip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.time = 0; m.update(0);
        mugL[k] = { g, m, a, t: 0, D: dc.duration }; }
    } catch (e) { console.warn('coffee with a cigarette unavailable:', e); }
  }
  const smokeWant = () => {
    const act = cur?.activity; if (act !== 'smoke' && act !== 'smoke_coffee') return null;
    if (ch.mode === 'seated' && ch.seat) { const d = SEATS[ch.seat].desk;                      // at a desk, or on the bench (no desk top to keep the hands off)
      return { mode: 'sit', desk: d ? deskFrame[d] : null, seq: cur.seq, drink: act === 'smoke_coffee' && !!d && !!mugL[d] }; }
    if (act === 'smoke' && ch.mode === 'idle' && !ch.seat) return { mode: 'stand', seq: cur.seq };
    return null;
  };
  // hand IK on top of the mixer: put the arms back to the clean animated pose before each update (the mixer skips unchanged values)
  const ARMS = ['upperarm_r', 'lowerarm_r', 'hand_r', 'upperarm_l', 'lowerarm_l', 'hand_l'].map((n) => Bn[n]), armQ = ARMS.map((b) => b.quaternion.clone());
  const armRestore = () => ARMS.forEach((b, i) => b.quaternion.copy(armQ[i])), armSave = () => ARMS.forEach((b, i) => armQ[i].copy(b.quaternion));

  // ---------- behaviour (as the seating page v6)
  const tw = extra.typewriters || null;
  // activities that need a free desk: the typewriter on that desk is taken away (none of them is live yet)
  const FREE_DESK = new Set(['lunch', 'coffee', 'smoke_coffee']);
  let freeDesk = null, freeKind = null;
  const typing = () => !!(CL.type && ch.work && ch.seat && SEATS[ch.seat].desk);
  const seatedLoop = () => (typing() ? 'type' : 'sit_idle');
  // a sip: starts only while he is having coffee at a desk (by the coffee clock), once started it is drunk to the end
  const sipping = () => ch.sip !== null;
  const ch = { sip: null, coffeeT: 0, work: false, title: '', mode: 'idle', seat: null, speed: 0, vis: 0, err: 0, path: null, cursor: 0, after: null, trans: null, queue: null, chairTail: null, blendIn: 0, motion: 'стоит' };
  function command(goal) {
    if (ch.mode === 'trans' || ch.mode === 'settle') { ch.queue = goal; return; }
    if (ch.seat) {
      if (goal.seat === ch.seat) return;
      if (ch.mode === 'seated' && sipping()) { ch.queue = goal; ch.mode = 'settle'; ch.motion = 'допивает'; return; }
      if (ch.mode === 'seated' && W.type && W.type.cur > 0.05) { ch.queue = goal; ch.mode = 'settle'; fadeTo('sit_idle', 0.6); W.type.rate = 1 / 0.6; ch.motion = 'откладывает работу'; return; }
      const opts = exitOptions(ch.seat, goal), pick = opts.filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0] || opts[0];
      ch.queue = goal; startTrans(pick.clip, pick.anc, 'stand'); ch.motion = 'встаёт'; return;
    }
    goTo(goal);
  }
  function goTo(goal) {
    const here = holderPose();
    if (goal.seat) {
      const pick = entryOptions(goal.seat, here).filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) { ch.motion = 'не может подойти'; return; }
      ch.path = [...pick.pts, P(pick.E.x, pick.E.z)]; ch.cursor = 0; ch.after = { type: 'sit', seat: goal.seat, opt: pick }; ch.mode = 'walk'; ch.motion = 'идёт';
    } else {
      const pts = path(here, goal.point); if (!pts) { ch.motion = 'туда не пройти'; return; }
      ch.path = pts; ch.cursor = 0; ch.after = { type: 'stand', face: goal.point.th }; ch.mode = 'walk'; ch.motion = 'идёт';
    }
  }
  function startTrans(clipName, anc, kind, seatId) {
    const c = CL[clipName], a = A[clipName]; a.reset(); a.play(); a.paused = false;
    const start = comp(anc, c.traj[0]), here = holderPose();
    const desk = clipName.startsWith('desk') ? SEATS[kind === 'sit' ? seatId : ch.seat].desk : null;
    ch.trans = { clip: clipName, c, anc, t: 0, kind, seatId, desk, off: P(here.x - start.x, here.z - start.z, wrap(here.th - start.th)),
      chairFrom: desk && chairs[desk] ? chairs[desk].dy : null };
    if (desk && chairs[desk]) { chairs[desk].plan = kind === 'sit' ? 0 : CHAIR_TUCKED; syncBoxes(); }
    ch.chairTail = null; ch.mode = 'trans'; fadeTo(clipName, 0.25);
  }
  function updateChair(tr) {
    if (!tr.desk || !chairs[tr.desk]) return;
    const name = tr.clip.replace('desk_sit_', 'Stand_Trans_SitChairTable_').replace('desk_stand_', 'SitChairTable_Trans_Stand_'), track = chairTracks[name];
    if (!track) return;
    const i = Math.min(track.track.length - 1, Math.max(0, Math.floor(tr.t * FPS))); let dy = track.track[i][1];
    if (tr.kind === 'sit' && tr.chairFrom !== null && Math.abs(tr.chairFrom - track.track[0][1]) > 1e-3) {   // chair left where it was: ease into the track by the time the hand pulls it
      if (track.peak === undefined) { let m = 0; track.track.forEach((v, k) => { if (v[1] > track.track[m][1]) m = k; }); track.peak = Math.max(1, m) / FPS; }
      dy += (tr.chairFrom - track.track[0][1]) * (1 - smooth(tr.t / track.peak));
    }
    setChair(tr.desk, dy);
  }
  function updateChar(dt) {
    // settle: hands go back from the keys to the desk, then he may stand up
    if (ch.mode === 'settle') { if ((!W.type || W.type.cur <= 0.02) && !sipping()) { ch.mode = 'seated'; const q = ch.queue; ch.queue = null; if (q) command(q); } }
    if (ch.mode === 'seated' && W.type) {                              // switch between typing and resting without standing up
      const want = seatedLoop();
      if (W[want].target < 1) { if (want === 'type') { A.type.reset(); A.type.play(); } fadeTo(want, 0.9); }
      ch.motion = want === 'type' ? 'печатает' : 'сидит';
    }
    if (coffee) {
      const desk = ch.seat && SEATS[ch.seat].desk, D = coffee.duration;
      const on = !!desk && ch.mode === 'seated' && ch.activity === 'coffee';
      if (on) { const u = ch.coffeeT - SIP.wait, c = D + SIP.rest; ch.coffeeT += dt;
        if (!sipping() && u >= 0 && u % c < D - 0.2) ch.sip = u % c; }
      else ch.coffeeT = 0;
      if (sipping()) {
        if (!desk || ch.mode === 'walk' || ch.mode === 'trans' || ch.mode === 'idle' || ch.mode === 'turn') ch.sip = null;   // placed elsewhere: nothing in hand
        else { ch.sip += dt; if (ch.sip >= D) ch.sip = null; }
      }
      const t = sipping() ? ch.sip : 0, w = sipping() ? smooth(t / SIP.fade) * (1 - smooth((t - (D - SIP.fade)) / SIP.fade)) : 0;
      A.drink.time = Math.min(t, D - 1e-4);
      if (desk) { coffee.set(desk, t); }
      if (sipping()) { for (const k in W) { W[k].target = W[k].cur = 0; } W.drink.target = W.drink.cur = w; W.sit_idle.target = W.sit_idle.cur = 1 - w; ch.motion = 'пьёт кофе'; }
      else if (W.drink.cur > 0) { W.drink.target = W.drink.cur = 0; if (ch.mode === 'seated' || ch.mode === 'settle') { W.sit_idle.target = W.sit_idle.cur = 1; } }
    }
    if (tw) {                                                           // typewriters stay on the desks; an activity that needs the desk clears it
      if (FREE_DESK.has(ch.activity)) { freeDesk = ch.goalDesk || freeDesk; freeKind = ch.activity; }          // hidden as soon as he sets off towards that desk
      else if (freeDesk && !(ch.seat && SEATS[ch.seat].desk === freeDesk) && ch.mode !== 'settle') freeDesk = null;   // back once he has got up and left
      tw.clear(freeDesk);
    }
    if (coffee) for (const k of Object.keys(DESKS)) coffee.show(k, (!tw || freeDesk === k) && freeKind !== 'smoke_coffee');   // the mug takes the typewriter's place (they would overlap)
    for (const k in mugL) mugL[k].g.visible = freeDesk === k && freeKind === 'smoke_coffee';                              // with a cigarette: the left-hand mug
    if (ch.chairTail) { const tr = ch.chairTail; tr.t += dt; updateChair(tr); if (tr.t > tr.c.clip.duration) ch.chairTail = null; }
    if (ch.mode === 'walk') {
      const pts = ch.path; let rest = 0; const p = holderPose();
      for (let i = ch.cursor + 1; i < pts.length; i++) rest += dist(i === ch.cursor + 1 ? p : pts[i - 1], pts[i]);
      const acc = 3.2; ch.speed = Math.min(NATIVE, ch.speed + acc * dt, Math.sqrt(2 * acc * Math.max(0, rest)) + 0.02);
      { const q = pts[Math.min(ch.cursor + 1, pts.length - 1)], hx = q.x - holder.position.x, hz = q.z - holder.position.z;
        ch.err = Math.hypot(hx, hz) > 0.05 ? Math.abs(wrap(Math.atan2(hx, hz) - holder.rotation.y)) : 0; }
      const align = ch.err > 0.8 ? Math.max(0.15, Math.cos(ch.err)) : 1; ch.vis = ch.speed * align;
      let s = ch.speed * align * dt, x = holder.position.x, z = holder.position.z, dir = null;
      while (s > 0 && ch.cursor < pts.length - 1) { const q = pts[ch.cursor + 1], l = Math.hypot(q.x - x, q.z - z); if (l > 1e-6) dir = [(q.x - x) / l, (q.z - z) / l];
        if (l <= s) { x = q.x; z = q.z; ch.cursor++; s -= l; } else { x += (q.x - x) * s / l; z += (q.z - z) * s / l; s = 0; } }
      holder.position.x = x; holder.position.z = z;
      if (dir) { const want = Math.atan2(dir[0], dir[1]), max = deg(ch.err > 0.8 ? 300 : 160) * dt; holder.rotation.y = wrap(holder.rotation.y + THREE.MathUtils.clamp(wrap(want - holder.rotation.y), -max, max)); }
      if (ch.after?.type === 'sit' && rest < 0.12 && Math.abs(wrap(ch.after.opt.E.th - holder.rotation.y)) < deg(25)) {
        const o = ch.after.opt; ch.speed = 0; startTrans(o.clip, o.anc, 'sit', ch.after.seat); ch.motion = 'садится'; return; }
      if (ch.cursor >= pts.length - 1) { ch.speed = 0; ch.mode = 'turn'; }
    }
    if (ch.mode === 'turn') {
      const want = ch.after?.type === 'sit' ? ch.after.opt.E.th : (ch.after?.face ?? holder.rotation.y), d = wrap(want - holder.rotation.y), max = deg(150) * dt;
      holder.rotation.y = wrap(holder.rotation.y + THREE.MathUtils.clamp(d, -max, max));
      if (Math.abs(d) < deg(ch.after?.type === 'sit' ? 10 : 4)) {
        if (ch.after?.type === 'sit') { const o = ch.after.opt; startTrans(o.clip, o.anc, 'sit', ch.after.seat); ch.motion = 'садится'; }
        else { ch.mode = 'idle'; ch.motion = 'стоит'; const q = ch.queue; ch.queue = null; if (q) command(q); }
      }
    }
    if (ch.mode === 'trans') {
      const tr = ch.trans; tr.t += dt; const T = comp(tr.anc, trajAt(tr.c, tr.t)), k = 1 - smooth(tr.t / 0.6);
      setHolder(P(T.x + tr.off.x * k, T.z + tr.off.z * k, T.th + tr.off.th * k));
      updateChair(tr);
      if (tr.t >= (tr.kind === 'stand' ? (ch.queue ? tr.c.cutGo : tr.c.cutEnd) : tr.c.clip.duration - 1 / FPS)) {
        if (tr.kind === 'sit') { ch.seat = tr.seatId; ch.mode = 'seated'; fadeTo(seatedLoop(), typing() ? 0.9 : FADE); A.sit_idle.reset(); if (typing()) { A.type.reset(); A.type.play(); } setHolder(SEATS[tr.seatId].pose); ch.motion = 'сидит';
          if (tr.desk) setChair(tr.desk, 0); const q = ch.queue; ch.queue = null; if (q) command(q); }
        else { ch.seat = null; ch.mode = 'idle'; fadeTo('stand_idle'); ch.motion = 'стоит'; const q = ch.queue; if (tr.desk) ch.chairTail = tr; ch.queue = null;
          if (q) { goTo(q); if (ch.mode === 'walk') { ch.speed = THREE.MathUtils.clamp(tr.c.vGo, 0.6, 1.4); ch.blendIn = 0.45; } } }
      }
    }
    if (ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'idle') {
      const v = ch.mode === 'walk' ? ch.vis : ch.speed, wW = smooth((v / NATIVE - 0.06) / 0.25);
      W.walk.target = wW; W.stand_idle.target = 1 - wW; for (const k in W) if (k !== 'walk' && k !== 'stand_idle') W[k].target = 0;
      ch.blendIn = Math.max(0, ch.blendIn - dt); W.walk.rate = W.stand_idle.rate = ch.blendIn > 0 ? 3 : 6; A.walk.timeScale = Math.max(0.6, v / NATIVE);
    }
  }

  // ---------- playing the director's commands
  const goalOf = (g) => (!g ? null : g.seat ? { seat: g.seat } : g.spot ? { point: SPOTS[g.spot] } : null);
  function place(from, chairState) {
    ch.mode = 'idle'; ch.seat = null; ch.trans = null; ch.sip = null; ch.queue = null; ch.chairTail = null; ch.path = null; ch.after = null; ch.speed = 0; ch.vis = 0;
    for (const k of Object.keys(chairs)) { const v = chairState?.[k] ?? CHAIR_REST; setChair(k, v); chairs[k].plan = v; }
    if (from?.seat && SEATS[from.seat]) { const s = SEATS[from.seat]; setHolder(s.pose); ch.seat = from.seat; ch.mode = 'seated'; ch.motion = 'сидит'; fadeTo(seatedLoop()); if (s.desk) { setChair(s.desk, 0); chairs[s.desk].plan = 0; } }
    else { const p = (from?.spot && SPOTS[from.spot]) || SPOTS.window; setHolder(p); ch.motion = 'стоит'; fadeTo('stand_idle'); }
    syncBoxes(); snapWeights();
  }
  let cur = null, simT = 0;                          // current command and how far it has been played (s)
  const placeKey = (g) => (g ? g.seat || g.spot || null : null);
  function frame(dt, ff) {
    updateChar(dt); stepWeights(dt);
    if (smoking) smoking.pre(dt, smokeWant(), A);
    { const d = ch.seat && SEATS[ch.seat].desk, M = d && mugL[d];                      // the left-hand mug follows the sip; before the first sip it stands at frame 1, after it at the last
      if (M && cur?.activity === 'smoke_coffee' && ch.mode === 'seated') { const s = smoking.sipTime(), t = s >= 0 ? s : smoking.clockT() >= smoking.holdStart() ? M.D : 0;
        if (Math.abs(t - M.t) > 1e-6) { M.t = t; M.a.time = Math.min(t, M.D); M.m.update(0); } } }
    if (!ff) {
      const t0 = A.type ? A.type.time : 0;
      if (smoking) armRestore();
      mixer.update(dt);
      if (smoking) { holder.updateMatrixWorld(true); armSave(); smoking.post(dt); }
      lidFrame(dt);
      if (A.type && tw && ch.seat && SEATS[ch.seat].desk && W.type.cur > 0.6) {     // a letter on every fingertip strike
        const t1 = A.type.time, d = CL.type.clip.duration;
        for (const k of TYPE_KEYS) if ((t1 >= t0 && k > t0 && k <= t1) || (t1 < t0 && (k > t0 || k <= t1))) tw.key(SEATS[ch.seat].desk);
      }
    }
  }
  function fastForward(sec) {                         // late join / hidden tab: replay the command at 30 steps a second, draw once
    const n = Math.min(Math.round(sec * FPS), 90 * FPS);       // any walk + sit is over within 90 s
    for (let i = 0; i < n; i++) frame(1 / FPS, true);
    simT += sec;
    if (ch.mode === 'trans') A[ch.trans.clip].time = ch.trans.t;
    snapWeights(); if (smoking) smoking.pre(0, smokeWant(), A); mixer.update(0); if (smoking) { holder.updateMatrixWorld(true); armSave(); }
  }
  function apply(w, serverNow) {                      // w = {seq, editor: {from, cmd, at}, chairs}
    if (!w?.editor || (cur && cur.seq === w.seq)) return;
    const e = w.editor, elapsed = Math.max(0, (serverNow - e.at) / 1000);
    ch.work = e.activity ? e.activity === 'work' : /^(работает|правит)/.test(e.label || '');
    ch.title = (/«(.+)»/.exec(e.label || '') || [])[1] || '';
    ch.activity = e.activity || (ch.work ? 'work' : ''); ch.coffeeT = 0;   // every decision starts its own coffee clock (live and late viewers alike)
    { const g = e.cmd?.seat || e.from?.seat; ch.goalDesk = g && SEATS[g] ? SEATS[g].desk : null; }
    // live viewer: he is already there (or on his way there) — go on from here; otherwise rebuild the start and catch up
    const dest = cur ? placeKey(cur.cmd || cur.from) : null;
    const cont = cur && dest === placeKey(e.from) && elapsed < 3;
    if (!cont) place(e.from, w.chairs);
    cur = { seq: w.seq, at: e.at, from: e.from, cmd: e.cmd, label: e.label || '', source: e.source || '', activity: e.activity || '' }; simT = 0;
    const g = goalOf(e.cmd); if (g) command(g);
    if (!cont && elapsed > 0.05) fastForward(elapsed);
  }
  function update(dt, serverNow) {
    if (cur && serverNow) { const lag = (serverNow - cur.at) / 1000 - simT; if (lag > 1.5) fastForward(lag); }
    frame(dt, false); simT += dt;
  }
  place({ seat: 'deskA' }, null);
  return {
    apply, update, holder, SEATS, nav, chairs, fx: smoking ? smoking.fx : null,
    mugs: coffee ? coffee.groups : [],
    moving: () => ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'trans' || !!ch.chairTail || !!smoking?.active() || sipping(),
    status: () => ({ label: cur?.label || '', motion: ch.motion, mode: ch.mode, seat: ch.seat, source: cur?.source || '', smoke: smoking ? smoking.status() : null, coffee: coffee ? { t: +ch.coffeeT.toFixed(2), sip: ch.sip === null ? null : +ch.sip.toFixed(2), w: W.drink ? +W.drink.cur.toFixed(2) : 0 } : null }),
    debug: { ch, CL, A, W, mixer, SEATS, comp, trajAt, setHolder, snapWeights, command: (g) => command(goalOf(g) || g), place, entryOptions, exitOptions, holderPose, NATIVE: () => NATIVE, smoking },
  };
}
