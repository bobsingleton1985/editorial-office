// editor2A in the office: walking, sitting down at desks A/B/C and on the lounge bench, standing up, the desk chair
// following the pack's chair track. Movement logic is the approved seating page v6, moved into the office layout.
// The page never decides anything itself: it plays commands that arrive from the director ({from, cmd, at}).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { S, DESKS, BENCH, SPOTS, CHAIR_REST, CHAIR_TUCKED } from './layout.js';
import { createSmoking } from './smoke.js';
import { SIP } from './coffee.js';
import { createLunch, DISHES, DISH_NAME } from './lunch.js';
import { plan as gPlan, sample as gSample, wrapUp as gWrap, SEATED as G_SEATED, POOLS as G_POOLS, phonePlan } from './gestures.js';

const FPS = 30, FADE = 0.3, LEAD = 0.9;
// the left hand's fingers holding the mug (drink_l, «Курилка» v8, mid-sip): the same grip holds the phone's handset
const GRIP_L = { index_01_l: [0.0227, -0.1689, 0.264, 0.9493], index_02_l: [0.0694, 0.0584, 0.6368, 0.7657], index_03_l: [-0.0001, 0.0154, 0.1767, 0.9841],
  middle_01_l: [-0.0183, -0.1142, 0.5858, 0.8021], middle_02_l: [0.0002, -0.0327, 0.6381, 0.7693], middle_03_l: [-0.0019, -0.0195, 0.4861, 0.8737],
  ring_01_l: [-0.0176, -0.1271, 0.5486, 0.8262], ring_02_l: [-0.0126, -0.1683, 0.6617, 0.7305], ring_03_l: [-0.0002, -0.0667, 0.3212, 0.9447],
  pinky_01_l: [-0.0327, -0.1437, 0.4467, 0.8824], pinky_02_l: [0.0508, -0.3101, 0.6643, 0.6782], pinky_03_l: [-0.1115, -0.1455, 0.4056, 0.8955],
  thumb_01_l: [0.7449, 0.2419, -0.0452, 0.6201], thumb_02_l: [-0.1084, 0.0484, 0.1403, 0.983], thumb_03_l: [-0.0009, -0.0103, 0.313, 0.9497] };
const _qg = new THREE.Quaternion();
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const P = (x, z, th = 0) => ({ x, z, th });
const comp = (A, B) => { const c = Math.cos(A.th), s = Math.sin(A.th); return P(A.x + B.x * c + B.z * s, A.z - B.x * s + B.z * c, A.th + B.th); };
const inv = (A) => { const c = Math.cos(A.th), s = Math.sin(A.th); return P(-(A.x * c - A.z * s), -(A.x * s + A.z * c), -A.th); };
const fwd = (T) => [Math.sin(T.th), Math.cos(T.th)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const deg = THREE.MathUtils.degToRad;

// One person of the newsroom. extra: { shared (office-shared.js), id, chairBack, smoke, lunch, gestures, drinkL: add-on gltfs, typeClip, camera, renderer }.
// gltf = {scene, animations}: the body of this person and the shared clips (one skeleton «MOTUS | rig» for everybody — the clips play by bone names).
export function createEditor(scene, office, gltf, chairTracks, extra = {}) {
  const root = gltf.scene, Bn = {}, ID = extra.id || 'editor', SH = extra.shared, BACK = +extra.chairBack || 0;   // BACK: his chair stands this far further from the desk (m, pack)
  const holder = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(S);
  holder.add(body); body.add(root); scene.add(holder); holder.name = 'PERSON ' + ID;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } if (o.isBone) Bn[o.name] = o; });
  const setHolder = (T) => { holder.position.set(T.x, 0, T.z); holder.rotation.y = T.th; };
  const holderPose = () => P(holder.position.x, holder.position.z, holder.rotation.y);

  // ---------- eyelids: blink every 2–6 s
  const LID = [null, 'Lid_25', 'Lid_50', 'Lid_75', 'Blink'], lids = { meshes: [], t: 0, next: 2, phase: -1, dbl: false };
  root.traverse((o) => { if (o.isSkinnedMesh && o.morphTargetDictionary && o.morphTargetDictionary.Blink !== undefined) lids.meshes.push(o); });
  function setLid(a) { const k = Math.min(1, Math.max(0, a)) * 4, i = Math.min(3, Math.floor(k)), f = k - i;
    for (const m of lids.meshes) { const d = m.morphTargetDictionary, w = m.morphTargetInfluences; for (const n of LID) if (n && d[n] !== undefined) w[d[n]] = 0;
      if (i > 0) w[d[LID[i]]] = 1 - f; w[d[LID[i + 1]]] += f; } }
  const hem = []; root.traverse((o) => { if (o.isMesh && o.morphTargetDictionary && o.morphTargetDictionary.sit_hem !== undefined) hem.push([o, o.morphTargetDictionary.sit_hem]); });
  let hemY = null;                                      // pelvis height standing / seated (rig units), measured on the sample skeleton below
  function hemFrame() { if (!hem.length || !hemY) return; const y = Bn.pelvis.getWorldPosition(_v1).y, w = smooth((hemY[0] - y) / (hemY[0] - hemY[1]));
    for (const [m, i] of hem) m.morphTargetInfluences[i] = w; }
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
  // walks: the add-on editor2A-walks-web brings Mixamo Walking1 (the editor's walk, tempo "как сейчас", approved 29.09) and the drunk walk;
  // without it the pack walk stays and he never staggers
  const addWalk = (n) => extra.walks?.animations.find((a) => a.name === n);
  if (addWalk('walk')) raw.walk = addWalk('walk');
  function prepWalk(clip) {                           // native speed from the pelvis travel, then the drift is taken out (the holder moves him)
    const c = clip.clone(); c.tracks = c.tracks.filter((t) => !t.name.startsWith(rig.name + '.'));
    const a = smix.clipAction(clip); a.play(); smix.setTime(0); sg.updateMatrixWorld(true); const p0 = sam.pelvis.getWorldPosition(new THREE.Vector3());
    const d = clip.duration - 1e-4; smix.setTime(d); sg.updateMatrixWorld(true); const p1 = sam.pelvis.getWorldPosition(new THREE.Vector3());
    const native = Math.hypot(p1.x - p0.x, p1.z - p0.z) / d; a.stop(); smix.uncacheAction(clip);
    const t = c.tracks.find((t) => t.name === 'pelvis.position'), v = t.values, T = t.times, n = T.length, dd = [v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]];
    for (let i = 0; i < n; i++) { const k = (T[i] - T[0]) / (T[n - 1] - T[0]); for (let j = 0; j < 3; j++) v[i * 3 + j] -= dd[j] * k; }
    return { clip: c, native };
  }
  const WK = prepWalk(raw.walk), walkClip = WK.clip, NATIVE = WK.native;
  const DR = addWalk('drunk') ? prepWalk(addWalk('drunk')) : null, NATIVE_D = DR ? DR.native : NATIVE;
  // drunk: the director's need 'drunk' (0–100, sent in world.state) at DRUNK_ON or more; ?drunk=1 / 0 forces it for a review
  const DRUNK_ON = 40; let drunkSt = null;
  const drunkNow = (now) => extra.drunk != null ? extra.drunk : !!drunkSt && drunkSt.v + drunkSt.rate * Math.max(0, (now - drunkSt.at) / 60000) >= DRUNK_ON;
  const natNow = () => NATIVE + (NATIVE_D - NATIVE) * (DR ? ch.dk || 0 : 0);
  const CL = {};
  for (const [n, c] of Object.entries(raw)) if (n !== 'walk') CL[n] = stripClip(n, c, (n === 'stand_idle' || n === 'sit_idle') ? 'first' : 'traj');
  for (const [n, c] of Object.entries(CL)) { if (!/_stand_/.test(n)) continue; c.cutGo = c.cutUp;
    const tk = chairTracks[n.replace('desk_stand_', 'SitChairTable_Trans_Stand_')];
    if (n.startsWith('desk_') && tk) { const t = tk.track.map((v) => v[1]), fin = t[t.length - 1]; let pk = 0; t.forEach((v, k) => { if (v > t[pk]) pk = k; });
      let e = pk; while (e < t.length - 1 && t[e] > fin + 0.005) e++; c.cutGo = Math.max(c.cutUp, e / FPS + 0.6); }
    const k = Math.round(c.cutGo * FPS), a = c.traj[Math.max(0, k - 3)], b = c.traj[Math.min(c.traj.length - 1, k + 3)]; c.vGo = dist(a, b) / 6 * FPS; }
  const seatBase = CL.sit_idle.traj[0];                                   // seated ground frame of the pack (desk frame at its origin)
  { const y = (c) => { const a = smix.clipAction(c); smix.stopAllAction(); a.reset().play(); smix.setTime(0.5); sg.updateMatrixWorld(true); const v = sam.pelvis.getWorldPosition(new THREE.Vector3()).y; a.stop(); return v; };
    const up = y(CL.stand_idle.clip), down = y(CL.sit_idle.clip);                  // world of the sample: pack metres × S; the person below is scaled by S the same way
    hemY = [up - 0.35 * (up - down), down + 0.1 * (up - down)]; }                  // the shape comes in over the lower 55 % of the way down
  // typing (MC Seated SitChairTablePC_01_Type, clip from editor2A v13 as on the approved page): the actor sits 4.5 cm nearer the desk; the chair stays put
  const TYPE_KEYS = [8, 25, 30, 34, 38, 42, 46, 51, 56, 60, 65, 69, 73, 76, 81, 89, 93, 103].map((f) => (f - 1) / FPS);   // fingertip strikes (type-contacts.json)
  if (extra.typeClip) CL.type = stripClip('type', extra.typeClip, seatBase);
  // coffee (director's activity 'coffee', seated at a desk): a mug stands on every desk, sips of the approved DrinkR clip
  const coffee = SH.coffee;
  // small gestures in the pauses (add-on editor2A-gestures-web-v01.glb): seated ones in the seat frame, standing ones in place
  const GEST = {};
  if (extra.gestures) for (const c of extra.gestures.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, G_SEATED.has(c.name) ? seatBase : 'first'); } catch (e) { console.warn('gesture', c.name, e); } }
  // the phone (add-on editor2A-phone-web-v01.glb): seated clips in the seat frame, the standing ones (stand_*) in place
  if (extra.phoneClips) for (const c of extra.phoneClips.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, /^stand_/.test(c.name) ? 'first' : seatBase); } catch (e) { console.warn('phone clip', c.name, e); } }
  const phones = extra.phones || null;
  if (coffee) CL.drink = stripClip('drink', coffee.bodyClip, seatBase);

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

  // ---------- desk chairs and walking: shared by everybody (office-shared.js); the others' places are boxes to walk around
  const chairs = SH.chairs, nav = SH.nav, setChair = SH.setChair, CR = SH.crowd || null;   // CR: walking together (crowd.js), null — his own paths
  const syncBoxes = () => SH.syncFor(ID);
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
  layer('walk', walkClip); if (DR) layer('walk_drunk', DR.clip); layer('stand_idle', CL.stand_idle.clip); layer('sit_idle', CL.sit_idle.clip); if (CL.type) layer('type', CL.type.clip);
  for (const n of Object.keys(CL)) if (n.startsWith('desk_') || n.startsWith('booth_')) layer(n, CL[n].clip, false);
  if (CL.drink) { layer('drink', CL.drink.clip, false); A.drink.paused = true; }
  // lunch (director's activity 'lunch', on the bench at the common table): the approved eating page, one dish per decision
  let lunch = null;
  if (extra.lunch) {
    try { const out = {}; lunch = createLunch({ root, B: Bn, addon: extra.lunch, strip: stripClip, seatBase, S, clipsOut: out }); scene.add(lunch.group);
      const sb = seatBase, ci = Math.cos(sb.th), si = Math.sin(sb.th), invSB = P(-(sb.x * ci - sb.z * si), -(sb.x * si + sb.z * ci), -sb.th);
      lunch.frameOf = (T) => comp(T, invSB);
      lunch.probeGrab(mixer, () => lunch.frameOf(holderPose()));
      for (const [n, c] of Object.entries(out)) { layer('L0:' + n, c, false); layer('L1:' + n, c.clone(), false); A['L0:' + n].paused = A['L1:' + n].paused = true; } }
    catch (e) { console.warn('lunch unavailable:', e); lunch = null; }
  }
  for (const n in GEST) { layer('g_' + n, GEST[n].clip, false); A['g_' + n].paused = true; }
  function fadeTo(name, t = FADE) { for (const k in W) W[k].target = k === name ? 1 : 0; W[name].rate = 1 / t; }
  function stepWeights(dt) { let sum = 0; for (const k in W) { const w = W[k]; w.cur += Math.sign(w.target - w.cur) * Math.min(Math.abs(w.target - w.cur), dt * (w.rate || 3)); sum += w.cur; }
    for (const k in W) A[k].setEffectiveWeight(sum > 0 ? W[k].cur / sum : 0); }
  function snapWeights() { for (const k in W) W[k].cur = W[k].target; stepWeights(0); }

  // ---------- smoking (director's activity 'smoke'): standing at a spot, or seated at a desk
  let smoking = null;
  const deskFrame = {};
  for (const [k, D] of Object.entries(DESKS)) { const M = new THREE.Matrix4().makeRotationY(D.th).setPosition(D.x, 0, D.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
    deskFrame[k] = { inv: M.clone().invert(), dir: new THREE.Matrix3().setFromMatrix4(M) }; }
  // the long table in front of the bench (office v30c: top 1.185, near edge x −1.311 — moved 0.13 toward the bench for lunch; v29c was −1.18), as a pack table
  // frame facing +x: its near edge 0.14 m ahead of the frame, like the desks — the same "keep the hands off the top" works there
  const benchFrame = (() => { const M = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-1.311 - 0.14 * S, 0, 2.05).multiply(new THREE.Matrix4().makeScale(S, S, S));
    return { inv: M.clone().invert(), dir: new THREE.Matrix3().setFromMatrix4(M) }; })();
  if (extra.smoke) {
    try { smoking = createSmoking({ scene, root, B: Bn, mixer, U: S, addon: extra.smoke, strip: stripClip, camera: extra.camera, renderer: extra.renderer });
      smoking.setSitBase(CL.sit_idle.clip); }
    catch (e) { console.warn('smoking unavailable:', e); smoking = null; }
  }
  // «курит и пьёт кофе» (smoke_coffee, approved «Курилка» v8): the left hand drinks from a mug on the left while the right one holds the cigarette
  const mugL = SH.mugL; let mugOffset = () => new THREE.Vector3(), handFix = () => null;
  if (smoking && SH.drinkL) {
    try { const dc = SH.drinkL.clip, nodeOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName, slot = SH.drinkL.slot;
      const body = stripClip('drink_l', new THREE.AnimationClip('drink_l', dc.duration, dc.tracks.filter((t) => nodeOf(t) !== slot.name)), seatBase).clip;
      const armR = new Set(), armL = new Set(); Bn.clavicle_r.traverse((o) => { if (o.isBone) armR.add(o.name); }); Bn.clavicle_l.traverse((o) => { if (o.isBone) armL.add(o.name); });
      const upper = new Set(); Bn.spine_01.traverse((o) => { if (o.isBone && !armR.has(o.name) && !armL.has(o.name)) upper.add(o.name); });
      const part = (c, keep, sfx) => new THREE.AnimationClip('drink_l' + sfx, c.duration, c.tracks.filter((t) => keep(nodeOf(t))).map((t) => t.clone()));
      // DrinkL is the mirror of the whole DrinkR body: hips 2.4 cm and feet 6 cm to the other side, 5° of turn. Taken whole, at every sip the
      // hips and legs jumped sideways — to the eye the chair moved (owner 29.09). Now the hips and legs stay in the seated idle; the sip adds
      // only the bend of the spine, neck and head (additive, from its own first frame), the left arm is the sip's own
      const up = part(body, (b) => upper.has(b), '_up'); THREE.AnimationUtils.makeClipAdditive(up, 0);
      smoking.setDrinkL(up, part(body, (b) => armL.has(b), '_L'));
      const mugClip = SH.drinkL.mugClip;
      // the hand now moves a few cm off the baked mug path (the chest sits where the idle's does): measured once on the scratch skeleton —
      // hand (idle hips + the sip) minus hand (the sip whole), per frame, in pack units; the mug follows that difference while it is in the hand
      const handOn = (acts) => { smix.stopAllAction(); for (const [c, t, add] of acts) { const a = smix.clipAction(c); a.blendMode = add ? THREE.AdditiveAnimationBlendMode : THREE.NormalAnimationBlendMode; a.reset().play(); a.time = t; a.setEffectiveWeight(1); }
        smix.update(0); sg.updateMatrixWorld(true); return sclone.getObjectByName('hand_l').getWorldPosition(new THREE.Vector3()); };
      const rawBody = new THREE.AnimationClip('dl_raw', dc.duration, dc.tracks.filter((t) => nodeOf(t) !== slot.name)), rawUp = part(rawBody, (b) => upper.has(b), '_rawUp'); THREE.AnimationUtils.makeClipAdditive(rawUp, 0);
      const rawL = part(rawBody, (b) => armL.has(b), '_rawL'), rawSit = part(raw.sit_idle, (b) => !armL.has(b), '_rawSit');
      const NF = Math.round(dc.duration * FPS) + 1, dH = [];
      for (let f = 0; f < NF; f++) { const t = Math.min(f / FPS, dc.duration - 1e-4);
        dH.push(handOn([[rawSit, 0], [rawUp, t, true], [rawL, t]]).sub(handOn([[rawBody, t]])).multiplyScalar(1 / S)); }
      smix.stopAllAction(); [rawBody, rawUp, rawL, rawSit].forEach((c) => smix.uncacheClip(c));
      // grab and release: where the baked mug starts and stops moving
      const mp = (() => { const probe = slot.clone(true), pm = new THREE.AnimationMixer(probe), pa = pm.clipAction(mugClip); pa.play();   // the mug's centre in the table frame
        return (t) => { pa.time = Math.min(t, dc.duration - 1e-4); pm.update(0); probe.updateMatrixWorld(true); return new THREE.Box3().setFromObject(probe).getCenter(new THREE.Vector3()); }; })();
      const p0 = mp(0), p1 = mp(dc.duration); let fG = 0, fR = NF - 1;
      while (fG < NF - 1 && mp(fG / FPS).distanceTo(p0) < 1e-3) fG++; while (fR > 0 && mp(fR / FPS).distanceTo(p1) < 1e-3) fR--; fG = Math.max(0, fG - 1); fR = Math.min(NF - 1, fR + 1);
      const dAt = (f) => { const i = Math.max(0, Math.min(NF - 1, Math.floor(f))), j = Math.min(NF - 1, i + 1), k = f - Math.floor(f); return dH[i].clone().lerp(dH[j], Math.max(0, Math.min(1, k))); };
      // the mug never moves on the table by itself (owner 30.09): it is always put down where it was picked up. The baked put-down spot
      // is C away from the pick-up spot, so over the last 20 frames before letting go the left hand carries the mug C further (IK),
      // and after letting go the hand eases back in 0.3 s
      const C = p0.clone().add(dH[fG]).sub(p1.clone().add(dH[fR])), PUT = 20;
      const wPut = (f) => (f <= fR ? smooth((f - (fR - PUT)) / PUT) : 1 - smooth((f - fR) / 9));
      mugOffset = (t) => { const f = t * FPS; if (f < fG) return dH[fG].clone(); if (f > fR) return dH[fR].clone().add(C); return dAt(f).addScaledVector(C, smooth((f - (fR - PUT)) / PUT)); };
      handFix = (t) => { const f = t * FPS; return f < fG || f > fR + 9 ? null : C.clone().multiplyScalar(wPut(f)); };
      for (const k in mugL) mugL[k].off.position.copy(mugOffset(0));   // the mugs themselves are shared (office-shared.js); here only where each one stands
    } catch (e) { console.warn('coffee with a cigarette unavailable:', e); }
  }
  const smokeWant = () => {
    const act = cur?.activity; if (act !== 'smoke' && act !== 'smoke_coffee') return null;
    if (ch.mode === 'seated' && ch.seat) { const d = SEATS[ch.seat].desk;                      // at a desk, or on the bench (hands kept off its long table)
      return { mode: 'sit', desk: d ? deskFrame[d] : benchFrame, seq: cur.seq, drink: act === 'smoke_coffee' && !!d && !!mugL[d] }; }
    if (act === 'smoke' && ch.mode === 'idle' && !ch.seat) return { mode: 'stand', seq: cur.seq };
    return null;
  };
  const MOUTH = Array.isArray(extra.mouth) && extra.mouth.length === 3 && extra.mouth.every((x) => Number.isFinite(x) && Math.abs(x) < 10) ? new THREE.Vector3(...extra.mouth) : null;
  const mk = {}; root.traverse((o) => { const n = o.name.replace(/[^A-Za-z0-9]/g, '').toLowerCase(); if (n === 'smkmouth' || n === 'smkmouthfwd') mk[n] = o; });
  const mouth0 = MOUTH && mk.smkmouth ? new THREE.Object3D() : null;          // where the columnist's mouth would be: the baked sips aim there
  if (mouth0) { mouth0.name = 'face ref (columnist)'; mouth0.position.copy(mk.smkmouth.position); mk.smkmouth.parent.add(mouth0);
    for (const o of Object.values(mk)) o.position.add(MOUTH); }
  // hand IK on top of the mixer: put the arms back to the clean animated pose before each update (the mixer skips unchanged values)
  const ARMS = ['upperarm_r', 'lowerarm_r', 'hand_r', 'upperarm_l', 'lowerarm_l', 'hand_l', ...(extra.phones ? [...Object.keys(GRIP_L), 'neck_01', 'head'] : [])].map((n) => Bn[n]).filter(Boolean), armQ = ARMS.map((b) => b.quaternion.clone());
  const armRestore = () => ARMS.forEach((b, i) => b.quaternion.copy(armQ[i])), armSave = () => ARMS.forEach((b, i) => armQ[i].copy(b.quaternion));

  // ---------- behaviour (as the seating page v6)
  const tw = SH.typewriters || null;
  // activities that need a free desk: the typewriter on that desk is taken away (none of them is live yet)
  const FREE_DESK = new Set(['lunch', 'coffee', 'smoke_coffee', 'rest_desk']);   // resting: the desk is free for the gestures (papers, chin on the hand, dozing)
  let freeDesk = null, freeKind = null;
  const typing = () => !!(CL.type && ch.work && ch.seat && SEATS[ch.seat].desk);
  const seatedLoop = () => (typing() ? 'type' : 'sit_idle');
  // a sip: starts only while he is having coffee at a desk (by the coffee clock), once started it is drunk to the end
  const sipping = () => ch.sip !== null;
  const eating = () => !!lunch && lunch.active() && ch.seat === lunch.seat() && !lunch.done(ch.lunchT);
  const ch = { tAbs: 0, crowd: null, clk: 0, g: null, gKey: '', fatigue: 0, sip: null, coffeeT: 0, lunchT: 0, lunchSeq: -1, work: false, title: '', mode: 'idle', seat: null, speed: 0, vis: 0, err: 0, path: null, cursor: 0, after: null, trans: null, queue: null, chairTail: null, blendIn: 0, motion: 'стоит' };
  function command(goal) {
    syncBoxes();                                        // the others may have moved since: walk around where they are now
    if (ch.mode === 'trans' || ch.mode === 'settle') { ch.queue = goal; return; }
    if (ch.mode === 'seated' && ch.g) { ch.queue = goal; ch.mode = 'settle'; ch.g = gWrap(ch.g, ch.clk - ch.g.t0); ch.motion = 'сидит'; return; }   // lifts his head first
    if (ch.mode === 'idle' && ch.g?.phone) { ch.queue = goal; if (!ch.g.wrapped) { ch.g = { ...gWrap(ch.g, ch.clk - ch.g.t0), wrapped: true }; } ch.hold = true; return; }   // standing: puts the handset back first
    if (ch.seat) {
      if (goal.seat === ch.seat) return;
      if (ch.mode === 'seated' && sipping()) { ch.queue = goal; ch.mode = 'settle'; ch.motion = 'допивает'; return; }
      if (ch.mode === 'seated' && eating()) { ch.queue = goal; ch.mode = 'settle'; ch.motion = 'доедает'; return; }
      if (ch.mode === 'seated' && W.type && W.type.cur > 0.05) { ch.queue = goal; ch.mode = 'settle'; fadeTo('sit_idle', 0.6); W.type.rate = 1 / 0.6; ch.motion = 'откладывает работу'; return; }
      const opts = exitOptions(ch.seat, goal), pick = opts.filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0] || opts[0];
      ch.queue = goal; startTrans(pick.clip, pick.anc, 'stand'); ch.motion = 'встаёт'; return;
    }
    goTo(goal);
  }
  function crowdGo(to, tail, v0) {                     // walking together: the crowd takes him to `to`, then `tail` is walked by the code below
    const here = holderPose(), req = CR ? CR.start(ID, ch.tAbs, here, to, natNow(), v0) : null; if (!req) return false;
    ch.crowd = { req, tail, t0: ch.tAbs, off: P(here.x - req.from.x, here.z - req.from.z) };
    ch.path = null; ch.cursor = 0; ch.mode = 'walk'; ch.motion = 'идёт'; return true;
  }
  function goTo(goal, v0 = 0) {
    const here = holderPose(); ch.crowd = null;
    if (goal.seat) {
      const pick = entryOptions(goal.seat, here).filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) { ch.motion = 'не может подойти'; return; }
      if (crowdGo(pick.P0, [P(pick.P0.x, pick.P0.z), P(pick.E.x, pick.E.z)], v0)) { ch.after = { type: 'sit', seat: goal.seat, opt: pick }; return; }
      ch.path = [...pick.pts, P(pick.E.x, pick.E.z)]; ch.cursor = 0; ch.after = { type: 'sit', seat: goal.seat, opt: pick }; ch.mode = 'walk'; ch.motion = 'идёт';
    } else {
      if (crowdGo(goal.point, [P(goal.point.x, goal.point.z)], v0)) { ch.after = { type: 'stand', face: goal.point.th }; return; }
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
    if (desk && chairs[desk]) { chairs[desk].plan = kind === 'sit' ? BACK : CHAIR_TUCKED; syncBoxes(); }
    ch.chairTail = null; ch.mode = 'trans'; fadeTo(clipName, 0.25);
  }
  function updateChair(tr) {
    if (!tr.desk || !chairs[tr.desk]) return;
    const name = tr.clip.replace('desk_sit_', 'Stand_Trans_SitChairTable_').replace('desk_stand_', 'SitChairTable_Trans_Stand_'), track = chairTracks[name];
    if (!track) return;
    const i = Math.min(track.track.length - 1, Math.max(0, Math.floor(tr.t * FPS)));
    let dy = track.track[i][1] + BACK * (tr.kind === 'sit' ? 1 : 1 - smooth(tr.t / tr.c.clip.duration));   // his own chair offset: all the way while he sits
    if (tr.kind === 'sit' && tr.chairFrom !== null && Math.abs(tr.chairFrom - track.track[0][1] - BACK) > 1e-3) {   // chair left where it was: ease into the track by the time the hand pulls it
      if (track.peak === undefined) { let m = 0; track.track.forEach((v, k) => { if (v[1] > track.track[m][1]) m = k; }); track.peak = Math.max(1, m) / FPS; }
      dy += (tr.chairFrom - track.track[0][1] - BACK) * (1 - smooth(tr.t / track.peak));
    }
    setChair(tr.desk, dy);
  }
  function updateChar(dt) {
    // settle: hands go back from the keys to the desk, then he may stand up
    if (ch.mode === 'settle') { if ((!W.type || W.type.cur <= 0.02) && !sipping() && !eating() && !ch.g) { ch.mode = 'seated'; const q = ch.queue; ch.queue = null; if (q) command(q); } }
    if (ch.mode === 'seated' && W.type) {                              // switch between typing and resting without standing up
      const want = seatedLoop();
      if (W[want].target < 1) { if (want === 'type') { A.type.reset(); A.type.play(); } fadeTo(want, 0.9); }
      ch.motion = want === 'type' ? 'печатает' : 'сидит';
    }
    if (lunch) {
      const bench = ch.seat && ch.seat.startsWith('bench') ? ch.seat : (ch.mode === 'trans' && ch.trans.kind === 'sit' && ch.trans.seatId.startsWith('bench') ? ch.trans.seatId : null);
      if (bench && ch.activity === 'lunch' && (!lunch.active() || lunch.seat() !== bench)) { lunch.begin(DISHES[((cur?.seq ?? 0) % DISHES.length + DISHES.length) % DISHES.length], lunch.frameOf(SEATS[bench].pose), bench); ch.lunchT = 0; }
      if (lunch.active() && !(ch.seat === lunch.seat() || (ch.mode === 'trans' && (ch.trans.seatId === lunch.seat() || ch.trans.kind === 'stand')))) lunch.end();   // walked away: the table is cleared
      if (lunch.active() && ch.seat === lunch.seat() && (ch.mode === 'seated' || ch.mode === 'settle')) {
        ch.lunchT += dt;
        const m = lunch.mix(ch.lunchT);
        let idleW = 0; for (const k in W) if (k.startsWith('L')) W[k].target = W[k].cur = 0;
        for (const e of m) { if (!e.n) { idleW += e.w; continue; } const k = 'L' + (e.i % 2) + ':' + e.n; if (!W[k]) continue; W[k].target = W[k].cur = e.w; A[k].time = e.lt; }
        if (m.some((e) => e.n && e.w > 0)) { for (const k in W) if (!k.startsWith('L')) W[k].target = W[k].cur = 0; W.sit_idle.target = W.sit_idle.cur = idleW; ch.motion = 'ест ' + DISH_NAME[lunch.dish()]; }
      } else for (const k in W) if (k.startsWith('L') && W[k].cur > 0) W[k].target = W[k].cur = 0;
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
      if (FREE_DESK.has(ch.activity) && !(ch.activity === 'rest_desk' && W.type && W.type.cur > 0.05)) { freeDesk = ch.goalDesk || freeDesk; freeKind = ch.activity; }   // hidden as soon as he sets off towards that desk (resting: once the hands are off the keys)
      else if (freeDesk && ch.activity === 'work') freeDesk = null;                              // back to work at the same desk: the machine is back
      else if (freeDesk && !(ch.seat && SEATS[ch.seat].desk === freeDesk) && ch.mode !== 'settle') freeDesk = null;   // back once he has got up and left
    }
    SH.claim(ID, freeDesk, freeKind);                                   // the page puts the machines and mugs of all desks right after everybody moved
    if (ch.chairTail) { const tr = ch.chairTail; tr.t += dt; updateChair(tr); if (tr.t > tr.c.clip.duration) ch.chairTail = null; }
    if (ch.mode === 'walk' && ch.crowd) {                                // walking together: pose from the crowd at his time
      const c = ch.crowd, s = CR.pose(ID, ch.tAbs), mine = !!s && s.seg === c.req, nat = natNow(), k = 1 - smooth((ch.tAbs - c.t0) / 0.5);
      const bx = mine ? s.x : c.req.from.x, bz = mine ? s.z : c.req.from.z, vx = mine ? s.vx : 0, vz = mine ? s.vz : 0, sp = Math.hypot(vx, vz);
      holder.position.x = bx + c.off.x * k; holder.position.z = bz + c.off.z * k; ch.speed = sp; ch.vis = sp; ch.err = 0;
      { const route = mine && (s.dx || s.dz) ? Math.atan2(s.dx, s.dz) : null, vel = sp > 0.05 ? Math.atan2(vx, vz) : null, wv = smooth((sp / nat - 0.3) / 0.4);
        const want = route !== null && vel !== null ? route + wrap(vel - route) * wv : vel ?? route;     // slow: along the route, not where the crowd pushes him
        if (want !== null) { const d = wrap(want - holder.rotation.y), max = deg(Math.abs(d) > 0.8 ? 300 : 150) * dt; holder.rotation.y = wrap(holder.rotation.y + THREE.MathUtils.clamp(d, -max, max)); } }
      if (!s || (mine && s.done)) {                                     // the approach point: the last metre is ours
        const here = holderPose(); let pts = [here, ...c.tail];
        if (!s || s.stalled) { const alt = path(here, c.tail[0]); if (alt) pts = [...alt, ...c.tail.slice(1)]; }
        ch.path = pts; ch.cursor = 0; ch.crowd = null;
      }
    }
    if (ch.mode === 'walk' && !ch.crowd) {
      const pts = ch.path; let rest = 0; const p = holderPose();
      for (let i = ch.cursor + 1; i < pts.length; i++) rest += dist(i === ch.cursor + 1 ? p : pts[i - 1], pts[i]);
      const acc = 3.2; ch.speed = Math.min(natNow(), ch.speed + acc * dt, Math.sqrt(2 * acc * Math.max(0, rest)) + 0.02);
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
          if (tr.desk) setChair(tr.desk, BACK); const q = ch.queue; ch.queue = null; if (q) command(q); }
        else { ch.seat = null; ch.mode = 'idle'; fadeTo('stand_idle'); ch.motion = 'стоит'; const q = ch.queue; if (tr.desk) ch.chairTail = tr; ch.queue = null;
          if (q) { goTo(q, THREE.MathUtils.clamp(tr.c.vGo, 0.6, 1.4)); if (ch.mode === 'walk') { ch.speed = THREE.MathUtils.clamp(tr.c.vGo, 0.6, 1.4); ch.blendIn = 0.45; } } }
      }
    }
    if (ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'idle') {
      // walking: the weight follows the intended speed, not the progress along the path — while he turns sharply (just up from a chair,
      // the goal behind him) he keeps stepping round instead of dropping into the standing pose first; the cadence follows what he really covers
      const v = ch.mode === 'walk' ? Math.max(ch.vis, 0.6 * ch.speed) : ch.speed, wW = smooth(((ch.mode === 'walk' ? ch.speed : v) / natNow() - 0.06) / 0.25), dk = DR ? ch.dk || 0 : 0;
      W.walk.target = wW * (1 - dk); if (DR) W.walk_drunk.target = wW * dk; W.stand_idle.target = 1 - wW;
      for (const k in W) if (k !== 'walk' && k !== 'walk_drunk' && k !== 'stand_idle') W[k].target = 0;
      ch.blendIn = Math.max(0, ch.blendIn - dt); W.walk.rate = W.stand_idle.rate = ch.blendIn > 0 ? 3 : 6; A.walk.timeScale = Math.max(ch.crowd ? 0.3 : 0.6, v / NATIVE);
      if (DR) { W.walk_drunk.rate = W.walk.rate; A.walk_drunk.timeScale = Math.max(0.6, v / NATIVE_D); }
    }
    gestures();
  }
  // ---------- small gestures in the pauses: only while he just sits or just stands (gestures.js keeps the schedule)
  const G_BUSY = new Set(['work', 'coffee', 'smoke', 'smoke_coffee', 'lunch', 'phone', 'invite']);
  const G_LABEL = { sit_lookat: 'оглядывается', sit_papers: 'просматривает бумаги', sit_lean: 'облокотился на стол', sit_doze: 'дремлет', stand_look: 'оглядывается',
    stand_watch: 'смотрит на часы', stand_yawn: 'зевает', stand_scratch: 'чешет затылок', stand_neck: 'разминает шею' };
  const gDur = (n) => GEST[n] && GEST[n].clip.duration;
  // ---------- the phone: the owner's calls ring on desk A (the editor's phone); whoever is there answers — seated if he sits at
  // that desk, otherwise standing next to it (the director sends him to the spot 'phoneA'). Clock: time since the decision.
  const PHONE_DESK = 'A', RING_MIN = 1.5;
  let ringing = false;
  function phoneCall() {
    const want = !!phones && ch.activity === 'phone';
    if (ch.g?.phone && !want && !ch.g.wrapped) { ch.g = { ...gWrap(ch.g, ch.clk - ch.g.t0), wrapped: true }; }   // the call is over: hang up
    ringing = want && !ch.g?.phone;
    if (phones) phones.ring(PHONE_DESK, ringing ? ch.clk : -1);
    if (!want || ch.g || ch.clk < RING_MIN) return;
    const atDesk = ch.mode === 'seated' && ch.seat && SEATS[ch.seat].desk === PHONE_DESK && (!W.type || W.type.cur < 0.05) && !sipping() && !eating() && !smoking?.active();
    const P = SPOTS.phoneA, hp = holderPose();
    const standing = ch.mode === 'idle' && !ch.seat && ch.speed === 0 && P && Math.hypot(hp.x - P.x, hp.z - P.z) < 0.35;
    if (atDesk || standing) ch.g = phonePlan(atDesk ? 'desk' : 'stand', ch.clk, gDur);
  }
  // after the mixer: the left hand (the nearest one) takes the handset from the cradle and puts it back (two-bone IK on a hump, the start and stop
  // clips' pocket reach turned into a reach to the cradle), the handset goes from the cradle to the ear and back
  const hump = (f, a, b, c, d) => (f < a || f > d ? 0 : f < b ? smooth((f - a) / (b - a)) : f <= c ? 1 : 1 - smooth((f - c) / (d - c)));
  const EAR_H = new THREE.Vector3(4.5, 0.5, 7.5), MOUTH_H = new THREE.Vector3(0.5, -16.5, 0);   // head bone frame (cm): an ear, a point 3-4 cm in front of the mouth
  let earSide = 0;
  const LOOK = 0.6;                                   // how far towards the phone he turns his head (0..1 of the full turn)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _qh = new THREE.Quaternion();
  function rotateWorld(bone, q) { const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()), wq = bone.getWorldQuaternion(new THREE.Quaternion()); bone.quaternion.copy(pq.invert().multiply(q.multiply(wq))); bone.updateMatrixWorld(true); }
  function reach(target, w, side = 'r') {              // a hand towards target (world), weight w; the hand keeps its world orientation
    if (w <= 0) return;
    const U = Bn['upperarm_' + side], L = Bn['lowerarm_' + side], H = Bn['hand_' + side]; H.getWorldQuaternion(_qh);
    U.getWorldPosition(_a); L.getWorldPosition(_b); H.getWorldPosition(_c); _t.copy(_c).lerp(target, w);
    const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c), lat = THREE.MathUtils.clamp(_a.distanceTo(_t), 1e-4, lab + lcb - 1e-4);
    const cl = (x) => Math.min(1, Math.max(-1, x));
    const ab0 = Math.acos(cl(_c.clone().sub(_a).normalize().dot(_b.clone().sub(_a).normalize()))), bc0 = Math.acos(cl(_a.clone().sub(_b).normalize().dot(_c.clone().sub(_b).normalize())));
    const ab1 = Math.acos(cl((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat))), bc1 = Math.acos(cl((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));
    const axis = _c.clone().sub(_a).cross(_b.clone().sub(_a)).normalize(); if (axis.lengthSq() < 1e-8) return;
    rotateWorld(U, new THREE.Quaternion().setFromAxisAngle(axis, ab1 - ab0)); rotateWorld(L, new THREE.Quaternion().setFromAxisAngle(axis, bc1 - bc0));
    U.getWorldPosition(_a); H.getWorldPosition(_c);
    rotateWorld(U, new THREE.Quaternion().setFromUnitVectors(_c.clone().sub(_a).normalize(), _t.clone().sub(_a).normalize()));
    const pq = H.parent.getWorldQuaternion(new THREE.Quaternion()); H.quaternion.copy(pq.invert().multiply(_qh)); H.updateMatrixWorld(true);
  }
  function phonePost() {
    if (!phones) return;
    const g = ch.g && ch.g.phone ? ch.g : null;
    if (!g) { phones.hold(PHONE_DESK, 0); return; }
    const u = ch.clk - g.t0, fr = (re) => { const a = g.segs.find((x) => re.test(x.n) && u >= x.s && u < x.s + x.d); return a ? (u - a.s + (a.o || 0)) * FPS + 1 : null; };
    const st = g.segs.find((x) => /phone_start$/.test(x.n)), sp = g.segs.find((x) => /phone_stop$/.test(x.n));
    const fs = fr(/phone_start$/), fe = fr(/phone_stop$/);
    let w = 0, p = 0;
    if (fs !== null) { w = st.o ? hump(fs, 9, 20, 30, 40) : hump(fs, 12, 22, 30, 40); p = fs < 26 ? 0 : smooth((fs - 26) / 44); }   // entered late: the hand leaves the desk at once
    else if (fe !== null) { w = hump(fe, 20, 28, 36, 44); p = fe >= 32 ? 0 : 1 - smooth((fe - 10) / 22); }
    else if (st && u >= st.s + st.d && (!sp || u < sp.s)) p = 1;
    if (p > 0) w = 1;                                   // while the handset is off the cradle it is in his hand
    const env = gSample(g, u).e; w *= env;
    holder.updateMatrixWorld(true);
    const head = Bn.head; head.updateMatrixWorld(true);
    // he glances at the phone while he reaches for the handset and while he puts it back (neck and head, a partial turn)
    const wl = LOOK * env * (fs !== null ? hump(fs, 5, 14, 30, 50) : fe !== null ? hump(fe, 6, 16, 34, 50) : 0);
    if (wl > 0) { const T = phones.grip(PHONE_DESK);
      for (const [b, k] of [[Bn.neck_01, 0.4], [head, 1]]) { if (!b) continue; b.updateMatrixWorld(true);
        const hp = head.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, -1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(f, T.clone().sub(hp).normalize());
        rotateWorld(b, new THREE.Quaternion().slerp(q, wl * k)); }
      head.updateMatrixWorld(true); }
    if (!earSide) { const hp = head.getWorldPosition(new THREE.Vector3()), T = holderPose(), right = new THREE.Vector3(-Math.cos(T.th), 0, Math.sin(T.th));
      earSide = EAR_H.clone().applyMatrix4(head.matrixWorld).sub(hp).dot(right) > 0 ? 1 : -1; }
    const E = new THREE.Vector3(EAR_H.x, EAR_H.y, -EAR_H.z * earSide).applyMatrix4(head.matrixWorld), Mo = MOUTH_H.clone().applyMatrix4(head.matrixWorld);   // the left ear
    const R = E.clone().sub(new THREE.Vector3(EAR_H.x, EAR_H.y, 0).applyMatrix4(head.matrixWorld)).normalize();
    phones.hold(PHONE_DESK, p, E, Mo, R);
    if (w > 0) {                                        // the nearest hand (the phone stands on the left): the palm goes to the handset's grip,
      const H = Bn.hand_l, K = Bn.middle_01_l || H, I = Bn.index_01_l, P = Bn.pinky_01_l, G = phones.grip(PHONE_DESK), F = phones.frame(PHONE_DESK);
      // the hand is fixed on the handset (as a hand holds a thing): the palm onto its outer side (−Y), the knuckles along it with the
      // index at the ear cup, the fingers round it (−Z) — on the cradle palm down, fingers away from him; at the ear palm to the cheek, fingers forward
      const kT = F.X.clone().negate(), nT = F.Y.clone().negate(), fT = new THREE.Vector3().crossVectors(nT, kT);
      const Bt = new THREE.Matrix4().makeBasis(kT, fT, nT);
      for (let it = 0; it < 2; it++) {
        if (I && P) { const wr = H.getWorldPosition(new THREE.Vector3()), k = P.getWorldPosition(new THREE.Vector3()).sub(I.getWorldPosition(new THREE.Vector3())).normalize();
          const f = K.getWorldPosition(new THREE.Vector3()).sub(wr); f.addScaledVector(k, -f.dot(k)).normalize(); const n = new THREE.Vector3().crossVectors(k, f).normalize();   // the left palm's normal
          const Bc = new THREE.Matrix4().makeBasis(k, new THREE.Vector3().crossVectors(n, k), n);
          const q = new THREE.Quaternion().setFromRotationMatrix(Bt.clone().multiply(Bc.clone().transpose())).slerp(new THREE.Quaternion(), 1 - w);
          rotateWorld(H, q); }
        const wr = H.getWorldPosition(new THREE.Vector3()), palm = wr.clone().lerp(K.getWorldPosition(new THREE.Vector3()), 0.75);
        reach(G.clone().sub(palm.sub(wr)), w, 'l'); }
      for (const n in GRIP_L) { const b = Bn[n]; if (b) b.quaternion.slerp(_qg.fromArray(GRIP_L[n]), w); }   // the fingers close round it as round a cup handle
      Bn.hand_l.updateMatrixWorld(true); }
  }
  // a baked sip goes to the columnist's mouth: near the mouth the mug and the hand holding it are moved to his own (full within 8 cm, none beyond 20)
  const _m0 = new THREE.Vector3(), _m1 = new THREE.Vector3(), _mp = new THREE.Vector3(), _box = new THREE.Box3();
  function nudgeOne(slot, side) {
    const u = slot.userData;
    if (u.nudged && u.lastPos && slot.position.distanceToSquared(u.lastPos) < 1e-12) slot.position.copy(u.basePos);   // our last move is still there: back to the baked place
    u.basePos = slot.position.clone(); u.nudged = false; slot.updateMatrixWorld(true); _box.setFromObject(slot).getCenter(_mp);   // the mug itself, not its slot's origin
    const k = 1 - smooth((_mp.distanceTo(_m0) / S - 0.08) / 0.12); if (k <= 0) return;
    const off = _m1.clone().sub(_m0).multiplyScalar(k), H = Bn['hand_' + side];
    reach(H.getWorldPosition(new THREE.Vector3()).add(off), 1, side);
    const o0 = slot.getWorldPosition(new THREE.Vector3()); slot.position.copy(slot.parent.worldToLocal(o0.add(off))); u.lastPos = slot.position.clone(); u.nudged = true;
  }
  function nudgeSips() {
    const d = ch.mode === 'seated' && ch.seat && SEATS[ch.seat].desk; if (!d) return;
    holder.updateMatrixWorld(true); mouth0.getWorldPosition(_m0); mk.smkmouth.getWorldPosition(_m1);
    if (coffee && sipping()) { const g = coffee.groups.find((x) => x.name === 'COFFEE ' + d); if (g?.children[0]) nudgeOne(g.children[0], 'r'); }
    if (cur?.activity === 'smoke_coffee' && mugL[d]?.g.visible && mugL[d].g.children[0]) nudgeOne(mugL[d].g.children[0], 'l');
  }
  function gestures() {
    if (!Object.keys(GEST).length) return;
    phoneCall();
    const calmSeat = ch.mode === 'seated' && ch.seat && !typing() && !sipping() && !eating() && !smoking?.active() && !G_BUSY.has(ch.activity);
    const kind = calmSeat ? (SEATS[ch.seat].desk ? 'desk' : 'bench')
      : ch.mode === 'idle' && !ch.seat && ch.speed === 0 && !smoking?.active() && ch.activity !== 'smoke' ? 'stand' : null;
    if (ch.g && !ch.g.phone && !(kind === ch.g.kind || (ch.mode === 'settle' && ch.g.kind !== 'stand'))) ch.g = null;   // something else took over: let it fade out
    if (!ch.g && kind && cur) {
      const slot = Math.floor(ch.clk / G_POOLS[kind].P), key = kind + '|' + cur.seq + '|' + slot;
      if (key !== ch.gKey) { const g = gPlan(kind, cur.seq, slot, ch.fatigue, gDur);
        if (g && ch.clk >= g.t0 && ch.clk < g.t0 + 0.5) { ch.g = g; ch.gKey = key; } }
    }
    if (ch.g && ch.clk - ch.g.t0 >= ch.g.T) { ch.g = null; if (ch.hold) { ch.hold = false; const q = ch.queue; ch.queue = null; if (q) command(q); } }
    const base = ch.g && (ch.g.kind === 'stand' ? 'stand_idle' : 'sit_idle');
    const { e, w } = ch.g ? gSample(ch.g, ch.clk - ch.g.t0) : { e: 0, w: {} };
    for (const n in GEST) { const k = 'g_' + n, v = w[n];
      if (v) { W[k].target = W[k].cur = v[0]; A[k].time = v[1]; }
      else if (W[k].target > 0 || W[k].cur > 0) { W[k].target = 0; W[k].rate = 1 / 0.4; } }
    if (ch.g) { for (const k in W) if (!k.startsWith('g_') && k !== base) W[k].target = W[k].cur = 0;
      W[base].target = W[base].cur = 1 - e;
      const main = ch.g.segs.find((a) => !/_(start|stop)$/.test(a.n)) || ch.g.segs[0], lab = G_LABEL[main.n.replace(/_\d+$|_0\d$/, '')];
      if (lab && ch.mode !== 'settle') ch.motion = lab; if (ch.g.phone) ch.motion = 'говорит по телефону'; }
    else if (ringing) ch.motion = ch.mode === 'walk' ? 'идёт к телефону' : 'звонит телефон';
    else if (/телефон/.test(ch.motion) && (ch.mode === 'seated' || ch.mode === 'idle')) ch.motion = ch.mode === 'seated' ? 'сидит' : 'стоит';   // the call is over
  }

  // ---------- playing the director's commands
  const goalOf = (g) => (!g ? null : g.seat ? { seat: g.seat } : g.spot ? { point: SPOTS[g.spot] } : null);
  // Standing smoking: the Light clip starts 19 cm to the side of where Start ends, and Stop_end 13 cm back — at those cross-fades the
  // feet slid sideways on the floor (owner 30.09: «he comes to the window and then slides a few cm to the left»). The body is moved
  // under the holder by the opposite of these jumps so the feet stay put (measured on both people, holder units); the shift stays
  // while he stands and melts away in his first steps. A function of the smoking clock: late viewers get the same.
  const FEET_D1 = new THREE.Vector3(0.191, 0, 0.030), FEET_D2 = new THREE.Vector3(-0.134, 0, 0.008), feetO = new THREE.Vector3();
  function feetFrame(dt) {
    const b = smoking && smoking.blend();
    if (b && b.W > 0 && b.list.length && ch.mode === 'idle') {
      const w = Object.fromEntries(b.list), cur = b.list[0][0];
      let u1 = cur === 'smoke_start' ? 0 : cur === 'smoke_light' && w.smoke_start !== undefined ? w.smoke_light : 1;
      let u2 = cur !== 'smoke_stop_end' ? 0 : w.smoke_stop !== undefined ? w.smoke_stop_end : 1;
      if (cur === 'smoke_start' && w.smoke_stop_end !== undefined) { u1 = 0; u2 = w.smoke_stop_end; }   // the next cigarette (rare): back from Stop_end
      feetO.set(0, 0, 0).addScaledVector(FEET_D1, -u1).addScaledVector(FEET_D2, -u2);
    } else if (ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'trans') { const k = Math.max(0, 1 - dt / 0.6); feetO.multiplyScalar(feetO.lengthSq() < 1e-8 ? 0 : k); }
    body.position.copy(feetO);
  }
  function place(from, chairState, to) {
    feetO.set(0, 0, 0); body.position.set(0, 0, 0);
    ch.mode = 'idle'; ch.seat = null; ch.trans = null; ch.sip = null; ch.g = null; if (lunch) lunch.end(); ch.queue = null; ch.chairTail = null; ch.path = null; ch.after = null; ch.speed = 0; ch.vis = 0;
    for (const g of [from, to]) { const d = g?.seat && SEATS[g.seat]?.desk; if (d && chairs[d]) { const v = chairState?.[d] ?? CHAIR_REST; setChair(d, v); chairs[d].plan = v; } }
    if (from?.seat && SEATS[from.seat]) { const s = SEATS[from.seat]; setHolder(s.pose); ch.seat = from.seat; ch.mode = 'seated'; ch.motion = 'сидит'; fadeTo(seatedLoop()); if (s.desk) { setChair(s.desk, BACK); chairs[s.desk].plan = BACK; } }
    else { const p = (from?.spot && SPOTS[from.spot]) || SPOTS.window; setHolder(p); ch.motion = 'стоит'; fadeTo('stand_idle'); }
    syncBoxes(); snapWeights();
    if (CR) CR.stand(ID, from?.seat && SEATS[from.seat] ? null : holderPose());   // standing: an obstacle for the walkers; sitting: his chair or the bench already is
  }
  let cur = null, simT = 0;                          // current command and how far it has been played (s)
  const placeKey = (g) => (g ? g.seat || g.spot || null : null);
  function frame(dt, ff) {
    ch.clk += dt; ch.tAbs += dt; updateChar(dt); stepWeights(dt);
    if (smoking) smoking.pre(dt, smokeWant(), A);
    feetFrame(dt);
    { const d = ch.seat && SEATS[ch.seat].desk, M = d && mugL[d];                      // the left-hand mug follows the sip; before the first sip it stands at frame 1, after it at the last
      if (M && cur?.activity === 'smoke_coffee' && ch.mode === 'seated') { const s = smoking.sipTime(), t = s >= 0 ? s : smoking.sipsBefore(smoking.clockT()) > 0 ? M.D : 0;
        if (Math.abs(t - M.t) > 1e-6) { M.t = t; M.a.time = Math.min(t, M.D); M.m.update(0); M.off.position.copy(mugOffset(t)); } } }
    if (!ff) {
      const t0 = A.type ? A.type.time : 0;
      if (smoking || lunch || phones) armRestore();
      mixer.update(dt);
      if (smoking || lunch || phones) { holder.updateMatrixWorld(true); armSave(); } if (smoking) smoking.post(dt);
      { const d = ch.seat && SEATS[ch.seat].desk, M = d && mugL[d], st = smoking ? smoking.sipTime() : -1;      // the hand takes the mug back to where it stood
        const c = M && st >= 0 && cur?.activity === 'smoke_coffee' ? handFix(st) : null;
        if (c) smoking.ikL(c.applyMatrix3(new THREE.Matrix3().setFromMatrix4(M.g.matrix)).multiplyScalar(smoking.sipW())); }
      phonePost();
      if (extra.talk) extra.talk.post(ID, Bn, holder, typing() || eating() || sipping() || !!smoking?.active(), dt, ch.mode === 'walk' || ch.mode === 'turn');   // invitations: look at each other, nod / shake
      if (lunch && lunch.active()) lunch.post(ch.lunchT, dt);
      if (mouth0) nudgeSips();
      lidFrame(dt); hemFrame();
      if (A.type && tw && ch.seat && SEATS[ch.seat].desk && W.type.cur > 0.6) {     // a letter on every fingertip strike
        const t1 = A.type.time, d = CL.type.clip.duration;
        for (const k of TYPE_KEYS) if ((t1 >= t0 && k > t0 && k <= t1) || (t1 < t0 && (k > t0 || k <= t1))) tw.key(SEATS[ch.seat].desk);
      }
    }
  }
  function fastForward(sec) {                         // late join / hidden tab: replay the command at 30 steps a second, draw once
    const n = Math.min(Math.round(sec * FPS), 90 * FPS);       // any walk + sit is over within 90 s
    ch.clk = simT + sec - n / FPS;                              // the gestures' clock ends where a live viewer's is
    for (let i = 0; i < n; i++) frame(1 / FPS, true);
    simT += sec;
    if (ch.mode === 'trans') A[ch.trans.clip].time = ch.trans.t;
    snapWeights(); if (smoking) smoking.pre(0, smokeWant(), A); mixer.update(0); if (smoking || lunch || phones) { holder.updateMatrixWorld(true); armSave(); } holder.updateMatrixWorld(true); hemFrame();
  }
  function apply(w, serverNow) {                      // w = {seq, chars: {id: {seq, from, cmd, at, state, …}}, chairs} (or the old {seq, editor, state})
    const e = w?.chars?.[ID] || (ID === 'columnist' || ID === 'editor' ? w?.editor : null); if (!e) return;
    { const st = e.state || (w.chars ? null : w.state), dn = st?.needs?.drunk; if (dn && Number.isFinite(st.at)) drunkSt = { v: +dn.v || 0, rate: +dn.rate || 0, at: st.at }; else if (st) drunkSt = null; }   // his own needs
    const eseq = e.seq ?? w.seq; if (cur && cur.seq === eseq) return;
    SH.setStation(ID, (() => { const g = e.cmd || e.from; return g?.spot ? { spot: g.spot } : g?.seat && SEATS[g.seat] && !SEATS[g.seat].desk ? { bench: SEATS[g.seat].pose } : null; })());
    const elapsed = Math.max(0, (serverNow - e.at) / 1000);
    ch.work = e.activity ? e.activity === 'work' : /^(работает|правит)/.test(e.label || '');
    ch.title = (/«(.+)»/.exec(e.label || '') || [])[1] || '';
    ch.activity = e.activity || (ch.work ? 'work' : ''); ch.coffeeT = 0; ch.fatigue = +e.fatigue || 0;
    if (lunch?.active()) {                             // a dish in front of him is eaten to the end (a new decision waits); a finished one is cleared
      if (lunch.done(ch.lunchT)) { lunch.end(); ch.lunchT = 0; }
    } else ch.lunchT = 0;   // every decision starts its own coffee clock (live and late viewers alike)
    { const g = e.cmd?.seat || e.from?.seat; ch.goalDesk = g && SEATS[g] ? SEATS[g].desk : null; }
    // live viewer: he is already there (or on his way there) — go on from here; otherwise rebuild the start and catch up
    const dest = cur ? placeKey(cur.cmd || cur.from) : null;
    const cont = cur && dest === placeKey(e.from) && elapsed < 3;
    if (!(cont && ch.crowd)) ch.tAbs = e.at / 1000;     // his clock for the crowd: the command's time (the director's, the same for every viewer), then every frame
    if (!cont) place(e.from, w.chairs, e.cmd);
    if (ch.g) ch.g.t0 -= ch.clk; ch.clk = 0;             // a gesture already running goes on; the new decision's slots count from zero
    cur = { seq: eseq, at: e.at, from: e.from, cmd: e.cmd, label: e.label || '', source: e.source || '', activity: e.activity || '' }; simT = 0;
    const g = goalOf(e.cmd); if (g) command(g);
    if (!cont && elapsed > 0.05) fastForward(elapsed);
  }
  function update(dt, serverNow) {
    { const t = drunkNow(serverNow || Date.now()) ? 1 : 0; ch.dk = (ch.dk || 0) + THREE.MathUtils.clamp(t - (ch.dk || 0), -dt / 1.5, dt / 1.5); }   // sobering / getting drunk: 1.5 s blend
    if (cur && serverNow) { const lag = (serverNow - cur.at) / 1000 - simT; if (lag > 1.5) fastForward(lag); }
    frame(dt, false); simT += dt;
  }
  { const home = extra.home && SEATS[extra.home] ? extra.home : 'deskA'; ch.mode = 'idle'; setHolder(SEATS[home].pose); ch.seat = home; ch.mode = 'seated'; fadeTo('sit_idle'); snapWeights(); }   // until his first command comes
  return {
    id: ID, apply, update, holder, SEATS, nav, chairs, fx: smoking ? smoking.fx : null, root,
    mugs: [], lunchGroup: lunch ? lunch.group : null,
    moving: () => ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'trans' || !!ch.chairTail || !!smoking?.active() || sipping() || eating() || !!ch.g || ringing,
    status: () => ({ id: ID, activity: cur?.activity || '', label: cur?.label || '', motion: ch.motion, gesture: ch.g ? ch.g.segs.map((a) => a.n).join('+') : null, mode: ch.mode, seat: ch.seat, source: cur?.source || '', smoke: smoking ? smoking.status() : null, lunch: lunch ? { dish: lunch.dish(), seat: lunch.seat(), t: +ch.lunchT.toFixed(2) } : null, coffee: coffee ? { t: +ch.coffeeT.toFixed(2), sip: ch.sip === null ? null : +ch.sip.toFixed(2), w: W.drink ? +W.drink.cur.toFixed(2) : 0 } : null }),
    debug: { ch, CL, A, W, mixer, SEATS, comp, trajAt, setHolder, snapWeights, command: (g) => command(goalOf(g) || g), place, entryOptions, exitOptions, holderPose, NATIVE: () => NATIVE, smoking, lunch },
  };
}
