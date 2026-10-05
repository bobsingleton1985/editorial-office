import {createTrayController} from './heroine-tray.mjs';
import {createNativePerformanceWitness} from './native-performance-witness.mjs';
import {availableMeals,selectMeal} from './meal-repertoire.mjs';
import {editorRestPools} from './editor-rest-repertoire.mjs';
import {DESK_SLEEP,deskSleepAvailable,sleepPlan} from './sleep-playback.mjs';
import {benchPassageTags} from './conversation-places.mjs';
import { createTeletypeReading } from './teletype-reading.js';
import {turnPlan,finishTurnPlan,sampleTurnPlan} from './social-turns.js';
// editor2A in the office: walking, sitting down at desks A/B/C and on the lounge bench, standing up, the desk chair
// following the pack's chair track. Movement logic is the approved seating page v6, moved into the office layout.
// The page never decides anything itself: it plays commands that arrive from the director ({from, cmd, at}).
import * as THREE from 'three';
import { socialAlias } from './social-playback.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { S as ROOM_S, DESKS, DINING_CHAIR, diningChairAvoidanceBox, RADIUS, BENCH, SPOTS, CHAIR_REST, CHAIR_TUCKED, TV_KNOB } from './layout.js';
import { createSmoking } from './smoke.js';
import { SIP } from './coffee.js';
import { createLunch, DISHES, DISH_NAME } from './lunch.js';
import { bakedClip, barHolder } from './whisky.js';
import { createWriting } from './write.js';
import { jazzStart, jazzExtend, DANCE } from './jazz.js';
import { plan as gPlan, sample as gSample, wrapUp as gWrap, SEATED as G_SEATED, POOLS as G_POOLS, phonePlan } from './gestures.js';

const FPS = 30, FADE = 0.3, LEAD = 0.9;
// the left hand's fingers holding the mug (drink_l, «Курилка» v8, mid-sip): the same grip holds the phone's handset
const GRIP_L = { index_01_l: [0.0227, -0.1689, 0.264, 0.9493], index_02_l: [0.0694, 0.0584, 0.6368, 0.7657], index_03_l: [-0.0001, 0.0154, 0.1767, 0.9841],
  middle_01_l: [-0.0183, -0.1142, 0.5858, 0.8021], middle_02_l: [0.0002, -0.0327, 0.6381, 0.7693], middle_03_l: [-0.0019, -0.0195, 0.4861, 0.8737],
  ring_01_l: [-0.0176, -0.1271, 0.5486, 0.8262], ring_02_l: [-0.0126, -0.1683, 0.6617, 0.7305], ring_03_l: [-0.0002, -0.0667, 0.3212, 0.9447],
  pinky_01_l: [-0.0327, -0.1437, 0.4467, 0.8824], pinky_02_l: [0.0508, -0.3101, 0.6643, 0.6782], pinky_03_l: [-0.1115, -0.1455, 0.4056, 0.8955],
  thumb_01_l: [0.7449, 0.2419, -0.0452, 0.6201], thumb_02_l: [-0.1084, 0.0484, 0.1403, 0.983], thumb_03_l: [-0.0009, -0.0103, 0.313, 0.9497] };
// the right hand's pinch (thumb, index and middle on a small thing): the writing clip's hold of the pencil — for turning the TV's knob
const GRIP_R = { pinky_01_r: [0.0436, -0.0244, 0.4876, 0.8716], pinky_02_r: [0.0508, -0.3101, 0.6643, 0.6782], pinky_03_r: [-0.1115, -0.1455, 0.4056, 0.8955], ring_01_r: [0.0198, -0.0404, 0.5665, 0.8229],
  ring_02_r: [-0.0126, -0.1683, 0.6617, 0.7305], ring_03_r: [-0.0002, -0.0667, 0.3212, 0.9447], middle_01_r: [-0.0159, -0.0247, 0.4981, 0.8666], middle_02_r: [0.0002, -0.0327, 0.6381, 0.7693],
  middle_03_r: [-0.0002, -0.016, 0.3269, 0.9449], index_01_r: [0.0234, -0.0332, 0.3137, 0.9486], index_02_r: [0.07, 0.0571, 0.5783, 0.8108], index_03_r: [-0.0001, 0.0154, 0.1767, 0.9841],
  thumb_01_r: [0.7727, 0.2606, -0.0801, 0.5732], thumb_02_r: [-0.1084, 0.0484, 0.1403, 0.983], thumb_03_r: [0, -0.0065, 0.1384, 0.9904] };
const GX = 0.35;                                         // crossfade between gesture clips (gestures.js X)
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
  const sleepProfile=extra.sleepProfile||DESK_SLEEP;
  const S = extra.actorScale ?? ROOM_S;
  const root = gltf.scene, Bn = {}, ID = extra.id || 'editor', SH = extra.shared, BACK = +extra.chairBack || 0;   // BACK: his chair stands this far further from the desk (m, pack)
  const holder = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(S);
  holder.add(body); body.add(root); scene.add(holder); holder.name = 'PERSON ' + ID;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } if (o.isBone) Bn[o.name] = o; });
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && /^SM_Prop_/.test(o.name)) o.visible = false; });   // pack props baked into a figure's file (the reporter's pint and spoon) stay hidden: the add-ons bring their own
  const reading = createTeletypeReading({office,bones:Bn,holder});
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
  function lidFrame(dt) { if (!lids.meshes.length) return;if(ch.sleepVisual?.phase==='asleep')return setLid(1); lids.t += dt;
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
    for (const t of c.tracks) if (t.name.endsWith('.quaternion')) { const v = t.values; for (let i = 0; i < v.length; i += 4) { const l = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1; v[i] /= l; v[i + 1] /= l; v[i + 2] /= l; v[i + 3] /= l; } }   // the drunk clip in the add-on came with quaternions of length 1.225: the skeleton grew ×1.5 per bone and filled the screen
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
  const DRUNK_ON = 80; let drunkSt = null;                               // owner 30.09: the drunk walk from 80
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
  // Reuse the accepted seated hand height during the native chair push/pull.
  // These source transitions precede HER's corrected table-contact idle.
  const diningHandY={};
  if(ID==='heroine'){
    smix.stopAllAction();const a=smix.clipAction(CL.sit_idle.clip);a.reset().play();smix.setTime(.5);sg.updateMatrixWorld(true);
    for(const side of ['l','r'])diningHandY[side]=sclone.getObjectByName('hand_'+side).getWorldPosition(new THREE.Vector3()).y;
    a.stop();
  }
  // typing (MC Seated SitChairTablePC_01_Type, clip from editor2A v13 as on the approved page): the actor sits 4.5 cm nearer the desk; the chair stays put
  const TYPE_KEYS = [8, 25, 30, 34, 38, 42, 46, 51, 56, 60, 65, 69, 73, 76, 81, 89, 93, 103].map((f) => (f - 1) / FPS);   // fingertip strikes (type-contacts.json)
  if (extra.typeClip) CL.type = stripClip('type', extra.typeClip, seatBase);
  // coffee (director's activity 'coffee', seated at a desk): a mug stands on every desk, sips of the approved DrinkR clip
  const coffee = SH.coffee;
  // small gestures in the pauses (add-on editor2A-gestures-web-v01.glb): seated ones in the seat frame, standing ones in place
  const GEST = {};
  if (extra.gestures) for (const c of extra.gestures.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, G_SEATED.has(c.name)||extra.gestureSeated?.includes(c.name) ? seatBase : 'first'); } catch (e) { console.warn('gesture', c.name, e); } }
  const pausePools=extra.restPools?.(G_POOLS)||(ID==='newspaper_editor'?editorRestPools(G_POOLS):G_POOLS);
  let socialLoaded=!!extra.social && (extra.social.actorKind==='heroine-her'||!!GEST.stand_idle_02);
  if(extra.social&&extra.social.actorKind!=='heroine-her'&&!GEST.stand_idle_02) console.warn('conversation requires distinct native standing idle variant',ID);
  if(extra.social)for(const e of extra.social.entries) {
    const raw=extra.social.assets[e.asset].animations.find(c=>c.name===e.animation).clone();
    const missing=raw.tracks.map(t=>THREE.PropertyBinding.parseTrackName(t.name).nodeName).filter(n=>!root.getObjectByName(n));
    if(missing.some(n=>!['scabbard_dagger','scabbard_sword'].includes(n))){socialLoaded=false;console.warn('social missing node',e.id,missing);continue;}
    raw.tracks=raw.tracks.filter(t=>!['scabbard_dagger','scabbard_sword'].includes(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
    try {GEST[socialAlias(e.id)]=stripClip('g_'+socialAlias(e.id),raw,e.seated||e.id.startsWith('talk-seated/')?seatBase:'first');}catch(err){socialLoaded=false;console.warn('social clip',e.id,err);}
  }
  // the phone (add-on editor2A-phone-web-v01.glb): seated clips in the seat frame, the standing ones (stand_*) in place
  if (extra.phoneClips) for (const c of extra.phoneClips.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, /^stand_/.test(c.name) ? 'first' : seatBase); } catch (e) { console.warn('phone clip', c.name, e); } }
  const phones = extra.phones || null;
  // crouching at the TV to turn the channel knob (add-on editor2A-tvswitch-web-v01.glb): the three clips share the frame of the first one (one chain)
  if (extra.tvswitch) { try { const cl = extra.tvswitch.animations, d = cl.find((c) => c.name === 'tv_crouch_down'); GEST[d.name] = stripClip('g_' + d.name, d, 'first');
    const T0 = GEST[d.name].traj[0]; for (const c of cl) if (c !== d) GEST[c.name] = stripClip('g_' + c.name, c, T0); } catch (e) { console.warn('tv switch clips', e); } }
  if (extra.dance) for (const c of extra.dance.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, 'first'); } catch (e) { console.warn('dance clip', c.name, e); } }   // swing dances at the TV (Mixamo), «Танцы у телевизора» v1
  if (extra.jazz) for (const c of extra.jazz.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, 'first'); } catch (e) { console.warn('jazz clip', c.name, e); } }   // listening to music at the TV, standing
  // feet on the desk (add-on editor2A-feetup-web-v01.glb): seated clips in the seat frame + the chair's own track (pushed back, aside, turned)
  if (extra.feetup) for (const c of extra.feetup.animations) { try { GEST[c.name] = stripClip('g_' + c.name, c, seatBase); } catch (e) { console.warn('feet clip', c.name, e); } }
  const FEET_CHAIR = extra.feetup?.userData?.chairTracks || null;
  // writing by hand (add-on editor2A-write-web-v01.glb): seated clips in the seat frame, the pencil and the sheet on his desk
  let writing = null;
  if (extra.write) { try { writing = createWriting({ scene, B: Bn, addon: extra.write, DESKS, S });
    for (const c of writing.clips) GEST[c.name] = stripClip('g_' + c.name, c, seatBase); } catch (e) { console.warn('writing unavailable:', e); writing = null; } }
  if (coffee) CL.drink = stripClip('drink', coffee.bodyClip, seatBase);

  // ---------- seats in the office
  const SEATS = {};
  for (const k of Object.keys(DESKS)) SEATS['desk' + k] = { name: DESKS[k].label, desk: k, pose: comp(DESKS[k], seatBase),
    entries: [['L02a', 'desk_sit_L02a', 'left'], ['L03a', 'desk_sit_L03a', 'left'], ['R02a', 'desk_sit_R02a', 'right']],
    exits: [['L02a', 'desk_stand_L02a', 'left'], ['L03a', 'desk_stand_L03a', 'left'], ['R02a', 'desk_stand_R02a', 'right']] };
  SEATS.diningChair = {name:DINING_CHAIR.label,chair:'D',seatProfile:'desk',pose:comp(DINING_CHAIR,seatBase),
    entries:[['L02a','desk_sit_L02a','left'],['R02a','desk_sit_R02a','right']],
    exits:[['L02a','desk_stand_L02a','left'],['R02a','desk_stand_R02a','right']]};
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

  SH.registerActor(ID,()=>({x:holder.position.x,z:holder.position.z,seat:ch.seat,mode:ch.mode}));
  function passageTags(seatId){return benchPassageTags(seatId,extra.socialOccupancy?.(ID)||[]);}
  function entryOptions(seatId, from) {
    if(seatId.startsWith('bench')&&(extra.socialOccupancy?.(ID)||[]).includes(seatId))return [];
    const seat = SEATS[seatId];
    return seat.entries.filter(([tag])=>!seatId.startsWith('bench')||passageTags(seatId).includes(tag)).map(([tag, clip, side]) => {
      const anc = anchorFor(clip, seat.pose, 'end'), E = comp(anc, CL[clip].traj[0]), f = fwd(E), P0 = P(E.x - f[0] * LEAD, E.z - f[1] * LEAD, E.th);
      const blocked = nav.solid(E.x, E.z)||!SH.nativeClear(ID,CL[clip].traj.map(p=>comp(anc,p)),seatId), pts = blocked ? null : path(from, P0), cost = pts ? nav.length(pts) + LEAD : Infinity;
      return { tag, clip, side, E, P0, pts, cost, blocked, anc };
    });
  }
  function exitOptions(seatId, goal) {
    const seat = SEATS[seatId];
    return seat.exits.filter(([tag])=>!seatId.startsWith('bench')||passageTags(seatId).includes(tag)).map(([tag, clip, side]) => {
      const anc = anchorFor(clip, seat.pose, 'start'), X = comp(anc, CL[clip].traj[CL[clip].traj.length - 1]), f = fwd(X), X1 = P(X.x + f[0] * 0.5, X.z + f[1] * 0.5, X.th);
      let tgt = goal.seat ? Math.min(...entryOptions(goal.seat, X1).map((o) => o.cost)) : nav.length(path(X1, goal.point));
      if(!Number.isFinite(tgt)&&goal.seat?.startsWith('bench'))tgt=SH.benchRefuge(ID,X1)?.cost??Infinity;
      return { tag, clip, side, X, cost: nav.solid(X.x, X.z)||!SH.nativeClear(ID,CL[clip].traj.map(p=>comp(anc,p)),seatId) ? Infinity : 0.5 + tgt, anc };
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
    try { const out = {}; lunch = (extra.lunchFactory || createLunch)({ root, B: Bn, addon: extra.lunch, strip: stripClip, seatBase, S, clipsOut: out }); scene.add(lunch.group);
      const sb = seatBase, ci = Math.cos(sb.th), si = Math.sin(sb.th), invSB = P(-(sb.x * ci - sb.z * si), -(sb.x * si + sb.z * ci), -sb.th);
      lunch.frameOf = (T) => comp(T, invSB);
      lunch.probeGrab(mixer, () => lunch.frameOf(holderPose()));
      for (const [n, c] of Object.entries(out)) { layer('L0:' + n, c, false); layer('L1:' + n, c.clone(), false); A['L0:' + n].paused = A['L1:' + n].paused = true; } }
    catch (e) { console.warn('lunch unavailable:', e); lunch = null; }
  }
  for (const n in GEST) { layer('g_' + n, GEST[n].clip, false); A['g_' + n].paused = true; }
  // whisky alone (whisky.js): the approved page's recording, at the bar standing and at a desk seated — played as two clips
  const WR = SH.whisky && SH.whiskyRec ? SH.whiskyRec : null, WP = WR ? SH.whisky : null;
  if (WR) { try { const has = (n) => !!Bn[n]; layer('wh_bar', extra.whiskyBarClip || bakedClip(WR, 'bar', has), false); A.wh_bar.paused = true; if (!extra.whiskyBarOnly) { layer('wh_desk', bakedClip(WR, 'desk', has), false); A.wh_desk.paused = true; } }
    catch (e) { console.warn('whisky clips unavailable:', e); } }
  const native={};for(const e of extra.nativeClips||[]){const c=stripClip('native_'+e.id,e.clip,e.seated?seatBase:'first');native[e.id]={...e,...c};layer('native_'+e.id,c.clip,false);A['native_'+e.id].paused=true;}
  const nativeProps=extra.nativePropsFactory?.({B:Bn,root,holder,scene,office,S});let nativeState=null;let consumption={seq:null,kind:null,totalMs:0};const performanceWitness=createNativePerformanceWitness();
  const trayController=extra.trayService&&nativeProps?.service?createTrayController({props:nativeProps.service,durations:Object.fromEntries(Object.entries(native).map(([id,e])=>[id,e.clip.duration])),go:point=>{nativeState=null;command({point});},arrived:(point,dt)=>{
    if(ch.mode!=='idle'||ch.seat||ch.blockedGoal||ch.queue||dist(holderPose(),point)>=.06)return false;
    // Navigation finishes an ordinary turn within 4 degrees. A prop station
    // needs the exact heading: finish that residual turn at the same speed.
    const angle=wrap(point.th-holder.rotation.y);holder.rotation.y=wrap(holder.rotation.y+THREE.MathUtils.clamp(angle,-deg(150)*dt,deg(150)*dt));
    return Math.abs(wrap(point.th-holder.rotation.y))<1e-5;
  },label:text=>{ch.motion=text;},pose:(id,t)=>{nativeState={id,seq:cur.seq,t,index:0,offset:0,phase:'clip'};for(const k in W)W[k].cur=W[k].target=k==='native_'+id?1:0;A['native_'+id].time=Math.min(t,native[id].clip.duration-1e-6);A['native_'+id].paused=true;},complete:valid=>{ch.executionEnd={seq:cur.seq,activity:ch.activity,outcome:'completed',replayed:!valid};}}):null;
  nativeProps?.service?.setController(trayController);let trayPending=null;
  function nativeFrame(dt){
    let id=cur?.activity?.startsWith('her:')?cur.activity.slice(4):Object.keys(native).find(id=>native[id].activity===cur?.activity),e=native[id];
    const program=cur?.performance?.sequence;
    if(program?.length){const step=program[nativeState?.seq===cur.seq?nativeState.index||0:0];id=Object.keys(native).find(k=>native[k].activity===step.activity);e=native[id];}
    const ready=e&&socialAtGoal()&&!ch.blockedGoal&&!ch.queue&&(e.seated?ch.mode==='seated'&&(e.seatKinds||['bench']).includes(ch.seat?.startsWith('bench')?'bench':SEATS[ch.seat]?.desk?'desk':ch.seat==='diningChair'?'chair':'none'):ch.mode==='idle'&&!ch.seat);
    if(!ready){
      const hadWeight=Object.keys(W).some(k=>k.startsWith('native_')&&W[k].cur>0);
      for(const k in W)if(k.startsWith('native_'))W[k].cur=W[k].target=0;
      if(hadWeight&&['idle','seated'].includes(ch.mode)){const base=ch.seat?'sit_idle':'stand_idle';W[base].cur=W[base].target=1;}
      nativeState=null;return;
    }
    if(!nativeState||nativeState.seq!==cur.seq||nativeState.id!==id)nativeState={id,seq:cur.seq,t:0,index:0,offset:0,phase:'clip'};else nativeState.t+=dt;
    const blend=program?cur.performance.transitionSeconds||0:0;
    if(program?.length&&nativeState.phase==='clip'&&nativeState.t>=e.clip.duration&&nativeState.index<program.length-1){
      nativeState.t-=e.clip.duration;nativeState.offset+=e.clip.duration;nativeState.previous=id;nativeState.index++;nativeState.phase='transition';
      id=Object.keys(native).find(k=>native[k].activity===program[nativeState.index].activity);e=native[id];nativeState.id=id;
    }
    if(nativeState.phase==='transition'&&nativeState.t>=blend){nativeState.t-=blend;nativeState.offset+=blend;nativeState.phase='clip';nativeState.previous=null;}
    const t=nativeState.t,d=e.clip.duration,transition=nativeState.phase==='transition';
    if(!transition&&t>=d&&(!program||nativeState.index===program.length-1)&&!ch.executionEnd)ch.executionEnd={seq:cur.seq,activity:ch.activity,outcome:'completed',replayed:!!ch.replaying};
    const totalT=(nativeState.offset||0)+t,totalD=program?cur.performance.duration:d,w=Math.min(1,totalT/.3,Math.max(0,(totalD+.3-totalT)/.3));
    const alpha=transition?Math.min(1,t/blend):1;
    for(const k in W){W[k].cur=W[k].target=k==='native_'+id?w*alpha:transition&&k==='native_'+nativeState.previous?w*(1-alpha):k===(e.seated?'sit_idle':'stand_idle')?1-w:0;}
    A['native_'+id].time=transition?0:Math.min(t,d-1e-6);A['native_'+id].paused=true;
    if(transition){A['native_'+nativeState.previous].time=native[nativeState.previous].clip.duration-1e-6;A['native_'+nativeState.previous].paused=true;}
    ch.motion=transition?'переходит к следующей части выступления':e.label;
  }
  function nativePost(){const e=nativeState&&native[nativeState.id],show=e&&nativeState.t<=e.clip.duration;nativeProps?.post(show?e.id:null,nativeState?.t||0,e?comp(holderPose(),inv(e.traj[0])):holderPose());}
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
    try { smoking = createSmoking({ scene, root, B: Bn, mixer, U: S, addon: extra.smoke, profile:extra.smokeProfile, strip: stripClip, camera: extra.camera, renderer: extra.renderer });
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
    if(extra.smokeProfile?.standOnly&&ch.seat)return null;
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
  const ARMS = ['upperarm_r', 'lowerarm_r', 'hand_r', 'upperarm_l', 'lowerarm_l', 'hand_l', ...(extra.phones ? [...Object.keys(GRIP_L), 'neck_01', 'head'] : []), ...(FEET_CHAIR || ID==='heroine' ? ['spine_02'] : []), ...(extra.tvswitch ? Object.keys(GRIP_R) : [])].map((n) => Bn[n]).filter(Boolean), armQ = ARMS.map((b) => b.quaternion.clone());
  const IK = !!(smoking || lunch || phones || writing || FEET_CHAIR || extra.tvswitch || ID==='heroine');   // something moves bones after the mixer
  const armRestore = () => ARMS.forEach((b, i) => b.quaternion.copy(armQ[i])), armSave = () => ARMS.forEach((b, i) => armQ[i].copy(b.quaternion));

  // ---------- behaviour (as the seating page v6)
  const tw = SH.typewriters || null;
  // activities that need a free desk: the typewriter on that desk is taken away (none of them is live yet)
  const FREE_DESK = new Set(['lunch', 'coffee', 'heroine_coffee', 'smoke_coffee', 'rest_desk', 'sleep_desk', 'whisky']);   // whisky: only when he drinks at a desk   // resting: the desk is free for the gestures (papers, chin on the hand, dozing)
  let freeDesk = null, freeKind = null;
  const typing = () => !!(CL.type && ch.work && ch.seat && SEATS[ch.seat].desk);
  const seatedLoop = () => (typing() ? 'type' : 'sit_idle');
  // a sip: starts only while he is having coffee at a desk (by the coffee clock), once started it is drunk to the end
  const sipping = () => ch.sip !== null;
  const eating = () => !!lunch && lunch.active() && ch.seat === lunch.seat() && !lunch.done(ch.lunchT);
  const ch = { socialAbs: 0, tAbs: 0, crowd: null, clk: 0, g: null, gKey: '', fatigue: 0, sip: null, coffeeT: 0, lunchT: 0, lunchSeq: -1, work: false, title: '', mode: 'idle', seat: null, speed: 0, vis: 0, err: 0, path: null, cursor: 0, after: null, trans: null, queue: null, chairTail: null, blendIn: 0, motion: 'стоит' };
  const sleepText=phase=>({entering:'готовится ко сну',asleep:'спит',waking:'просыпается',done:'проснулся'}[phase]||'спит')+(SEATS[ch.seat]?.chair?' на стуле у круглого стола':' за столом');
  // D has two physical positions. Navigation and sleep use the accepted rear
  // position; seated table use adds the native L03a chair travel (0.25 pack m).
  const dining = {near:false,move:null,pending:null,goal:null,contactClip:null};
  const diningDistance=.25*ROOM_S;
  function diningPose(near){const p=SEATS.diningChair.pose;return P(p.x,p.z+(near?diningDistance:0),p.th);}
  function settleDining(near){dining.near=near;setHolder(diningPose(near));setChair('D',BACK-(near?.25:0));chairs.D.plan=BACK-(near?.25:0);syncBoxes();}
  function startDining(near){
    if(ID!=='heroine'||ch.seat!=='diningChair'||dining.move||near===dining.near)return false;
    const clip=near?'desk_sit_L03a':'desk_stand_L03a',start=near?185/30:0,end=near?275/30:68/30;
    if(!CL[clip]||!chairs.D)return false;
    ch.g=null;nativeState=null;dining.contactClip=clip;dining.move={near,clip,start,end,t:start};ch.mode='chair_adjust';
    for(const k in W)if(k.startsWith('native_'))W[k].cur=W[k].target=0;
    chairs.D.plan=BACK-(near?.25:0);SH.setNative(ID,[diningPose(false),diningPose(true)],'diningChair');syncBoxes();
    A[clip].reset().play();A[clip].paused=true;A[clip].time=start;fadeTo(clip,.2);return true;
  }
  function diningReady(){
    if(ID!=='heroine'||ch.seat!=='diningChair')return true;
    if(dining.move)return false;
    return ch.activity==='sleep_desk'&&ch.sleepVisual?.phase!=='done'?!dining.near:dining.near;
  }
  function diningFrame(dt){
    if(ID!=='heroine')return false;
    if(!dining.move&&ch.mode==='seated'&&ch.seat==='diningChair'&&!ch.queue&&!ch.hold){
      const sleeping=ch.activity==='sleep_desk'&&ch.sleepVisual?.phase!=='done';
      if(sleeping&&dining.near)startDining(false);
      else if(!sleeping&&!dining.near&&!ch.g)startDining(true);
      else if(ch.sleepVisual?.phase==='done'&&!dining.near)startDining(true);
    }
    const m=dining.move;if(!m)return false;
    m.t=Math.min(m.end,m.t+dt);A[m.clip].time=m.t;
    const key=m.clip.replace('desk_sit_','Stand_Trans_SitChairTable_').replace('desk_stand_','SitChairTable_Trans_Stand_');
    const tr=chairTracks[key].track,u=m.t*FPS,i=Math.min(tr.length-2,Math.floor(u)),f=u-i;
    const dy=tr[i][1]+(tr[i+1][1]-tr[i][1])*f,shift=(.25-dy)*ROOM_S;
    const base=SEATS.diningChair.pose;setHolder(P(base.x,base.z+shift,base.th));setChair('D',BACK+dy-.25);
    ch.motion=m.near?'придвигается к столу':'отодвигается от стола';
    if(m.t>=m.end){
      dining.move=null;settleDining(m.near);ch.mode='seated';fadeTo('sit_idle',.25);SH.setNative(ID,null);
      const pending=dining.pending,goal=dining.goal;dining.pending=null;dining.goal=null;
      if(pending){const at=ch.tAbs*1000,e=pending.chars[ID];apply({...pending,chars:{...pending.chars,[ID]:{...e,at}}},at);}else if(goal)command(goal);
    }
    return true;
  }
  function diningPost(){
    const clip=dining.contactClip;if(!clip)return;
    if(!dining.move&&W[clip].cur<.001){dining.contactClip=null;return;}
    holder.updateMatrixWorld(true);
    straightenTableLean();
    for(const side of ['l','r']){
      const p=Bn['hand_'+side].getWorldPosition(new THREE.Vector3());
      // Lift before the fingers cross the near edge (z=.4624), while
      // retaining native chair grips outside the tabletop footprint.
      const w=smooth((p.z-.20)/.10)*smooth((p.y-.98)/.10);
      let lowest=Infinity;
      Bn['hand_'+side].traverse(b=>{if(!b.isBone)return;const q=b.getWorldPosition(new THREE.Vector3());if(/_03_[lr]$/.test(b.name))q.add(q.clone().sub(b.parent.getWorldPosition(new THREE.Vector3())));if(q.z>.38)lowest=Math.min(lowest,q.y);});
      // Project the distal phalanx to its tip; allow 2 cm for
      // finger mesh thickness above the measured tabletop top (1.1853).
      const lift=Math.max(0,diningHandY[side]-p.y,1.2053-lowest);
      if(w>0&&lift>0)reach(p.clone().setY(p.y+lift*w),1,side);
    }
  }
  function command(goal) {
    if(dining.move){dining.goal=goal;return;}

    ch.blockedGoal=null;
    if(ch.benchWait&&goal!==ch.benchWait.goal){ch.benchWait=null;SH.setNative(ID,null);}
    syncBoxes();                                        // the others may have moved since: walk around where they are now
    if (ch.mode === 'trans' || ch.mode === 'settle' || ch.wh) { ch.queue = goal; if (ch.wh) ch.motion = 'допивает'; return; }
    if(ch.g?.social&&(ch.mode==='idle'||ch.mode==='seated')){ch.queue=goal;ch.g=finishTurnPlan(ch.g,ch.clk-ch.g.t0);ch.hold=true;return;}
    if (ch.mode === 'seated' && ch.g) { ch.queue = goal; ch.mode = 'settle'; ch.g = gWrap(ch.g, ch.clk - ch.g.t0); ch.motion = 'сидит'; return; }   // lifts his head first
    if(ch.mode==='idle'&&ch.g?.social) {ch.queue=goal;ch.g=finishTurnPlan(ch.g,ch.clk-ch.g.t0);ch.hold=true;return;}
    if (ch.mode === 'idle' && (ch.g?.jazz || ch.g?.tv)) { ch.queue = goal; if (ch.g.jazz) ch.g = jazzOut(ch.g, ch.clk - ch.g.t0); ch.hold = true; return; }   // the loop goes into its stop / he gets up from the crouch first
    if (ch.mode === 'idle' && ch.g?.phone) { ch.queue = goal; if (!ch.g.wrapped) { ch.g = { ...gWrap(ch.g, ch.clk - ch.g.t0), wrapped: true }; } ch.hold = true; return; }   // standing: puts the handset back first
    if (ch.seat) {
      if (goal.seat === ch.seat) return;
      if (ch.mode === 'seated' && sipping()) { ch.queue = goal; ch.mode = 'settle'; ch.motion = 'допивает'; return; }
      if (ch.mode === 'seated' && eating()) { ch.queue = goal; ch.mode = 'settle'; ch.motion = 'доедает'; return; }
      if (ch.mode === 'seated' && W.type && W.type.cur > 0.05) { ch.queue = goal; ch.mode = 'settle'; fadeTo('sit_idle', 0.6); W.type.rate = 1 / 0.6; ch.motion = 'откладывает работу'; return; }
      if(ID==='heroine'&&ch.seat==='diningChair'&&(dining.near||dining.move)){
        dining.goal=goal;if(!dining.move)startDining(false);return;
      }
      const opts = exitOptions(ch.seat, goal), pick = opts.filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0];
      if(!pick){ch.queue=null;ch.blockedGoal=goal;ch.retryAt=ch.clk+1;ch.motion='ждёт свободный выход';fadeTo('sit_idle');return;}
      ch.queue = goal; if(startTrans(pick.clip, pick.anc, 'stand'))ch.motion = 'встаёт'; return;
    }
    goTo(goal);
  }
  function crowdGo(to, tail, v0) {                     // walking together: the crowd takes him to `to`, then `tail` is walked by the code below
    const here = holderPose(), req = CR ? CR.start(ID, ch.tAbs, here, to, natNow(), v0) : null; if (!req) return false;
    ch.crowd = { req, tail, t0: ch.tAbs, off: P(here.x - req.from.x, here.z - req.from.z) };
    ch.path = null; ch.cursor = 0; ch.mode = 'walk'; ch.motion = 'идёт'; return true;
  }
  function waitOffBench(goal){
    if(!goal.seat?.startsWith('bench')||ch.seat)return false;
    if(ch.benchWait&&dist(holderPose(),ch.benchWait.refuge)<.3)return false;
    const refuge=SH.benchRefuge(ID,holderPose());if(!refuge)return false;
    ch.benchWait={goal,refuge:refuge.point};
    SH.setNative(ID,refuge.samples,'bench-refuge');
    if(crowdGo(refuge.point,[refuge.point],0)){ch.after={type:'stand',face:refuge.point.th};return true;}
    ch.crowd=null;if(CR)CR.stand(ID,null,ch.tAbs);
    ch.blockedGoal=null;ch.path=refuge.pts;ch.cursor=0;ch.after={type:'stand',face:refuge.point.th};ch.mode='walk';ch.motion='отходит за скамью, освобождая проход';return true;
  }
  function goTo(goal, v0 = 0) {
    const here = holderPose(); ch.crowd = null; ch.blockedGoal=null;
    if (goal.seat) {
      const pick = entryOptions(goal.seat, here).filter((o) => o.cost < Infinity).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) { if(waitOffBench(goal))return;ch.mode='idle';ch.path=null;ch.after=null;ch.speed=ch.vis=0;ch.blockedGoal=goal;ch.retryAt=ch.clk+1;ch.motion='ждёт свободный путь'; return; }
      ch.benchWait=null;
      if (crowdGo(pick.P0, [P(pick.P0.x, pick.P0.z), P(pick.E.x, pick.E.z)], v0)) { ch.after = { type: 'sit', seat: goal.seat, opt: pick }; return; }
      ch.path = [...pick.pts, P(pick.E.x, pick.E.z)]; ch.cursor = 0; ch.after = { type: 'sit', seat: goal.seat, opt: pick }; ch.mode = 'walk'; ch.motion = 'идёт';
    } else {
      if (crowdGo(goal.point, [P(goal.point.x, goal.point.z)], v0)) { ch.after = { type: 'stand', face: goal.point.th }; return; }
      const pts = path(here, goal.point); if (!pts) { ch.mode='idle';ch.path=null;ch.after=null;ch.speed=ch.vis=0;ch.blockedGoal=goal;ch.retryAt=ch.clk+1;ch.motion='ждёт свободный путь'; return; }
      ch.path = pts; ch.cursor = 0; ch.after = { type: 'stand', face: goal.point.th }; ch.mode = 'walk'; ch.motion = 'идёт';
    }
  }
  function startTrans(clipName, anc, kind, seatId) {
    const c = CL[clipName], effectiveSeat=kind==='sit'?seatId:ch.seat,points=c.traj.map(p=>comp(anc,p));
    if(!SH.nativeClear(ID,points,effectiveSeat)){if(kind==='sit'&&waitOffBench({seat:seatId}))return false;ch.blockedGoal=kind==='sit'?{seat:seatId}:ch.queue;ch.queue=null;ch.after=null;ch.crowd=null;ch.path=null;ch.mode=kind==='sit'?'idle':'seated';ch.speed=ch.vis=0;ch.retryAt=ch.clk+1;ch.motion=kind==='sit'?'ждёт свободную посадку':'ждёт свободный выход';fadeTo(kind==='sit'?'stand_idle':'sit_idle');return false;}
    if(CR)CR.stand(ID,null,ch.tAbs);
    SH.setNative(ID,points,effectiveSeat);const a = A[clipName]; a.reset(); a.play(); a.paused = false;
    const start = comp(anc, c.traj[0]), here = holderPose();
    const desk = clipName.startsWith('desk') ? (SEATS[kind === 'sit' ? seatId : ch.seat].desk||SEATS[kind === 'sit' ? seatId : ch.seat].chair) : null;
    ch.trans = { clip: clipName, c, anc, t: 0, kind, seatId, desk, off: P(here.x - start.x, here.z - start.z, wrap(here.th - start.th)),
      chairFrom: desk && chairs[desk] ? chairs[desk].dy : null };
    if (desk && chairs[desk]) { chairs[desk].plan = kind === 'sit' ? BACK : CHAIR_TUCKED; syncBoxes(); }
    ch.chairTail = null; ch.mode = 'trans'; fadeTo(clipName, 0.25);return true;
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
    if(ch.blockedGoal&&['idle','seated'].includes(ch.mode)&&!ch.g&&ch.clk>=ch.retryAt){const q=ch.blockedGoal;syncBoxes();command(q);}
    // settle: hands go back from the keys to the desk, then he may stand up
    if (ch.mode === 'settle') { if ((!W.type || W.type.cur <= 0.02) && !sipping() && !eating() && !ch.g) { ch.mode = 'seated'; const q = ch.queue; ch.queue = null; if (q) command(q); } }
    if (ch.mode === 'seated') {                              // switch between typing and resting without standing up
      const want = seatedLoop();
      if (W[want].target < 1) { if (want === 'type') { A.type.reset(); A.type.play(); } fadeTo(want, 0.9); }
      ch.motion = want === 'type' ? 'печатает' : 'сидит';
    }
    if (lunch) {
      if(lunch.autoComplete&&lunch.active()&&(ch.activity!=='lunch'||lunch.done(ch.lunchT))){
        if(ch.activity==='lunch'&&lunch.done(ch.lunchT))ch.executionEnd={seq:cur?.seq,activity:ch.activity,outcome:'completed',replayed:!!ch.replaying};ch.lunchSeq=cur?.seq;lunch.end();
        for(const k in W)if(k.startsWith('L'))W[k].target=W[k].cur=0;
        if(['seated','settle'].includes(ch.mode))W.sit_idle.target=W.sit_idle.cur=1;
      }
      const bench = ch.seat && ch.seat.startsWith('bench') ? ch.seat : (ch.mode === 'trans' && ch.trans.kind === 'sit' && ch.trans.seatId.startsWith('bench') ? ch.trans.seatId : null);
      if (bench && ch.activity === 'lunch' && (!lunch.autoComplete||(bench===(cur?.cmd||cur?.from)?.seat&&!ch.blockedGoal&&!ch.queue)) && (!lunch.autoComplete||ch.lunchSeq!==cur?.seq) && (!lunch.active() || lunch.seat() !== bench)) { const meal=selectMeal(cur?.meal,cur?.seq??0,extra.lunchDishes||DISHES);if(meal&&lunch.begin(meal.dish,lunch.frameOf(SEATS[bench].pose),bench,meal.id)!==false)ch.lunchT=0; }
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
    if (WP && A.wh_bar) whiskyFrame(dt);
    if (tw) {                                                           // typewriters stay on the desks; an activity that needs the desk clears it
      if (FREE_DESK.has(ch.activity) && !(ch.activity === 'rest_desk' && W.type && W.type.cur > 0.05) && !(ch.activity === 'whisky' && !ch.goalDesk)) { freeDesk = ch.goalDesk || freeDesk; freeKind = ch.activity; }   // hidden as soon as he sets off towards that desk (resting: once the hands are off the keys)
      else if (freeDesk && ch.activity === 'work' && !feetDesk) freeDesk = null;                // back to work at the same desk: the machine is back (after the feet are off it)
      else if (freeDesk && !(ch.seat && SEATS[ch.seat].desk === freeDesk) && ch.mode !== 'settle') freeDesk = null;   // back once he has got up and left
    }
    SH.claim(ID, freeDesk, freeKind);
    if (writing) for (const k of Object.keys(DESKS)) writing.show(k, deskFreeForRest(k));                                  // resting: a sheet and a pencil where the typewriter was                                   // the page puts the machines and mugs of all desks right after everybody moved
    if(ch.mode!=='trans'&&!ch.chairTail&&!(ch.benchWait&&['walk','turn'].includes(ch.mode)))SH.setNative(ID,null);
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
        if (!s || s.stalled) { const alt = path(here, c.tail[0]);
          if(!alt){ch.blockedGoal=ch.benchWait?.goal||(ch.after?.type==='sit'?{seat:ch.after.seat}:{point:{...c.tail.at(-1),th:ch.after?.face??c.tail.at(-1).th}});SH.setNative(ID,null);ch.retryAt=ch.clk+1;ch.mode='idle';ch.path=null;ch.after=null;ch.crowd=null;ch.speed=ch.vis=0;ch.motion='ждёт свободный путь';fadeTo('stand_idle');return;}
          pts = [...alt, ...c.tail.slice(1)]; }
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
        const o = ch.after.opt; ch.speed = 0; if(startTrans(o.clip, o.anc, 'sit', ch.after.seat))ch.motion = 'садится'; return; }
      if (ch.cursor >= pts.length - 1) { ch.speed = 0; ch.mode = 'turn'; }
    }
    if (ch.mode === 'turn') {
      const want = ch.after?.type === 'sit' ? ch.after.opt.E.th : (ch.after?.face ?? holder.rotation.y), d = wrap(want - holder.rotation.y), max = deg(150) * dt;
      holder.rotation.y = wrap(holder.rotation.y + THREE.MathUtils.clamp(d, -max, max));
      if (Math.abs(d) < deg(ch.after?.type === 'sit' ? 10 : 4)) {
        if (ch.after?.type === 'sit') { const o = ch.after.opt; if(startTrans(o.clip, o.anc, 'sit', ch.after.seat))ch.motion = 'садится'; }
        else { ch.mode = 'idle'; ch.motion = 'стоит';if(CR)CR.stand(ID,holderPose(),ch.tAbs);if(ch.benchWait){SH.setNative(ID,null);ch.blockedGoal=ch.benchWait.goal;ch.retryAt=ch.clk+.2;} const q = ch.queue; ch.queue = null; if (q) command(q); }
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
  // ---------- whisky alone: at the bar (spot 'bar', standing) — pours, takes the glass, drinks, puts it back; at a desk (seated) — one
  // drink of the approved DrinkR from a tumbler, the bottle on the desk. Once per decision; a new command waits until it is over.
  const WH_FADE = 0.4;
  function whiskyFrame(dt) {
    const w = ch.wh;
    ch.sitT = ch.mode === 'seated' ? (ch.sitT || 0) + dt : 0;          // how long he has been sitting (the desk drink waits 1.5 s)
    if (!w) {
      if (ch.whBar && dist(holderPose(), SPOTS.bar) > 1.2) { ch.whBar = false; WP.setBar(0); }      // walked away from the bar: the glass is back as it stood
      if (ch.activity !== 'whisky' || !cur || ch.whSeq === cur.seq) return;
      if (ch.mode === 'idle' && !ch.seat && ch.speed === 0 && !ch.g && SPOTS.bar && dist(holderPose(), SPOTS.bar) < 0.4) {
        ch.wh = { kind: 'bar', t: 0, seq: cur.seq, from: holderPose(), at: WP.toWorld(barHolder(WR, 0)) }; ch.mode = 'whisky'; ch.whBar = true; WP.setBar(0); }
      else if (A.wh_desk && ch.mode === 'seated' && ch.seat && SEATS[ch.seat].desk && ch.sitT > 1.5 && (!W.type || W.type.cur < 0.05) && !ch.g) {
        const d = SEATS[ch.seat].desk; WP.deskFrame(d, SEATS[ch.seat].pose); ch.wh = { kind: 'desk', t: 0, seq: cur.seq, desk: d }; }
      return;
    }
    w.t += dt; const R = WR[w.kind], t = Math.min(w.t, R.D), lay = w.kind === 'bar' ? 'wh_bar' : 'wh_desk', idle = w.kind === 'bar' ? 'stand_idle' : 'sit_idle';
    const e = smooth(t / WH_FADE) * (1 - smooth((t - (R.D - WH_FADE)) / WH_FADE));
    for (const k in W) W[k].target = W[k].cur = 0; W[lay].target = W[lay].cur = e; W[idle].target = W[idle].cur = 1 - e; A[lay].time = Math.min(t, R.D - 1e-4);
    if (w.kind === 'bar') {                             // where he stands: the recording's, in the office bar's frame; the arrival eases in over 0.5 s
      const T = WP.toWorld(barHolder(WR, t)), k = 1 - smooth(t / 0.5), o = w.from, a = w.at;
      setHolder(P(T.x + (o.x - a.x) * k, T.z + (o.z - a.z) * k, T.th + wrap(o.th - a.th) * k)); WP.setBar(t);
      const ph = WR.bar.phase.filter((x) => x[0] <= t * WR.fps).pop()?.[1];
      ch.motion = ph === 'pour' ? 'наливает виски' : ph === 'drink' || ph === 'toDrink' ? 'пьёт виски' : ph === 'put' || ph === 'toBar' ? 'ставит стакан' : 'берёт стакан';
    } else { WP.setDesk(w.desk, t); ch.motion = 'пьёт виски'; }
    if (w.t >= R.D) {
      ch.wh = null; ch.whSeq = w.seq;
      if (extra.whiskyBarOnly && cur?.seq === w.seq) ch.executionEnd = {seq:w.seq,activity:'whisky',outcome:'completed',replayed:!!ch.replaying};
      if (w.kind === 'bar') { ch.mode = 'idle'; ch.motion = 'стоит'; W.stand_idle.target = W.stand_idle.cur = 1; if (CR) CR.stand(ID, holderPose()); }
      else { ch.motion = 'сидит'; W.sit_idle.target = W.sit_idle.cur = 1; }
      const q = ch.queue; ch.queue = null; if (q) command(q);
    }
  }
  // ---------- small gestures in the pauses: only while he just sits or just stands (gestures.js keeps the schedule)
  const G_BUSY = new Set(['sleep_desk','work', 'coffee', 'smoke', 'smoke_coffee', 'lunch', 'phone', 'invite', 'whisky', 'conversation']);
  const G_LABEL = { sit_lookat: 'оглядывается', sit_papers: 'просматривает бумаги', sit_lean: 'облокотился на стол', sit_doze: 'дремлет', stand_look: 'оглядывается',
    stand_watch: 'смотрит на часы', stand_yawn: 'зевает', stand_scratch: 'чешет затылок', stand_neck: 'разминает шею', feet_idle: 'закинул ноги на стол', write: 'пишет от руки',
    write_secret: 'пишет, прикрывая лист рукой', jazz: 'слушает музыку', jazz_02_tap: 'слушает музыку', jazz_03_tap: 'слушает музыку', tv_crouch_down: 'включает музыку' };
  const gDur = (n) => GEST[n] && GEST[n].clip.duration;
  // ---------- the phone: the owner's calls ring on desk A (the editor's phone); whoever is there answers — seated if he sits at
  // that desk, otherwise standing next to it (the director sends him to the spot 'phoneA'). Clock: time since the decision.
  const PHONE_DESK = 'A', RING_MIN = 1.5;
  let ringing = false;
  function phoneStatus(){
    const g=ch.g?.phone?ch.g:null,u=g?ch.clk-g.t0:0;
    const start=g?.segs.find(x=>/phone_start$/.test(x.n)),stop=g?.segs.find(x=>/phone_stop$/.test(x.n));
    const phase=!g?'idle':stop&&u>=stop.s?'return':start&&u<start.s+start.d?'pickup':'talk';
    const hand=Bn.hand_l,middle=Bn.middle_01_l;
    const palm=hand&&middle?hand.getWorldPosition(new THREE.Vector3()).lerp(middle.getWorldPosition(new THREE.Vector3()),.75):null;
    return {seq:cur?.seq,ready:!!phones&&['phone_start','phone_01','phone_02','phone_03','phone_stop','stand_phone_start','stand_phone_01','stand_phone_02','stand_phone_03','stand_phone_stop'].every(n=>gDur(n)>0),occupied:!!g,phase,
      receiving:ch.activity==='phone'&&phase==='talk'&&phones?.M?.A?.up===true&&!!palm&&palm.distanceTo(phones.grip('A'))<.08};
  }
  function phoneCall() {
    window.__ownerPhoneMaintain?.(ch,gDur);
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
  const EAR_H = extra.phoneProfile ? new THREE.Vector3(...extra.phoneProfile.ear) : new THREE.Vector3(4.5, 0.5, 7.5), MOUTH_H = extra.phoneProfile ? new THREE.Vector3(...extra.phoneProfile.mouth) : Array.isArray(extra.phoneMouth) && extra.phoneMouth.length === 3 && extra.phoneMouth.every((x) => Number.isFinite(x) && Math.abs(x) < 30)
    ? new THREE.Vector3(...extra.phoneMouth) : new THREE.Vector3(0.5, -16.5, 0);   // head bone frame (cm): an ear, a point 3-4 cm in front of the mouth (per person: PEOPLE.<id>.phoneMouth; the reporter's head is +25 % since v23)
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
        const hp = head.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(...(extra.phoneProfile?.faceAxis||[0,-1,0])).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(f, T.clone().sub(hp).normalize());
        rotateWorld(b, new THREE.Quaternion().slerp(q, wl * k)); }
      head.updateMatrixWorld(true); }
    if (!earSide && !extra.phoneProfile) { const hp = head.getWorldPosition(new THREE.Vector3()), T = holderPose(), right = new THREE.Vector3(-Math.cos(T.th), 0, Math.sin(T.th));
      earSide = EAR_H.clone().applyMatrix4(head.matrixWorld).sub(hp).dot(right) > 0 ? 1 : -1; }
    const E = (extra.phoneProfile?EAR_H.clone():new THREE.Vector3(EAR_H.x, EAR_H.y, -EAR_H.z * earSide)).applyMatrix4(head.matrixWorld), Mo = MOUTH_H.clone().applyMatrix4(head.matrixWorld);
    const R = extra.phoneProfile?new THREE.Vector3(...extra.phoneProfile.outward).transformDirection(head.matrixWorld):E.clone().sub(new THREE.Vector3(EAR_H.x, EAR_H.y, 0).applyMatrix4(head.matrixWorld)).normalize();
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
      const grip=extra.phoneProfile?.grip||GRIP_L;
      for (const n in grip) { const b = Bn[n]; if (b) b.quaternion.slerp(_qg.fromArray(grip[n]), w); }
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
  // the chair follows the feet-on-the-desk clips (their chair track, weighted like the clips); the rest of the weight: the chair as it was
  let feetDesk = null, feetBase = 0;
  function feetChair(w) {
    const on = FEET_CHAIR && ch.g && ch.seat && SEATS[ch.seat].desk && ch.g.segs.some((a) => a.n.startsWith('feet_'));
    if (!on) { if (feetDesk) { setChair(feetDesk, feetBase); feetDesk = null; } return; }
    if (!feetDesk) { feetDesk = SEATS[ch.seat].desk; feetBase = chairs[feetDesk] ? chairs[feetDesk].dy : 0; }
    let sw = 0, dx = 0, dy = 0, yaw = 0;
    for (const n in w) { if (!n.startsWith('feet_')) continue; const [k, t] = w[n], tr = (FEET_CHAIR[n] || FEET_CHAIR.feet_idle).track;
      const v = FEET_CHAIR[n] ? tr[Math.min(tr.length - 1, Math.max(0, Math.round(t * FPS)))] : tr[0]; sw += k; dx += k * v[0]; dy += k * v[1]; yaw += k * v[2]; }
    setChair(feetDesk, dy + (1 - sw) * feetBase, dx, yaw);
  }
  // pushing the chair back the actor bends low over the desk; our big head would touch it: straighten the back just enough
  const HEAD_MIN = 1.14 / 0.644;                                      // head bone at least 1.14 m above the floor while he pushes off
  function feetPost() {
    const g = ch.g; if (!FEET_CHAIR || !g || !feetDesk) return;
    const u = ch.clk - g.t0, a = g.segs.find((x) => x.n === 'feet_start' && u >= x.s && u < x.s + x.d); if (!a) return;
    straightenTableLean();
  }
  function straightenTableLean(){
    const b = Bn.spine_02, H = Bn.head; holder.updateMatrixWorld(true);
    const y0 = H.getWorldPosition(new THREE.Vector3()).y; if (y0 >= HEAD_MIN) return;
    const T = holderPose(), ax = new THREE.Vector3(Math.cos(T.th), 0, -Math.sin(T.th)), q0 = b.quaternion.clone();   // his left: a turn about it lifts the head
    const hAt = (dg) => { b.quaternion.copy(q0); rotateWorld(b, new THREE.Quaternion().setFromAxisAngle(ax, dg * Math.PI / 180)); return H.getWorldPosition(new THREE.Vector3()).y; };
    const sg = hAt(5) > y0 ? 1 : -1; let lo = 0, hi = 35;
    for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (hAt(sg * m) < HEAD_MIN) lo = m; else hi = m; }
    hAt(sg * hi);
  }
  // the desk is clear of the typewriter for resting (the feet and the writing need it)
  function deskFreeForRest(k) { return tw ? freeDesk === k && freeKind === 'rest_desk' : !!(ch.seat && SEATS[ch.seat].desk === k); }
  // how high the finger bones stay above the desk (world metres): the owner's pose in Blender (pencil-grip-v03.blend) — the hands lying on
  // the sheet; and the turn of the writing hand he gave it (8° about the character's forward axis)
  const FINGER_R = { r: -0.0018, l: 0.0070 }, DQ_R = new THREE.Quaternion(0, 0, -0.07155, 0.99744);
  function writePost() {
    if (!writing) return; const k = ch.seat && SEATS[ch.seat].desk; if (!k) return;
    const u = ch.g ? ch.clk - ch.g.t0 : 0, e = ch.g && writing.segOf(ch.g, u) ? gSample(ch.g, u).e : 0, w = e ? writing.hold(ch.g, u) * e : 0;
    if (e > 0) {   // the point onto the paper (the hand goes down), but no finger into the desk: the fingers rest on it (either hand goes up)
      { const H = Bn.hand_r, rq = root.getWorldQuaternion(new THREE.Quaternion()), now = H.getWorldQuaternion(new THREE.Quaternion());
        const want = rq.clone().multiply(DQ_R).multiply(rq.clone().invert()).multiply(now); now.slerp(want, e);
        H.quaternion.copy(H.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(now)); H.updateMatrixWorld(true); }
      const cr = writing.clearance(k, 'r') - FINGER_R.r, cl = writing.clearance(k, 'l') - FINGER_R.l, down = (sd) => Bn['hand_' + sd].getWorldPosition(new THREE.Vector3());
      const dy = Math.min(writing.drop(k, w), cr >= 0 ? cr : cr * e); if (dy) reach(down('r').add(new THREE.Vector3(0, -dy, 0)), 1);
      if (cl < 0) reach(down('l').add(new THREE.Vector3(0, -cl * e, 0)), 1, 'l');
    }
    writing.post(k, w, writing.segOf(ch.g, u), ch.g ? ch.g.t0 + ':' + (cur?.seq ?? '') : undefined);
  }
  // turning the TV's channel knob while crouched (tv_crouch_idle): the right hand goes to the knob, turns it (a twist of the wrist about
  // the knob's axis) and comes back. knobTurn: how far the knob is turned (0…1) — the TV switches to music when it is turned.
  const KNOB = new THREE.Vector3(TV_KNOB.x, TV_KNOB.y, TV_KNOB.z), KNOB_N = new THREE.Vector3(TV_KNOB.n.x, 0, TV_KNOB.n.z), TWIST = deg(70);
  let knobTurn = 0, knobReceipt = null, knobDistance=null;
  function knobPost() {
    knobTurn = 0; const g = ch.g; if (!g || !g.tv) return;
    const u = ch.clk - g.t0, a = g.segs.find((x) => x.n === 'tv_crouch_idle' && u >= x.s && u < x.s + x.d); if (!a) return;
    const t = u - a.s, w = hump(t * FPS, 10, 34, (a.d - 1.0) * FPS, (a.d - 0.25) * FPS), turn = smooth((t - 1.4) / 0.8);
    if (w <= 0) return;
    // the hand as one holds a dial: fingers towards the set (a little down), the thumb on top, then the wrist turns about the knob's axis;
    // the wrist stands back from the knob by the hand's length so the fingers close on it
    const H = Bn.hand_r, Pw = (b) => Bn[b].getWorldPosition(new THREE.Vector3());
    const f = Pw('middle_01_r').sub(Pw('hand_r')).normalize(), sd = Pw('pinky_01_r').sub(Pw('index_01_r')), handLen = Pw('middle_03_r').distanceTo(Pw('hand_r'));
    sd.addScaledVector(f, -sd.dot(f)).normalize();
    const f2 = KNOB_N.clone().negate().add(new THREE.Vector3(0, -0.25, 0)).normalize(), s2 = new THREE.Vector3(0, -1, 0);
    s2.applyAxisAngle(f2, TWIST * turn); s2.addScaledVector(f2, -s2.dot(f2)).normalize();
    const B0 = new THREE.Matrix4().makeBasis(f, sd, f.clone().cross(sd)), B1 = new THREE.Matrix4().makeBasis(f2, s2, f2.clone().cross(s2));
    const R = new THREE.Quaternion().setFromRotationMatrix(B1.multiply(B0.transpose()));
    const want = H.getWorldQuaternion(new THREE.Quaternion()).premultiply(R), now = H.getWorldQuaternion(new THREE.Quaternion()).slerp(want, w);
    H.quaternion.copy(H.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(now)); H.updateMatrixWorld(true);
    for (const [n, q] of Object.entries(extra.knobGrip||GRIP_R)) if (Bn[n]) Bn[n].quaternion.slerp(new THREE.Quaternion().fromArray(q), w);   // pinch the knob
    holder.updateMatrixWorld(true);
    const pinch=Pw('index_03_r').add(Pw('thumb_03_r')).multiplyScalar(.5);
    reach(extra.knobGrip?KNOB.clone().sub(pinch.sub(Pw('hand_r'))):KNOB.clone().addScaledVector(f2,-handLen*.8).add(new THREE.Vector3(0,-.05,0)),w,'r');   // the pinch sits above the wrist line
    knobTurn = turn * (w >= 1 ? 1 : 0);
    holder.updateMatrixWorld(true);knobDistance=Pw('index_03_r').add(Pw('thumb_03_r')).multiplyScalar(.5).distanceTo(KNOB);
    if(knobTurn>.5&&knobDistance<.035&&!ch.replaying)knobReceipt={seq:cur.seq,channel:cur.channel,turned:true};
  }
  // music at the TV (director's activities 'jazz' at the spots tv…tv5 and 'tvmusic' at the knob): standing plans in the gestures' clock.
  // Listening: start, loops, stop — each next loop chosen just before the join, the one nobody else at the TV plays then (jazz.js); the
  // plans of everybody on this page are in SH.jazz, on the common clock (tAbs). Turning the knob: crouch, turn, get up — once per decision.
  // Dancing (activity 'dance' at tv2, tv3, tv4 — the Charleston travels up to a metre): five swing dances, the same rule, no start or stop
  const TV_SEED = { tv: 0, tv2: 1, tv3: 2, tv4: 3, tv5: 4 }, MUSIC_ACT = new Set(['jazz', 'dance']);
  const jazzOthers = () => Object.entries(SH.jazz || {}).filter(([k]) => k !== ID).map(([, v]) => ({ t0: v.g.t0 + v.off, segs: v.g.segs }));
  function musicPlan() {
    const sp = (cur?.cmd || cur?.from)?.spot, at = sp && SPOTS[sp], hp = holderPose();
    if (!at || Math.hypot(hp.x - at.x, hp.z - at.z) > 0.4) return null;
    if (ch.activity === 'jazz' && sp in TV_SEED && GEST.jazz_start) {
      const off = ch.tAbs - ch.clk, g = jazzStart(ch.clk + off, 999, TV_SEED[sp], jazzOthers(), gDur, GX); g.t0 -= off; g.kind = 'stand'; g.act = 'jazz'; return g; }
    if (ch.activity === 'dance' && sp in TV_SEED && GEST.dance_crazylegs) {
      const off = ch.tAbs - ch.clk, g = jazzStart(ch.clk + off, 999, TV_SEED[sp], jazzOthers(), gDur, GX, DANCE); g.t0 -= off; g.kind = 'stand'; g.act = 'dance'; return g; }
    if (['tvmusic','heroine_tv_channel'].includes(ch.activity) && sp === 'tvKnob' && GEST.tv_crouch_down && ch.tvSeq !== cur.seq) {
      ch.tvSeq = cur.seq; const segs = []; let s = 0;
      for (const n of ['tv_crouch_down', 'tv_crouch_idle', 'tv_crouch_up']) { segs.push({ n, s, d: gDur(n) }); s += gDur(n) - GX; }
      return { t0: ch.clk, segs, T: s + GX, kind: 'stand', tv: true }; }
    return null;
  }
  function jazzOut(g, u) {                            // leaving the music: the loop he is in goes straight into the stop
    if (!g.jazz || g.jazz.done) return g;
    const i = g.segs.findIndex((a) => u >= a.s && u < a.s + a.d), segs = g.segs.slice(0, Math.max(0, i) + 1).map((a) => ({ ...a })), c = segs[segs.length - 1];
    c.d = Math.min(c.d, u - c.s + GX); if (!g.jazz.S?.stop) return { ...g, segs, T: u + 0.6, jazz: { ...g.jazz, done: true }, wrapped: true };   // a dance: eases into standing
    const d = gDur('jazz_stop');
    segs.push({ n: 'jazz_stop', s: u, d }); return { ...g, segs, T: u + d, jazz: { ...g.jazz, done: true }, wrapped: true };
  }
  function gestures() {
    if (!Object.keys(GEST).length) return;
    if(ch.activity==='sleep_desk'&&cur?.sleep){
      const sleepSeat=ch.seat&&SEATS[ch.seat],seatKind=sleepSeat?.desk?'desk':sleepSeat?.chair?'chair':'bench';
      const ready=ch.mode==='seated'&&sleepSeat&&(sleepProfile.seatKinds||['desk']).includes(seatKind)&&(!W.type||W.type.cur<.02)&&!sipping()&&!eating()&&!smoking?.active()&&!ch.wh;
      if(ready&&(!ch.g||ch.g.sleep)){
        if(ch.sleepLocal?.id!==cur.sleep.id)ch.sleepLocal={id:cur.sleep.id,startedAt:cur.sleep.poseStartedAt??ch.tAbs*1000,elapsedMs:0};
        const startedAt=cur.sleep.poseStartedAt??ch.sleepLocal.startedAt;
        ch.g=sleepPlan(cur.sleep,startedAt,ch.tAbs*1000,ch.clk,gDur,sleepProfile);ch.sleepVisual=ch.g;
      }
    }
    phoneCall();
    if(ch.g?.social && !cur?.social && !ch.g.wrapped) ch.g={...ch.g,wrapped:true};
    if(ch.g?.social && ch.g.turn && !ch.g.wrapped && !ch.hold) {
      const time=ch.socialAbs*1000,t=ch.g.turn;
      if(time<t.start || time>=t.end) ch.g=null;
      else ch.g.t0=ch.clk-Math.max(0,(time-t.start)/1000);
    }
    if (ch.g && !ch.g.sleep && ch.clk - ch.g.t0 >= ch.g.T) { if(ch.g.tv)ch.executionEnd={seq:cur.seq,activity:ch.activity,outcome:'completed',replayed:!!ch.replaying}; ch.g = null; if (ch.hold) { ch.hold = false; const q = ch.queue; ch.queue = null; if (q) command(q); } }
    const calmSeat = ch.mode === 'seated' && ch.seat && !typing() && !sipping() && !eating() && !smoking?.active() && (ch.activity==='conversation'||!G_BUSY.has(ch.activity));
    const kind = calmSeat ? (SEATS[ch.seat].desk||SEATS[ch.seat].chair ? 'desk' : 'bench')
      : ch.mode === 'idle' && !ch.seat && ch.speed === 0 && !smoking?.active() && ch.activity !== 'smoke' ? 'stand' : null;
    if (ch.g && !ch.g.sleep && !ch.g.phone && !(kind === ch.g.kind || (ch.mode === 'settle' && ch.g.kind !== 'stand'))) {   // something else took over:
      const u = ch.clk - ch.g.t0, i = ch.g.segs.findIndex((a, j) => j > 0 && /_stop$/.test(a.n));
      if (ch.mode === 'seated' && ch.g.kind !== 'stand' && i > 0 && u < ch.g.segs[i].s && !ch.g.wrapped) ch.g = { ...gWrap(ch.g, u), wrapped: true };   // a sequence goes out its own way (feet off the desk first)
      else if (!ch.g.wrapped) ch.g = null; }                                                                           // a single clip fades out
    if (ch.g?.jazz && ch.activity !== ch.g.act && !ch.g.wrapped) ch.g = jazzOut(ch.g, ch.clk - ch.g.t0);   // the music is over for him
    if (ch.g?.jazz && !ch.g.jazz.done) { const off = ch.tAbs - ch.clk, u = ch.clk - ch.g.t0; ch.g.t0 += off; jazzExtend(ch.g, u, jazzOthers(), gDur, GX); ch.g.t0 -= off; }
    if (SH.jazz) { if (ch.g?.jazz) SH.jazz[ID] = { g: ch.g, off: ch.tAbs - ch.clk }; else delete SH.jazz[ID]; }
    if (!ch.g && kind === 'stand' && cur && (MUSIC_ACT.has(ch.activity) || ['tvmusic','heroine_tv_channel'].includes(ch.activity))) { const g = musicPlan(); if (g) ch.g = g; }
    else if(!ch.g&&kind&&cur?.social&&socialLoaded&&!ch.queue&&!ch.hold&&socialAtGoal()) {
      ch.g=turnPlan(cur.social,ID,ch.socialAbs*1000,ch.clk,gDur);
      if(ch.g?.turn?.unavailableChoice&&ch.socialChoiceError!==ch.g.turn.choice?.key){ch.socialChoiceError=ch.g.turn.choice?.key;console.warn('conversation choice unavailable; distinct compatible continuation used',ID,ch.g.turn.choice?.style);}
      if(ch.g?.turn?.unavailable&&!ch.socialError){ch.socialError=true;console.warn('conversation has no compatible distinct speech animation',ID,cur.social.id);}
      if(ch.g?.selected)ch.socialKey=ch.g.key;
    }
    else if (!ch.g && kind && cur && !ch.blockedGoal && ch.activity!=='sleep_desk'&&ch.activity!=='conversation'&&ch.activity!=='read_wire'&&ch.activity!=='heroine_listen') {
      const slot = Math.floor(ch.clk / pausePools[kind].P), key = kind + '|' + cur.seq + '|' + slot;
      if (key !== ch.gKey) { let g = gPlan(kind, cur.seq, slot, ch.fatigue, gDur,pausePools);
        if (g && /^(feet|write)_/.test(g.segs[0].n) && !deskFreeForRest(SEATS[ch.seat].desk)) g = null;   // the feet and the pencil only on a cleared desk
        if (g && ch.clk >= g.t0 && ch.clk < g.t0 + 0.5) { ch.g = g; ch.gKey = key; } }
    }
    if(ch.g?.sleep)ch.motion=sleepText(ch.g.phase);
    const base = ch.g && (ch.g.base || (ch.g.kind === 'stand' ? 'stand_idle' : 'sit_idle'));
    const sampled = ch.g ? (ch.g.turn?sampleTurnPlan(ch.g,ch.clk-ch.g.t0):gSample(ch.g, ch.clk - ch.g.t0)) : { e: 0, w: {} },w=sampled.w;
    const e=ch.g?.turn?Math.min(1,Object.values(w).reduce((sum,v)=>sum+v[0],0)):sampled.e;
    for (const n in GEST) { const k = 'g_' + n, v = w[n];
      if(k===base) continue;
      if (v) { W[k].target = W[k].cur = v[0]; A[k].time = v[1]; }
      else if (W[k].target > 0 || W[k].cur > 0) { W[k].target = 0; W[k].rate = 1 / 0.4; } }
    feetChair(w);
    if (ch.g) { for (const k in W) if (!k.startsWith('g_') && k !== base) W[k].target = W[k].cur = 0;
      W[base].target = W[base].cur = 1 - e;
      if(base?.startsWith('g_')){const d=gDur(base.slice(2));A[base].time=((ch.socialAbs-ch.g.baseAt/1000)%d+d)%d;}
      const main = ch.g.segs.find((a) => !/_(start|stop)$/.test(a.n)) || ch.g.segs[0], lab = main && G_LABEL[main.n.replace(/_\d+$|_0\d$/, '')];
      if (lab && ch.mode !== 'settle') ch.motion = lab; if (ch.g.jazz) ch.motion = ch.g.act === 'dance' ? 'танцует' : 'слушает музыку'; if (ch.g.phone) ch.motion = 'говорит по телефону';if(ch.g.social)ch.motion=ch.g.turn?.role==='speaker'?'говорит собеседнику':ch.g.turn?.role==='listener'?'слушает собеседника':'ждёт начала разговора'; }
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
      feetO.set(0, 0, 0).addScaledVector(FEET_D1, -u1).addScaledVector(FEET_D2, -u2).multiplyScalar(extra.smokeProfile?.bodyScale||1);
    } else if (ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'trans') { const k = Math.max(0, 1 - dt / 0.6); feetO.multiplyScalar(feetO.lengthSq() < 1e-8 ? 0 : k); }
    body.position.copy(feetO);
  }
  function place(from, chairState, to, entry) {
    dining.near=false;dining.move=null;dining.goal=null;dining.contactClip=null;
    feetO.set(0, 0, 0); body.position.set(0, 0, 0);
    ch.blockedGoal=null;ch.benchWait=null;ch.hold=false;SH.setNative(ID,null);
    ch.mode = 'idle'; ch.seat = null; ch.trans = null; ch.sip = null; ch.g = null; ch.wh = null; if (lunch) lunch.end(); ch.queue = null; ch.chairTail = null; ch.path = null; ch.after = null; ch.speed = 0; ch.vis = 0;
    for (const g of [from, to]) { const d = g?.seat && (SEATS[g.seat]?.desk||SEATS[g.seat]?.chair); if (d && chairs[d]) { const v = chairState?.[d] ?? CHAIR_REST; setChair(d, v); chairs[d].plan = v; } }
    if (from?.seat && SEATS[from.seat]) { const s = SEATS[from.seat]; setHolder(s.pose); ch.seat = from.seat; ch.mode = 'seated'; ch.motion = 'сидит'; fadeTo(seatedLoop()); if (s.desk||s.chair) {const d=s.desk||s.chair;setChair(d,BACK);chairs[d].plan=BACK;} }
    else { const p = (from?.spot && SPOTS[from.spot]) || SPOTS.window; setHolder(p); ch.motion = 'стоит'; fadeTo('stand_idle'); }
    if(ID==='heroine'&&from?.seat==='diningChair')settleDining(!(entry?.activity==='sleep_desk'&&entry.sleep?.poseStartedAt));
    syncBoxes(); snapWeights();
    if (CR) CR.stand(ID, from?.seat && SEATS[from.seat] ? null : holderPose(),ch.tAbs);   // standing: an obstacle for the walkers; sitting: his chair or the bench already is
  }
  let cur = null, simT = 0;                          // current command and how far it has been played (s)
  const placeKey = (g) => (g ? g.seat || g.spot || null : null);
  const socialAtGoal=()=>{const g=cur?.cmd||cur?.from;return g?.seat?ch.mode==='seated'&&ch.seat===g.seat:g?.spot&&SPOTS[g.spot]&&dist(holderPose(),SPOTS[g.spot])<.35;};
  const readRequested = () => ch.activity==='read_wire' && (cur?.cmd||cur?.from)?.spot==='teletypeRead';
  const readPermitted = () => readRequested() && ch.mode==='idle' && !ch.seat && !ch.g && !ch.queue && !ch.hold && !ch.blockedGoal && ch.speed===0 && !smoking?.active() && !ch.wh && dist(holderPose(),SPOTS.teletypeRead)<.2;
  const itemFocus = () => readRequested() || !!ch.g?.phone || eating() || sipping() || !!smoking?.active() || !!ch.wh || !!ch.g?.tv || !!ch.g?.segs.some(a => /^(write_|feet_|.*(scratch|neck|doze|lean))/.test(a.n));
  const gazePlayer=extra.gaze?.attach(ID,Bn,holder,extra.social,()=>({free:['idle','seated'].includes(ch.mode)&&['wait','work','rest_desk','rest_lounge'].includes(ch.activity)&&!cur?.sleep&&!cur?.social&&!ch.queue&&!ch.hold&&!itemFocus()&&!ch.g&&!extra.talk?.wants(ID)}),extra.gazeProfile);
  function frame(dt, ff) {
    ch.clk += dt; ch.tAbs += dt; ch.socialAbs += dt; const adjustingDining=diningFrame(dt); if(!adjustingDining)updateChar(dt); if(!adjustingDining&&!trayController?.frame(cur,dt,!!ff||ch.replaying))nativeFrame(dt); stepWeights(dt);
    if(cur?.performance&&nativeState){const e=native[nativeState.id];performanceWitness.observe({id:cur.performance.id,seq:cur.seq,activity:ch.activity,duration:cur.performance.duration||e.clip.duration,t:(nativeState.offset||0)+nativeState.t,dt,rendered:!ff&&ch.frameRendered!==false,weight:Object.entries(A).filter(([k])=>k.startsWith('native_')).reduce((n,[,a])=>n+a.getEffectiveWeight(),0),music:extra.musicPlaying?.()===true});}
    if (smoking) smoking.pre(dt, smokeWant(), A);
    feetFrame(dt);
    { const d = ch.seat && SEATS[ch.seat].desk, M = d && mugL[d];                      // the left-hand mug follows the sip; before the first sip it stands at frame 1, after it at the last
      if (M && cur?.activity === 'smoke_coffee' && ch.mode === 'seated') { const s = smoking.sipTime(), t = s >= 0 ? s : smoking.sipsBefore(smoking.clockT()) > 0 ? M.D : 0;
        if (Math.abs(t - M.t) > 1e-6) { M.t = t; M.a.time = Math.min(t, M.D); M.m.update(0); M.off.position.copy(mugOffset(t)); } } }
    if (!ff) {
      if(typing()&&A.type?.getEffectiveWeight()>.5&&ch.mode==='seated'&&!ch.queue&&!ch.hold&&(cur?.cmd||cur?.from)?.seat===ch.seat)ch.moneyWorkMs=(ch.moneyWorkMs||0)+Math.min(.1,Math.max(0,dt))*1000;
      const t0 = A.type ? A.type.time : 0;
      reading.restore();
      if (IK) armRestore();
      mixer.update(dt);
      if (IK) { holder.updateMatrixWorld(true); armSave(); } extra.talk?.capture(ID,Bn); gazePlayer?.capture(); if (smoking) {smoking.post(dt);if(smoking.done()&&['smoke','smoke_coffee'].includes(ch.activity))ch.executionEnd={seq:cur?.seq,activity:ch.activity,outcome:'completed',replayed:!!ch.replaying};}
      { const d = ch.seat && SEATS[ch.seat].desk, M = d && mugL[d], st = smoking ? smoking.sipTime() : -1;      // the hand takes the mug back to where it stood
        const c = M && st >= 0 && cur?.activity === 'smoke_coffee' ? handFix(st) : null;
        if (c) smoking.ikL(c.applyMatrix3(new THREE.Matrix3().setFromMatrix4(M.g.matrix)).multiplyScalar(smoking.sipW())); }
      window.__ownerPhoneEmotion?.(ID,Bn,GEST,ch,cur);
      phonePost(); feetPost(); writePost(); knobPost(); diningPost();
      reading.update(dt,{requested:readRequested(),permitted:readPermitted(),elapsed:ch.clk});
      if (extra.talk) extra.talk.stage(ID, Bn, holder, !!cur?.sleep || typing() || eating() || sipping() || !!smoking?.active(), dt, !['idle','seated'].includes(ch.mode), itemFocus());   // invitations: look at each other, nod / shake
      if (lunch && lunch.active()) lunch.post(ch.lunchT, dt);
      if (mouth0) nudgeSips();
      nativePost();lidFrame(dt); hemFrame();
      if (A.type && tw && ch.seat && SEATS[ch.seat].desk && W.type.cur > 0.6) {     // a letter on every fingertip strike
        const t1 = A.type.time, d = CL.type.clip.duration;
        for (const k of TYPE_KEYS) if ((t1 >= t0 && k > t0 && k <= t1) || (t1 < t0 && (k > t0 || k <= t1))) tw.key(SEATS[ch.seat].desk);
      }
    }
  }
  function fastForward(sec, socialEnd) {
    extra.gaze?.reset(ID);
    ch.replaying=true;
    reading.reset(); // remove our pose before the mixer evaluates a different clock/clip
    extra.talk?.reset(ID);                         // late join / hidden tab: replay the command at 30 steps a second, draw once
    const n = Math.min(Math.round(sec * FPS), 90 * FPS);       // any walk + sit is over within 90 s
    ch.clk = simT + sec - n / FPS;                              // the gestures' clock ends where a live viewer's is
    // Social turns must include the skipped interval; navigation retains its own replay clock.
    if(Number.isFinite(socialEnd)) ch.socialAbs = socialEnd / 1000 - sec;
    ch.socialAbs += sec - n / FPS;
    for (let i = 0; i < n; i++) frame(1 / FPS, true);
    ch.replaying=false;simT += sec;
    if (ch.mode === 'trans') A[ch.trans.clip].time = ch.trans.t;
    snapWeights(); if (smoking) smoking.pre(0, smokeWant(), A); mixer.update(0); if (IK) { holder.updateMatrixWorld(true); armSave(); } holder.updateMatrixWorld(true); diningPost();nativePost();hemFrame();
  }
  function apply(w, serverNow) {                      // w = {seq, chars: {id: {seq, from, cmd, at, state, …}}, chairs} (or the old {seq, editor, state})
    if(ID==='heroine'&&w.trayDelivery===null&&cur?.activity!=='heroine_serve')nativeProps?.service?.clearDelivery();
    if(ID==='heroine'&&w.trayDelivery)nativeProps?.service?.restoreDelivery(w.trayDelivery);
    const e = w?.chars?.[ID] || (ID === 'columnist' || ID === 'editor' ? w?.editor : null); if (!e) return;
    if(trayController?.state&&!trayController.state.done&&cur&&((e.seq??w.seq)!==cur.seq||(e.activity||'')!==cur.activity)){trayPending=w;cur.service={...cur.service,cancelled:true};return;}
    // Finish the current native meal chain before accepting a later decision.
    // Keep its seq/activity until then so feedback cannot attribute eating to walking.
    if(cur&&lunch?.autoComplete&&lunch.active()&&!lunch.done(ch.lunchT)&&((e.seq??w.seq)!==cur.seq||(e.activity||'')!==cur.activity)){ch.lunchPending=w;return;}
    gazePlayer?.restore();
    if(!cur||cur.seq!==(e.seq??w.seq)||cur.activity!==(e.activity||''))extra.gaze?.reset(ID);
    reading.restore(); // restore before place/snapWeights/fastForward can evaluate mixer
    extra.talk?.reset(ID);
    { const st = e.state || (w.chars ? null : w.state), dn = st?.needs?.drunk; if (dn && Number.isFinite(st.at)) drunkSt = { v: +dn.v || 0, rate: +dn.rate || 0, at: st.at }; else if (st) drunkSt = null; }   // his own needs
    if(dining.move&&cur&&e.seq!==cur.seq){dining.pending=w;return;}
    if(ch.socialPending || (cur && ch.g?.social && !e.social)){ch.socialPending=w;if(cur)cur.social=null;if(ch.g)ch.g=finishTurnPlan(ch.g,ch.clk-ch.g.t0);return;}
    const eseq = e.seq ?? w.seq; if (cur && cur.seq === eseq) {if(cur.activity!==(e.activity||'')){ch.executionEnd=null;ch.lunchSeq=-1;}cur.social=e.social;cur.sleep=e.sleep;cur.performance=e.performance;cur.service=e.service;cur.meal=e.meal??null;cur.channel=e.channel;cur.activity=e.activity||'';cur.label=e.label||'';cur.source=e.source||'';ch.activity=cur.activity;if(!readRequested())reading.reset();return;}
    ch.sleepVisual=null;ch.sleepLocal=null;ch.executionEnd=null;ch.moneyWorkMs=0;performanceWitness.reset();
    if(ch.benchWait){ch.benchWait=null;ch.blockedGoal=null;SH.setNative(ID,null);}
    if(ch.g?.sleep)ch.g=null;
    reading.reset(); // a new command cannot report the previous reading as active
    SH.setStation(ID, (() => { const g = e.cmd || e.from; return g?.spot ? { spot: g.spot } : g?.seat&&SEATS[g.seat]?.chair?{chair:SEATS[g.seat].pose}:g?.seat && SEATS[g.seat] && !SEATS[g.seat].desk ? { bench: SEATS[g.seat].pose } : null; })());
    const elapsed = Math.max(0, (serverNow - e.at) / 1000);
    ch.work = e.activity ? e.activity === 'work' : /^(работает|правит)/.test(e.label || '');
    ch.title = (/«(.+)»/.exec(e.label || '') || [])[1] || '';
    ch.activity = e.activity || (ch.work ? 'work' : ''); ch.coffeeT = 0; ch.fatigue = +e.fatigue || 0;
    if (lunch?.active()) {                             // a dish in front of him is eaten to the end (a new decision waits); a finished one is cleared
      if (lunch.autoComplete || lunch.done(ch.lunchT)) { lunch.end(); ch.lunchT = 0; }
    } else ch.lunchT = 0;   // every decision starts its own coffee clock (live and late viewers alike)
    { const g = e.cmd?.seat || e.from?.seat; ch.goalDesk = g && SEATS[g] ? SEATS[g].desk : null; }
    // live viewer: he is already there (or on his way there) — go on from here; otherwise rebuild the start and catch up
    const dest = cur ? placeKey(cur.cmd || cur.from) : null;
    const serviceArrived=trayController?.state?.done&&e.from?.spot==='trayTable';
    const cont = cur && (dest === placeKey(e.from)||serviceArrived) && elapsed < 3;
    if (!(cont && ch.crowd)) ch.tAbs = e.at / 1000;     // his clock for the crowd: the command's time (the director's, the same for every viewer), then every frame
    ch.socialAbs = e.at / 1000;
    if (!cont) place(e.from, w.chairs, e.cmd, e);
    if (ch.g) ch.g.t0 -= ch.clk; ch.clk = 0;             // a gesture already running goes on; the new decision's slots count from zero
    cur = { channel:e.channel,service:e.service,performance:e.performance,meal:e.meal??null,sleep:e.sleep,social:e.social, seq: eseq, at: e.at, from: e.from, cmd: e.cmd, label: e.label || '', source: e.source || '', activity: e.activity || '' }; simT = 0;
    const g = goalOf(e.cmd);if(g?.point&&Number.isFinite(e.performance?.heading))g.point={...g.point,th:e.performance.heading}; if (g) command(g);
    else if(Number.isFinite(e.performance?.heading)&&ch.mode==='idle'&&!ch.seat){ch.after={type:'stand',face:e.performance.heading};ch.mode='turn';ch.speed=0;}
    else if(!e.social&&ch.mode==='idle'&&!ch.seat&&!ch.g&&!ch.hold&&e.from?.spot&&SPOTS[e.from.spot]&&dist(holderPose(),SPOTS[e.from.spot])<.35&&Math.abs(wrap(SPOTS[e.from.spot].th-holder.rotation.y))>deg(4)){ch.after={type:'stand',face:SPOTS[e.from.spot].th};ch.mode='turn';ch.speed=0;}
    if (!cont && elapsed > 0.05) fastForward(elapsed, serverNow);
  }
  function update(dt, serverNow, rendered=true) {
    ch.frameRendered=rendered;
    if(trayPending&&trayController.state?.done){const w=trayPending,e=w.chars[ID];trayPending=null;apply({...w,chars:{...w.chars,[ID]:{...e,from:{spot:'trayTable'},at:serverNow}}},serverNow);}
    if(ch.lunchPending&&!lunch.active()){const w=ch.lunchPending;ch.lunchPending=null;const e=w.chars?.[ID];apply(e?{...w,chars:{...w.chars,[ID]:{...e,at:serverNow}}}:{...w,editor:{...w.editor,at:serverNow}},serverNow);}
    if(ch.socialPending && !ch.g){const w=ch.socialPending;ch.socialPending=null;const e=w.chars?.[ID];apply(e?{...w,chars:{...w.chars,[ID]:{...e,at:serverNow}}}:w,serverNow);}
    if(cur?.social && ch.mode==='idle'&&!ch.seat) {
      const pose=extra.socialPartner?.(cur.social.partner);if(pose){const want=Math.atan2(pose.x-holder.position.x,pose.z-holder.position.z);holder.rotation.y=wrap(holder.rotation.y+THREE.MathUtils.clamp(wrap(want-holder.rotation.y),-dt*2.6,dt*2.6));}
    }
    { const t = drunkNow(serverNow || Date.now()) ? 1 : 0; ch.dk = (ch.dk || 0) + THREE.MathUtils.clamp(t - (ch.dk || 0), -dt / 1.5, dt / 1.5); }   // sobering / getting drunk: 1.5 s blend
    if (cur && serverNow) { const lag = (serverNow - cur.at) / 1000 - simT; if (lag > 1.5) fastForward(lag, serverNow - dt * 1000); ch.socialAbs = serverNow / 1000 - dt; }
    frame(dt, false); simT += dt;
    if(consumption.seq!==cur?.seq)consumption={seq:cur?.seq,kind:null,totalMs:0};
    if(ID==='heroine'&&!ch.replaying&&dt>0&&dt<.25){
      if(ch.activity==='heroine_coffee'&&nativeState?.seq===cur?.seq&&nativeProps?.coffee?.().sipContact){consumption.kind='coffee';consumption.totalMs=Math.min(1150,consumption.totalMs+dt*1000);}
      if(ch.activity==='whisky'&&ch.wh?.seq===cur?.seq&&extra.whiskySipContact?.(Bn)){consumption.kind='whisky';consumption.totalMs=Math.min(44/30*1000,consumption.totalMs+dt*1000);}
    }
    if(ch.sleepVisual?.phase==='asleep'&&ch.g?.sleep&&dt>0&&dt<.25&&A['g_'+sleepProfile.loop]?.getEffectiveWeight()>.9)ch.sleepLocal.elapsedMs+=dt*1000;
  }
  { const home = extra.home && SEATS[extra.home] ? extra.home : 'deskA'; ch.mode = 'idle'; setHolder(SEATS[home].pose); ch.seat = home; ch.mode = 'seated'; fadeTo('sit_idle'); snapWeights(); }   // until his first command comes
  function executionLabel() {
    const goal=cur?.cmd||cur?.from,atGoal=goal?.seat?ch.seat===goal.seat:goal?.spot&&SPOTS[goal.spot]&&dist(holderPose(),SPOTS[goal.spot])<0.35;
    const target=goal?.seat?({'deskA':'к столу A','deskB':'к столу B','deskC':'к столу C',benchS:'к скамье',benchM:'к скамье',benchN:'к скамье',diningChair:'к стулу у обеденного стола'}[goal.seat]||'к месту'):goal?.spot?.startsWith('tv')?'к телевизору':goal?.spot?.startsWith('window')?'к окну':goal?.spot?.startsWith('phone')?'к телефону':goal?.spot==='bar'?'к тумбе':(goal?.spot==='teletype'||goal?.spot==='teletypeRead')?'к телетайпу':'к месту';
    if(ch.activity==='heroine_serve'&&trayController?.state)return ch.blockedGoal?'ждёт свободный путь с подносом':ch.motion;
    if(ch.activity==='sleep_desk'&&ch.sleepVisual)return sleepText(ch.sleepVisual.phase);
    if(ch.benchWait)return ch.mode==='walk'?'отходит за скамью, освобождая проход':'ждёт освобождения прохода у скамьи';
    if(ch.blockedGoal)return 'ждёт свободный путь '+target;
    if(ch.hold)return ch.g?.jazz?'заканчивает '+(ch.g.act==='dance'?'танец':'слушать музыку')+' перед уходом':ch.g?.social?'заканчивает разговор перед уходом':ch.g?.tv?'поднимается от телевизора':ch.motion;
    if(ch.mode==='walk'||ch.mode==='turn')return 'идёт '+target;
    if(ch.mode==='trans'||ch.mode==='settle')return ch.motion;
    if(ch.activity==='heroine_tv_channel'&&atGoal)return ch.g?.tv?'переключает канал телевизора':'стоит у телевизора';
    if(ch.activity==='heroine_listen'&&atGoal)return extra.musicPlaying?.()?'слушает музыку':'ждёт музыку у телевизора';
    if(readRequested())return reading.status().ready?'читает ленту телетайпа':'стоит перед лентой телетайпа';
    if(atGoal&&['smoke','smoke_coffee'].includes(ch.activity)&&!smoking?.active())return ch.seat?(SEATS[ch.seat]?.desk?'сидит за столом '+SEATS[ch.seat].desk:'сидит на скамье'):'стоит';
    if(atGoal&&cur?.activity==='wait'&&goal?.spot==='teletype')return 'стоит у телетайпа';
    return cur?.social&&ch.g?.turn?ch.motion:atGoal?(cur?.label||ch.motion):ch.motion;
  }
  // Read-only audio witness after mixer, IK and prop placement. No commands or pose mutation.
  const audioFloor={l:Infinity,r:Infinity};
  // Foot joint floor heights measured on this rig's actual accepted walk clips.
  for(const audioClip of [WK.clip,DR?.clip].filter(Boolean)){
    smix.stopAllAction();const action=smix.clipAction(audioClip).reset().play();
    for(let t=0;t<audioClip.duration;t+=1/30){action.time=t;smix.update(0);sg.updateMatrixWorld(true);for(const side of ['l','r'])audioFloor[side]=Math.min(audioFloor[side],sclone.getObjectByName('foot_'+side).getWorldPosition(new THREE.Vector3()).y);}
    action.stop();
  }
  const audioLabels=new Map((extra.social?.entries||[]).map(e=>['g_'+socialAlias(e.id),e.animation||e.label||'']));
  const audioPoint=new THREE.Vector3();
  function audioState() {
    const actions={};for(const [name,a] of Object.entries(A)){const weight=a.getEffectiveWeight();if(weight>.05)actions[name]={time:a.time,duration:a.getClip().duration,weight};}
    const gy=n=>Bn[n]?(Bn[n].getWorldPosition(audioPoint),audioPoint.y):0;
    const left=Bn.hand_l?.getWorldPosition(new THREE.Vector3()),right=Bn.hand_r?.getWorldPosition(new THREE.Vector3());
    const activeNames=Object.keys(actions).filter(n=>actions[n].weight>.55);
    const clapNames=activeNames.filter(n=>/IDLE[_-](052|055)|HR_CLAP_(52|55)/.test(n));
    const gestureLabel=activeNames.map(n=>audioLabels.get(n)||n).join(' ');
    const meal=eating()?lunch.mix(ch.lunchT).find(x=>x.n&&x.w>.5):null;
    const turn=ch.g?.turn,u=ch.g?ch.clk-ch.g.t0:0;
    const phrase=turn?.phrases?.filter(x=>u>=x.at).at(-1);
    const desk=ch.seat&&SEATS[ch.seat]?.desk;
    const chairKey=ch.trans?.desk||ch.chairTail?.desk||desk||(ch.seat&&SEATS[ch.seat]?.chair);
    const chairNode=chairKey&&chairs[chairKey]?.node;
    const nativeVocal=nativeState&&/LAUGH|JOY|SURPRIS|FIST-PUMP/.test(nativeState.id)&&actions['native_'+nativeState.id]?.weight>.55;
    const phoneVocal=ch.g?.phone&&activeNames.some(n=>/^g_(stand_)?phone_0[123]$/.test(n));
    return {id:ID,seq:cur?.seq??null,time:ch.clk,rendered:ch.frameRendered!==false,replaying:!!ch.replaying,
      x:holder.position.x,z:holder.position.z,actions,typing:typing()&&ch.mode==='seated',
      writing:desk&&writing?writing.audio(desk):null,
      walking:ch.mode==='walk'||ch.mode==='trans',feet:{l:gy('foot_l'),r:gy('foot_r')},footFloor:audioFloor,
      palms:left&&right?left.distanceTo(right):Infinity,clapping:clapNames.length>0,clapVariant:clapNames.some(n=>/055|CLAP_55/.test(n))?'b':'a',
      chair:chairNode?{key:chairKey,position:chairNode.getWorldPosition(new THREE.Vector3()).toArray()}:null,cupLift:desk&&coffee?.lift?coffee.lift(desk):null,
      pouring:!!nativeProps?.audio?.().pouring||(ch.wh?.kind==='bar'&&WR?.bar?.phase.filter(x=>x[0]<=ch.wh.t*WR.fps).at(-1)?.[1]==='pour'),
      brushing:activeNames.some(n=>/feet_brush|IDLE_040/.test(n)),
      meal:meal?{name:meal.n,index:meal.i,frame:meal.lt*30+1,weight:meal.w}:null,
      vocal:nativeVocal?{key:'native:'+cur.seq+':'+nativeState.id,index:cur.seq,role:'speaker',active:true,elapsed:nativeState.t,style:nativeState.id}:phoneVocal?{key:'phone:'+cur.seq,index:cur.seq,role:'speaker',active:true,elapsed:u,style:'talk'}:null,
      speech:turn&&cur?.social&&!ch.g.wrapped?{key:turn.id+':'+turn.index+':'+(phrase?.at||0),index:turn.index,role:turn.role,
        active:ch.activity==='conversation'&&socialAtGoal()&&!ch.hold&&!ch.queue&&!turn.unavailable&&ch.socialAbs*1000<turn.speechEnd&&Object.keys(actions).some(n=>n.startsWith('g_')&&actions[n].weight>.5),
        elapsed:Math.max(0,u-(phrase?.at||0)),intent:turn.context?.intent,style:(phrase?.style||turn.choice?.style||'')+' '+gestureLabel}:null};
  }
  return {
    audioState,
    performancePose:()=>{if(!cur?.performance||!nativeState)return null;const e=native[nativeState.id];return {id:cur.performance.id,seq:cur.seq,activity:ch.activity,duration:cur.performance.duration||e.clip.duration,t:(nativeState.offset||0)+nativeState.t,weight:Object.entries(A).filter(([k])=>k.startsWith('native_')).reduce((n,[,a])=>n+a.getEffectiveWeight(),0),music:extra.musicPlaying?.()===true};},
    id: ID, faceAxis:[...(extra.faceAxis||[0,-1,0])], apply, update, holder, nativeGroups:nativeProps?[nativeProps.group]:[],
    conversationStatus:()=>{const t=ch.g?.turn;if(!t||!cur?.social||ch.g.wrapped)return null;const partner=extra.socialPartner?.(cur.social.partner);return {conversationId:t.id,turn:t.index,at:t.start,revision:t.index,role:t.role,speaker:t.speaker,listener:t.listener,phase:ch.socialAbs*1000<t.speechEnd?'gesture':'pause',source:t.source,targetActor:cur.social.partner,targetFace:partner?.face||null};}, SEATS, nav, chairs, fx: smoking ? smoking.fx : null, root,
    mugs: [], lunchGroup: lunch ? lunch.group : null, writeGroups: writing ? writing.groups : [], knobTurn: () => knobTurn,
    moving: () => !!dining.move || ch.mode === 'walk' || ch.mode === 'turn' || ch.mode === 'trans' || !!ch.chairTail || !!smoking?.active() || sipping() || eating() || !!ch.g || ringing || !!ch.wh,
    socialStatus: () => {
      holder.updateMatrixWorld(true);const l=Bn.thigh_l.getWorldPosition(new THREE.Vector3()),r=Bn.thigh_r.getWorldPosition(new THREE.Vector3());
      const goal=cur?.cmd||cur?.from;const atGoal=ch.activity==='heroine_serve'&&trayController?.state?true:goal?.seat?ch.seat===goal.seat:!!goal?.spot&&!!SPOTS[goal.spot]&&dist(holderPose(),SPOTS[goal.spot])<0.35;
      const physicallyActing=ch.activity==='heroine_serve'?!!trayController?.state:ch.activity==='work'?typing()&&A.type?.getEffectiveWeight()>.5:ch.activity==='coffee'?sipping():ch.activity==='smoke_coffee'?!!smoking?.active():ch.activity==='sleep_desk'?ch.sleepVisual?.phase==='asleep'&&A['g_'+sleepProfile.loop]?.getEffectiveWeight()>.9:ch.activity==='heroine_tv_channel'?!!ch.g?.tv:ch.activity==='heroine_listen'?extra.musicPlaying?.()===true&&['tv','tv2','tv3','tv4','tv5'].includes(goal?.spot)&&ch.mode==='idle':(ch.activity?.startsWith('her:')||ch.activity?.startsWith('heroine_'))?!!nativeState&&nativeState.t<native[nativeState.id].clip.duration:ch.activity==='read_wire'?reading.status().ready:ch.activity==='smoke'?!!smoking?.active():ch.activity==='lunch'?eating()&&Object.keys(W).some(k=>k.startsWith('L')&&A[k]?.getEffectiveWeight()>.5):ch.activity==='whisky'?!!ch.wh:ch.activity==='phone'?!!ch.g?.phone:true;
      const forward=new THREE.Vector3(0,1,0).cross(new THREE.Vector3(r.x-l.x,0,r.z-l.z).normalize());
      const meals=lunch?(lunch.availableSelections?.()||availableMeals(extra.lunchDishes||DISHES)):[];
      return {tvSwitchAvailable:!!GEST.tv_crouch_down&&!!GEST.tv_crouch_idle&&!!GEST.tv_crouch_up,tvSwitchDistance:knobDistance,tvSwitch:knobReceipt?.seq===cur?.seq?knobReceipt:null,phone:phoneStatus(),smokingAvailable:!!smoking,smoking:smoking?{...smoking.status(),seq:cur?.seq}:null,serviceDurations:trayController?Object.fromEntries(['HER-POUR','HER-TRAY-PICK','HER-TRAY-PUT'].map(id=>[id,native[id].clip.duration])):null,serviceReady:!!trayController&&nativeProps.service.available(),serviceDelivery:nativeProps?.service?.delivered(),serviceWitness:trayController?.snapshot(),consumptionAvailable:ID==='heroine'?[...(native['HER-COFFEE-R']&&nativeProps?.coffee?.().available?['heroine_coffee']:[]),...(extra.whiskyBarOnly&&A.wh_bar&&WP?.barReady?['whisky']:[])]:[],consumption:ID==='heroine'?{...consumption,kind:ch.activity==='heroine_coffee'?'coffee':ch.activity==='whisky'?'whisky':null}:null,performanceDurations:Object.fromEntries(Object.values(native).filter(e=>['heroine_dance1','heroine_dance2','heroine_pose1','heroine_love1'].includes(e.activity)).map(e=>[e.activity,e.clip.duration])),performanceWitness:performanceWitness.snapshot(),meals,mealDurations:Object.fromEntries(meals.map(id=>[id,lunch.mealDuration?.(selectMeal(id,0,extra.lunchDishes||DISHES).dish,id)])),moneyWitness:1,moneyWorkMs:ch.moneyWorkMs||0,executionEnd:atGoal&&ch.executionEnd?.seq===cur?.seq&&ch.executionEnd.activity===ch.activity&&['idle','seated'].includes(ch.mode)&&!ch.queue?ch.executionEnd:null,sleepAvailable:deskSleepAvailable(gDur,sleepProfile),sleep:ch.sleepVisual?{id:ch.sleepVisual.sleepId,phase:!diningReady()&&ch.sleepVisual.phase==='done'?'waking':ch.sleepVisual.phase,poseStartedAt:ch.sleepVisual.startedAt,elapsedMs:ch.sleepLocal?.elapsedMs||0}:null,activity:ch.activity,executing:diningReady()&&atGoal&&physicallyActing&&!!cur&&!ch.socialPending&&!ch.g?.social&&!ch.queue&&(ch.mode==='idle'||ch.mode==='seated'||ch.mode==='whisky'&&extra.whiskyBarOnly),seq:cur?.seq,conversationId:cur?.social?.id,loaded:socialLoaded||ID==='heroine'&&Object.keys(native).length>0,expression:(()=>{const t=ch.g?.turn,c=t?.choice;if(t?.role!=='speaker'||ch.g?.wrapped||!c?.intentEventId||!cur?.social||cur.social.intent?.revision!==c.intentRevision)return null;const style=extra.social.styles.find(s=>s.id===c.style),names=style?.entries.map(socialAlias)||[];if(!names.some(n=>A['g_'+n]?.getEffectiveWeight()>=.5))return null;return {id:c.intentEventId,intentRevision:c.intentRevision,intent:c.intent,style:c.style};})(),mode:ch.mode,seat:ch.seat,diningChairClear:(()=>{const b=diningChairAvoidanceBox(),x=holder.position.x,z=holder.position.z;return ch.seat!=='diningChair'&&!(ch.mode==='trans'&&ch.trans?.desk==='D')&&ch.chairTail?.desk!=='D'&&(x<b[0]-RADIUS||x>b[2]+RADIUS||z<b[1]-RADIUS||z>b[3]+RADIUS);})(),readingAvailable:reading.available,profiles:socialLoaded?(extra.social.profiles||['stand','teletype-standing',...(GEST.sit_idle_02&&GEST[socialAlias('talk-seated/SEAT-146')]?['desk-front']:[]),...(GEST.sit_idle_02&&GEST.tbl_to_chair&&GEST.chair_to_tbl&&GEST[socialAlias('talk-seated/SEAT-024')]?['bench-left','bench-right']:[])]):[],ready:diningReady()&&socialLoaded&&!!cur?.social&&!!ch.g?.social&&!ch.g?.turn?.unavailable&&socialAtGoal()&&ch.activity==='conversation'&&(ch.mode==='idle'||ch.mode==='seated')&&!ch.queue&&!ch.hold&&!smoking?.active()&&!sipping()&&!eating()&&!ch.wh,
        x:holder.position.x,z:holder.position.z,ax:new THREE.Vector3(...(extra.faceAxis||[0,-1,0])).applyQuaternion(Bn.head.getWorldQuaternion(new THREE.Quaternion())).x,az:new THREE.Vector3(...(extra.faceAxis||[0,-1,0])).applyQuaternion(Bn.head.getWorldQuaternion(new THREE.Quaternion())).z,fx:forward.x,fz:forward.z,styles:socialLoaded?extra.social.styles.map(x=>x.id):[]};
    },
    status: () => ({diningChair:ID==='heroine'?{near:dining.near,moving:dining.move?.near??null}:null,sleep:ch.sleepVisual?{id:ch.sleepVisual.sleepId,phase:ch.sleepVisual.phase,elapsedMs:ch.sleepLocal?.elapsedMs||0}:null,reading:reading.status(), id: ID, activity: cur?.activity || '', label: executionLabel(), commandLabel:cur?.label||'', blocked:!!ch.blockedGoal, motion: ch.motion, gesture: ch.g ? ch.g.segs.map((a) => a.n).join('+') : null, phone:phoneStatus(),mode: ch.mode, seat: ch.seat, source: cur?.source || '', smoke: smoking ? smoking.status() : null, lunch: lunch ? { dish: lunch.dish(), seat: lunch.seat(), t: +ch.lunchT.toFixed(2) } : null, coffee: coffee ? { t: +ch.coffeeT.toFixed(2), sip: ch.sip === null ? null : +ch.sip.toFixed(2), w: W.drink ? +W.drink.cur.toFixed(2) : 0 } : null, whisky: ch.wh ? { kind: ch.wh.kind, t: +ch.wh.t.toFixed(2) } : null, drunk: +(ch.dk || 0).toFixed(2) }),
    debug: { ch, CL, A, W, mixer, SEATS, comp, trajAt, setHolder, snapWeights, command: (g) => command(goalOf(g) || g), place, entryOptions, exitOptions, holderPose, NATIVE: () => NATIVE, smoking, lunch },
  };
}
