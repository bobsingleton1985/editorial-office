// Smoking in the office — the approved «Курилка» page (v9 seated, v11 standing) moved onto the office character.
//  · standing (at a spot): the MoCap Central Idles series as is, full body over the standing idle;
//  · seated at a desk: the body keeps the seated idle, the right arm comes from the series (the left one while lighting up),
//    the hand is taken to the mouth and to the trouser pocket by two-bone IK on the fly and kept off the desk top.
// One cigarette: take out → light → hold → drag → flick → drag → look round → drag → finish (the cigarette just disappears
// from the fingers, owner's decision), a short pause, the next one — for as long as the director keeps him smoking.
// Everything is driven by the smoking clock (seconds since he started), so every viewer — and a late one — sees the same.
// Lengths in the approved page are pack metres; here the character is scaled by S, so every length is multiplied by U.
import * as THREE from 'three';
import { W_MOUTH } from './smoke-data.js';

const FPS = 30, XF = 0.35, IN = 0.4;
const SEQ = ['smoke_start', 'smoke_light', 'smoke_hold', 'smoke_inhale1', 'smoke_flick', 'smoke_inhale2', 'smoke_look1', 'smoke_inhale3', 'smoke_stop'];
const INFO = {
  smoke_start: { inhale: [] }, smoke_light: { inhale: [[66, 111]], litFrom: 100 }, smoke_hold: { inhale: [] },
  smoke_inhale1: { inhale: [[32, 84]] }, smoke_inhale2: { inhale: [[16, 66]] }, smoke_inhale3: { inhale: [[20, 69]] },
  smoke_flick: { inhale: [], ash: [16, 31] }, smoke_look1: { inhale: [] }, smoke_stop: { inhale: [], outAt: 71 }, smoke_stop_end: { inhale: [] },
};
const CIG_OUT = 71, STOP_CUT = 71, STOP_END = 150;          // Stop: the fingers open at 71 (cigarette gone); standing: from there into the clip's calm ending 150–182 (no stamping)
const REST = { stand: 2.5, sit: 3.5 };
const TABLE = { x0: -0.91, x1: 0.91, z0: 0.14, z1: 0.90, top: 0.762, gap: 0.012 };   // pack table in its own frame (pack metres)
const HAND_PTS = { r: ['hand_r', 'index_03_r', 'middle_03_r', 'ring_03_r', 'pinky_03_r', 'thumb_03_r', 'index_01_r', 'pinky_01_r'],
  l: ['hand_l', 'index_03_l', 'middle_03_l', 'ring_03_l', 'pinky_03_l', 'thumb_03_l', 'index_01_l', 'pinky_01_l'] };
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const hump = (f, a, b, c, d) => (f < a || f > d ? 0 : f < b ? smooth((f - a) / (b - a)) : f <= c ? 1 : 1 - smooth((f - c) / (d - c)));
// seated the hand travels further to the mouth: widen each weight by 10 frames on both sides so the IK eases in
const W_SEAT = {};
for (const [n, a] of Object.entries(W_MOUTH)) W_SEAT[n] = a.map((_, i) => { let m = 0; for (let k = -10; k <= 10; k++) { const v = a[i + k]; if (v) m = Math.max(m, v * smooth(1 - Math.abs(k) / 11)); } return m; });
const wAt = (T, clip, f) => { const a = T[clip === 'smoke_stop_end' ? 'smoke_stop' : clip]; if (!a) return 0; const x = Math.max(0, Math.min(a.length - 1, f - 1)), i = Math.floor(x), t = x - i; return a[i] * (1 - t) + a[Math.min(i + 1, a.length - 1)] * t; };

export function createSmoking({ scene, root, B, mixer, U, addon, strip, camera, renderer }) {
  // ---------- props from the add-on onto the office character
  const find = (s) => { let r = null; addon.scene.traverse((o) => { if (!r && o.name.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === s) r = o; }); return r; };
  const N = { cig: find('smpropcigarette'), tip: find('smktip'), mouth: find('smkmouth'), fwd: find('smkmouthfwd'), lighter: find('smproplighter'), flame: find('smproplighterflame') };
  for (const k of ['cig', 'lighter', 'flame']) { root.add(N[k]); N[k].visible = false; }           // same place relative to the rig as in the pack scene
  for (const k of ['mouth', 'fwd']) B.head.add(N[k]);                                              // they hang on the head bone there too
  N.cig.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  let emberMat = null; N.cig.traverse((o) => { if (o.isMesh && /Cig_03/.test(o.material.name)) { o.material = o.material.clone(); emberMat = o.material; } });
  N.lighter.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  N.flame.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0xffb25a, transparent: true, opacity: 0.9 }); o.castShadow = false; o.frustumCulled = false; } });
  const cigScale0 = N.cig.scale.clone();

  // ---------- clips: standing — the whole body (root motion kept to the first frame), seated — only the arms
  const armR = new Set(), armL = new Set(); B.clavicle_r.traverse((o) => { if (o.isBone) armR.add(o.name); }); B.clavicle_l.traverse((o) => { if (o.isBone) armL.add(o.name); });
  const boneOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName;
  const clean = (c) => { const x = c.clone(); x.tracks = x.tracks.filter((t) => B[boneOf(t)] || boneOf(t) === B.pelvis.parent.name); return x; };   // only what the office skeleton has
  const sub = (clip, keep, suffix) => new THREE.AnimationClip(clip.name + suffix, clip.duration, clip.tracks.filter((t) => keep(boneOf(t))));
  const raw = {}; for (const c of addon.animations) raw[c.name] = c;
  const A = {}, D = {};
  const act = (clip) => { const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.setEffectiveWeight(0); return a; };
  for (const n of SEQ) {
    const c = clean(raw[n]); D[n] = c.duration;
    A['st_' + n] = act(strip('st_' + n, c, 'first').clip);
    A['ovR_' + n] = act(sub(c, (b) => armR.has(b), '_ovR')); A['ovL_' + n] = act(sub(c, (b) => armL.has(b), '_ovL'));
  }
  { const e = THREE.AnimationUtils.subclip(raw.smoke_stop, 'smoke_stop_end', STOP_END - 1, 182, FPS); const c = clean(e); D.smoke_stop_end = c.duration; A.st_smoke_stop_end = act(strip('st_stop_end', c, 'first').clip); }
  let sitParts = null;                                            // the seated idle cut into body / right arm / left arm (set by the editor)
  // «курит и пьёт» (approved «Курилка» v8): a sip with the left hand (mirrored DrinkL) at the start of each "hold" — the mouth is free there
  let drinkL = null;
  function setDrinkL(core, L) { drinkL = { core: act(core), L: act(L), D: core.duration }; }
  function setSitBase(clip) { sitParts = { core: act(sub(clip, (b) => !armR.has(b) && !armL.has(b), '_core')), R: act(sub(clip, (b) => armR.has(b), '_R')), L: act(sub(clip, (b) => armL.has(b), '_L')) }; }

  // ---------- measured once from the standing clips (with their own prop tracks): pockets, lighter in the hand
  const wpos = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);
  const pinch = (s) => wpos(B['index_02_' + s]).add(wpos(B['middle_02_' + s])).add(wpos(B['thumb_03_' + s])).multiplyScalar(1 / 3);
  const K = {};
  { const own = new Set(Object.values(N).map((o) => o.name)), probeClip = {};
    for (const n of ['smoke_start', 'smoke_light']) { const c = raw[n].clone(); c.tracks = c.tracks.filter((t) => B[boneOf(t)] || own.has(boneOf(t)) || boneOf(t) === B.pelvis.parent.name); probeClip[n] = c; }
    const probe = (name, frame, fn) => { const a = mixer.clipAction(probeClip[name]); a.reset().play(); a.setEffectiveWeight(1); a.time = (frame - 1) / FPS; mixer.update(0); root.updateMatrixWorld(true); const r = fn(); a.stop(); mixer.uncacheAction(probeClip[name]); return r; };
    const toB = (n, v) => B[n].worldToLocal(v.clone());
    const saved = mixer._actions.filter((a) => a.isRunning()).map((a) => [a, a.getEffectiveWeight()]); saved.forEach(([a]) => a.setEffectiveWeight(0));
    K.pocketRt = probe('smoke_start', 14, () => toB('thigh_r', pinch('r')));
    K.pocketL1t = probe('smoke_light', 17, () => toB('thigh_l', pinch('l')));
    K.pocketL2t = probe('smoke_light', 139, () => toB('thigh_l', pinch('l')));
    probe('smoke_light', 91, () => {
      const ws = N.lighter.getWorldScale(new THREE.Vector3());
      K.lighterOff = new THREE.Matrix4().copy(B.hand_l.matrixWorld).invert().multiply(N.lighter.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1 / ws.x, 1 / ws.y, 1 / ws.z)));
      K.hoodLocal = wpos(N.flame).applyMatrix4(new THREE.Matrix4().copy(B.hand_l.matrixWorld).multiply(K.lighterOff).invert());
    });
    saved.forEach(([a, w]) => a.setEffectiveWeight(w));
    K.lighterScale = N.lighter.scale.clone();
  }

  // ---------- smoke particles, ember glow, lights (world space)
  const fx = new THREE.Group(); fx.name = 'SMOKE fx'; scene.add(fx);
  const NP = 1400, pos = new Float32Array(NP * 3), size = new Float32Array(NP), alpha = new Float32Array(NP), P = []; for (let i = 0; i < NP; i++) P.push({ live: false });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const smokeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uPPU: { value: 100 }, uColor: { value: new THREE.Color(0.86, 0.87, 0.9) } },
    vertexShader: 'uniform float uPPU;attribute float aSize;attribute float aAlpha;varying float vA;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPPU;vA=aAlpha;}',
    fragmentShader: 'uniform vec3 uColor;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.05,length(c));a=a*a*vA;if(a<.003)discard;gl_FragColor=vec4(uColor,a);}' });
  const pts = new THREE.Points(geo, smokeMat); pts.frustumCulled = false; fx.add(pts);
  let spawnIdx = 0;
  function spawn(p0, v, life, s0, s1, a0, kind) {
    for (let k = 0; k < NP; k++) { const i = (spawnIdx + k) % NP; if (!P[i].live) { spawnIdx = i + 1; Object.assign(P[i], { live: true, p: p0.clone(), v: v.clone(), age: 0, life, s0, s1, a0, kind, seed: Math.random() * 6.28 }); return; } }
  }
  let liveN = 0;
  function stepParticles(dt) {
    let n = 0;
    for (let i = 0; i < NP; i++) { const q = P[i];
      if (!q.live) { alpha[i] = 0; size[i] = 0; continue; }
      q.age += dt; if (q.age >= q.life) { q.live = false; alpha[i] = 0; continue; }
      const t = q.age / q.life;
      if (q.kind === 'exhale') { q.v.multiplyScalar(Math.exp(-1.7 * dt)); q.v.y += 0.07 * U * dt; }
      else if (q.kind === 'ash') q.v.y -= 2.5 * U * dt;
      else { q.v.multiplyScalar(Math.exp(-0.4 * dt)); q.v.y += 0.03 * U * dt; }
      const sway = q.kind === 'ash' ? 0 : Math.sin(q.age * 2.6 + q.seed) * 0.018 * U * (0.3 + t);
      q.p.addScaledVector(q.v, dt); q.p.x += sway * dt; if (q.kind !== 'ash') q.p.z += Math.cos(q.age * 2.1 + q.seed) * 0.012 * U * dt;
      pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
      size[i] = q.kind === 'ash' ? q.s0 : q.s0 + (q.s1 - q.s0) * Math.sqrt(t);
      alpha[i] = q.kind === 'ash' ? q.a0 * (1 - t) : q.a0 * Math.min(1, t / 0.12) * (1 - t) * (1 - t); n++;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
    pts.visible = n > 0; liveN = n;
  }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,200,120,1)'); r.addColorStop(0.3, 'rgba(255,110,40,.7)'); r.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.visible = false; fx.add(glow);
  const emberLight = new THREE.PointLight(0xff6a2a, 0, 0.4 * U, 2), flameLight = new THREE.PointLight(0xffa24a, 0, 0.9 * U, 2); fx.add(emberLight, flameLight);
  const LI = U * U;                                              // same brightness at the scaled distances

  // ---------- IK and the cigarette rule (unchanged from the approved page, lengths × U)
  const _v = [...Array(8)].map(() => new THREE.Vector3()), _q = [...Array(6)].map(() => new THREE.Quaternion());
  function setWorldQuat(bone, qw) { const pq = bone.parent.getWorldQuaternion(_q[5]).invert(); bone.quaternion.copy(pq.multiply(qw)); bone.updateMatrixWorld(true); }
  function ik(s, delta) {
    if (delta.lengthSq() < 1e-10 * U * U) return;
    const up = B['upperarm_' + s], lo = B['lowerarm_' + s], ha = B['hand_' + s];
    const S0 = wpos(up, _v[0]), E = wpos(lo, _v[1]), Wr = wpos(ha, _v[2]), hq = ha.getWorldQuaternion(_q[0]).clone();
    const l1 = E.distanceTo(S0), l2 = Wr.distanceTo(E), Wn = _v[3].copy(Wr).add(delta); let Dd = Math.min(Wn.distanceTo(S0), l1 + l2 - 1e-4 * U);
    const u = _v[4].copy(Wn).sub(S0).normalize(), p = _v[5].copy(E).sub(S0); p.addScaledVector(u, -p.dot(u)).normalize();
    const al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + Dd * Dd - l2 * l2) / (2 * l1 * Dd))));
    const En = _v[6].copy(S0).addScaledVector(u, l1 * Math.cos(al)).addScaledVector(p, l1 * Math.sin(al)); Wn.copy(S0).addScaledVector(u, Dd);
    setWorldQuat(up, _q[2].copy(_q[1].setFromUnitVectors(_v[7].copy(E).sub(S0).normalize(), En.clone().sub(S0).normalize())).multiply(up.getWorldQuaternion(_q[3])));
    const E2 = wpos(lo, new THREE.Vector3()), W2 = wpos(ha, new THREE.Vector3());
    setWorldQuat(lo, _q[2].copy(_q[1].setFromUnitVectors(W2.sub(E2).normalize(), Wn.clone().sub(E2).normalize())).multiply(lo.getWorldQuaternion(_q[3])));
    setWorldQuat(ha, hq);
  }
  function fingerFrame() {
    const i2 = wpos(B.index_02_r), i3 = wpos(B.index_03_r), m2 = wpos(B.middle_02_r), m3 = wpos(B.middle_03_r);
    const im = i2.clone().lerp(i3, 0.6), mm = m2.clone().lerp(m3, 0.6), G = im.clone().add(mm).multiplyScalar(0.5);
    const fd = i3.clone().sub(i2).normalize().add(m3.clone().sub(m2).normalize()).normalize();
    const ac = mm.clone().sub(im); ac.addScaledVector(fd, -ac.dot(fd)).normalize();
    return { G, fd, n: new THREE.Vector3().crossVectors(fd, ac).normalize() };
  }
  function mouthAxis() { const m = wpos(N.mouth), f = wpos(N.fwd).sub(m).normalize(), up = new THREE.Vector3(0, 1, 0); up.addScaledVector(f, -up.dot(f)).normalize(); return { m, aa: f.clone().addScaledVector(up, -0.18).normalize() }; }
  const tmpM = new THREE.Matrix4();
  function placeCig(wm) {
    const { G, fd, n } = fingerFrame(), { aa } = mouthAxis();
    const y = n.clone().lerp(aa.clone().negate(), wm).normalize(), g = (0.015 + 0.015 * wm) * U;
    const Y = fd.clone().addScaledVector(y, -fd.dot(y)).normalize(), Z = y.clone().negate(), X = new THREE.Vector3().crossVectors(Y, Z);
    tmpM.makeBasis(X, Y, Z).setPosition(G.clone().addScaledVector(y, g - 0.05 * U));
    new THREE.Matrix4().copy(N.cig.parent.matrixWorld).invert().multiply(tmpM).decompose(N.cig.position, N.cig.quaternion, new THREE.Vector3());
    N.cig.scale.copy(cigScale0); N.cig.updateMatrixWorld(true);
  }
  function fromThigh(s, v) {               // a trouser pocket moves with the thigh; seated it is turned halfway to the top of the thigh
    const T = B['thigh_' + s], Pp = T.localToWorld(v.clone()), H = wpos(T), d = wpos(B['calf_' + s]).sub(H).normalize();
    const Ax = H.clone().addScaledVector(d, Pp.clone().sub(H).dot(d)), r = Pp.clone().sub(Ax), len = r.length(), up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
    if (up.lengthSq() < 1e-6 || len < 1e-6) return Pp; return Ax.addScaledVector(r.normalize().add(up.normalize()).normalize(), len);
  }
  function lighterPose(tipW) {             // lighter in the left hand, flame from its hood towards the tip
    const LW = B.hand_l.matrixWorld.clone().multiply(K.lighterOff);
    new THREE.Matrix4().copy(N.lighter.parent.matrixWorld).invert().multiply(LW).decompose(N.lighter.position, N.lighter.quaternion, new THREE.Vector3()); N.lighter.scale.copy(K.lighterScale); N.lighter.updateMatrixWorld(true);
    return LW;
  }
  // desk top: lift the hand over it or take it back past the front edge, whichever is shorter (spring, no jolts)
  const tl = { r: { x: new THREE.Vector3(), v: new THREE.Vector3() }, l: { x: new THREE.Vector3(), v: new THREE.Vector3() } };
  function tableLift(s, desk, extra, dt) {
    const Minv = desk.inv, v = new THREE.Vector3(); let Uu = 0, Kk = 0;
    const test = (pw) => { const p = pw.clone().applyMatrix4(Minv), pen = TABLE.top + TABLE.gap - p.y, inZ = p.z - TABLE.z0 + 0.03; if (pen <= 0 || inZ <= 0) return;   // 3 cm ahead of the edge already counts: the hand is taken back before it gets there
      const w = smooth((Math.min(p.x - TABLE.x0, TABLE.x1 - p.x, TABLE.z1 - p.z) + 0.02) / 0.04) * (1 - smooth((pen - 0.11) / 0.05)); Uu = Math.max(Uu, pen * w); Kk = Math.max(Kk, inZ * w); };
    HAND_PTS[s].forEach((n) => { if (B[n]) test(wpos(B[n], v)); }); (extra || []).forEach(test);
    const t = smooth((Kk - Uu) / 0.03 + 0.5), T = tl[s], w = 26, e = Math.exp(-w * dt);
    // taken back past the front edge with 3 cm to spare (see test above), so the cigarette's end does not stick into the edge (bench, v50)
    const back = Kk;
    const c = new THREE.Vector3(0, Uu * t, -back * (1 - t)), y0 = T.x.clone().sub(c), k = T.v.clone().addScaledVector(y0, w);
    T.x.copy(c).add(y0.addScaledVector(k, dt).multiplyScalar(e)); T.v.addScaledVector(k, -w * dt).multiplyScalar(e);
    if (T.x.lengthSq() > 1e-10) ik(s, T.x.clone().applyMatrix3(desk.dir));                   // pack metres in the desk frame → world
  }
  const cigEnds = () => { if (!N.cig.visible) return []; const t = wpos(N.tip), c = wpos(N.cig); return [t, c.clone().multiplyScalar(2).sub(t)]; };

  // ---------- the smoking clock: which clip, at what time, with what cross-fade weight
  const segs = { stand: [...SEQ.slice(0, -1).map((n) => [n, D[n]]), ['smoke_stop', STOP_CUT / FPS], ['smoke_stop_end', D.smoke_stop_end]], sit: SEQ.map((n) => [n, D[n]]) };
  const cig = { stand: segs.stand.reduce((s, x) => s + x[1], 0), sit: segs.sit.reduce((s, x) => s + x[1], 0) };
  function at(mode, t) {                         // → { list: [{name, time, w}], cur, f, rest }
    const L = segs[mode], C = cig[mode] + REST[mode], tc = t % C, cyc = Math.floor(t / C);
    if (tc >= cig[mode]) { const [n, d] = L[L.length - 1]; return { list: [{ name: n, time: d, w: 1 }], cur: n, f: d * FPS + 1, rest: true }; }
    let s = 0;
    for (let i = 0; i < L.length; i++) { const [n, d] = L[i];
      if (tc < s + d || i === L.length - 1) { const tl0 = tc - s, list = [{ name: n, time: tl0, w: 1 }];
        const prev = i > 0 ? L[i - 1] : (cyc > 0 && mode === 'stand' ? L[L.length - 1] : null);
        if (prev && tl0 < XF) { const pt = i > 0 ? prev[1] + tl0 : prev[1]; list[0].w = tl0 / XF; list.push({ name: prev[0], time: pt, w: 1 - tl0 / XF }); }
        return { list, cur: n, f: tl0 * FPS + 1, rest: false }; }
      s += d; }
  }

  // ---------- state
  const sm = { on: false, t: 0, allow: 1, seq: null, mode: null, desk: null, P: 0, W: 0, lw: 0, lit: false, prevF: 0, exhaleT: -1, cur: null, f: 0, rest: true, list: [] };
  const all = Object.values(A);
  // pre: after the editor's layer weights, before the mixer. want = { mode: 'stand' | 'sit', desk } or null
  function pre(dt, want, base) {
    // one cigarette per director's command: a further 'continue' allows the next one, which starts from its beginning
    if (want && (!sm.on || sm.mode !== want.mode)) { sm.on = true; sm.mode = want.mode; sm.desk = want.desk || null; sm.t = 0; sm.allow = 1; sm.seq = want.seq; sm.lit = false; sm.exhaleT = -1; }
    else if (want && want.seq !== sm.seq) { sm.seq = want.seq; sm.allow++; }
    const C = sm.mode ? cig[sm.mode] + REST[sm.mode] : 1, cap = sm.allow * C - 1e-3;
    if (want) sm.t = Math.min(sm.t + dt, cap); else if (sm.on && sm.P <= 0) sm.on = false;
    const mode = sm.mode;
    let target = 0;
    if (sm.on) { const s = at(mode, sm.t); sm.list = s.list; sm.cur = s.cur; sm.f = s.f; sm.rest = s.rest;
      // lit from frame 100 of lighting up until the fingers open in Stop (frame 71) — from the clock, so a late viewer sees it lit too
      sm.lit = !s.rest && !(s.cur === 'smoke_start' || s.cur === 'smoke_stop_end' || (s.cur === 'smoke_light' && s.f < INFO.smoke_light.litFrom) || (s.cur === 'smoke_stop' && s.f >= CIG_OUT));
      target = want && !(s.rest && (mode === 'sit' || sm.t >= cap)) ? 1 : 0; }             // done smoking: back to the plain idle
    sm.P = target > sm.P ? Math.min(target, sm.P + dt / IN) : Math.max(target, sm.P - dt / IN); sm.W = smooth(sm.P);
    for (const a of all) a.setEffectiveWeight(0);
    // seated idle always runs as three parts (the same pose as one clip); smoking takes the arms from it
    const wSit = base.sit_idle.getEffectiveWeight(), wSt = base.stand_idle.getEffectiveWeight();
    if (sitParts) { base.sit_idle.setEffectiveWeight(0); for (const k of ['core', 'R', 'L']) { sitParts[k].time = base.sit_idle.time; sitParts[k].setEffectiveWeight(wSit); } }
    sm.lw = 0; sm.dW = 0; sm.dT = -1; if (drinkL) { drinkL.core.setEffectiveWeight(0); drinkL.L.setEffectiveWeight(0); }
    if (!sm.on || !sm.list.length) return;
    const tot = sm.list.reduce((s, e) => s + e.w, 0) || 1;
    if (mode === 'stand') {
      base.stand_idle.setEffectiveWeight(wSt * (1 - sm.W));
      for (const e of sm.list) { const a = A['st_' + e.name]; a.time = Math.min(e.time, a.getClip().duration - 1e-4); a.setEffectiveWeight(wSt * sm.W * e.w / tot); }
    } else if (sitParts) {
      for (const e of sm.list) {
        const name = e.name === 'smoke_stop_end' ? 'smoke_stop' : e.name, r = A['ovR_' + name], l = A['ovL_' + name], wr = wSit * sm.W * e.w / tot;
        r.time = l.time = Math.min(e.time, r.getClip().duration - 1e-4); r.setEffectiveWeight(wr);
        const lightW = name === 'smoke_light' ? hump(e.time * FPS + 1, 1, 12, 150, 175) : 0; l.setEffectiveWeight(wr * lightW); sm.lw += (wSit > 0 ? wr / wSit : 0) * lightW;
      }
      if (drinkL && want?.drink) {                        // the hold clip is longer than the sip: drink from its first frame, eased in and out over 0.4 s
        const h = sm.list.find((e) => e.name === 'smoke_hold');
        if (h && h.time < drinkL.D) { sm.dT = h.time; sm.dW = smooth(Math.min(h.time / 0.4, (drinkL.D - h.time) / 0.4)) * sm.W; }
        drinkL.core.time = drinkL.L.time = Math.max(0, sm.dT); drinkL.core.setEffectiveWeight(wSit * sm.dW); drinkL.L.setEffectiveWeight(wSit * sm.dW);
        sitParts.core.setEffectiveWeight(wSit * (1 - sm.dW));
      }
      sitParts.R.setEffectiveWeight(wSit * (1 - sm.W)); sitParts.L.setEffectiveWeight(wSit * Math.max(0, 1 - sm.lw - sm.dW));
    }
  }
  // post: after the mixer — hand to the mouth / pocket / off the desk, the cigarette, the lighter, smoke
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(); let tipAcc = 0, exAcc = 0;
  function post(dt) {
    const on = sm.on && sm.W > 0.001 && sm.cur;
    const name = on ? sm.cur : null, f = sm.f, wSeat = sm.mode === 'sit';
    // right hand: mouth (+ pocket at the start, seated), then the cigarette in the fingers
    if (on) {
      const T = wSeat ? W_SEAT : W_MOUTH, tot = sm.list.reduce((s, e) => s + e.w, 0) || 1;
      const wm = sm.list.reduce((s, e) => s + e.w / tot * wAt(T, e.name, e.time * FPS + 1), 0);
      if (wSeat) {
        const { G } = fingerFrame(), { m, aa } = mouthAxis(), d = new THREE.Vector3();
        if (wm > 0) d.addScaledVector(m.clone().addScaledVector(aa, 0.03 * U).sub(G), wm * sm.W);
        if (name === 'smoke_start') { const w = hump(f, 3, 12, 17, 26) * sm.W; if (w > 0) d.addScaledVector(fromThigh('r', K.pocketRt).sub(pinch('r')), w); }
        ik('r', d);
      }
      N.cig.visible = !sm.rest && (name === 'smoke_start' ? f >= 14 : !((name === 'smoke_stop' && f >= CIG_OUT) || name === 'smoke_stop_end')) && sm.W > 0.3;
      if (N.cig.visible) placeCig(wm);
      if (wSeat && sm.desk) { tableLift('r', sm.desk, cigEnds(), dt); if (N.cig.visible) placeCig(wm); }
      // left hand and the lighter (lighting up only)
      const L = name === 'smoke_light'; N.lighter.visible = L && f >= 17 && f <= 139 && sm.W > 0.3;
      if (L) {
        if (wSeat) {
          const dl = new THREE.Vector3(), wp1 = hump(f, 4, 14, 20, 30) * sm.W, wp2 = hump(f, 126, 136, 142, 152) * sm.W;
          if (wp1 > 0) dl.addScaledVector(fromThigh('l', K.pocketL1t).sub(pinch('l')), wp1);
          if (wp2 > 0) dl.addScaledVector(fromThigh('l', K.pocketL2t).sub(pinch('l')), wp2);
          const wl = hump(f, 62, 80, 108, 118) * sm.W;
          if (wl > 0) { const hood = K.hoodLocal.clone().applyMatrix4(B.hand_l.matrixWorld.clone().multiply(K.lighterOff)); dl.addScaledVector(wpos(N.tip).add(new THREE.Vector3(0, -0.016 * U, 0)).sub(hood), wl); }
          ik('l', dl); if (sm.desk) tableLift('l', sm.desk, null, dt);
        }
        const LW = lighterPose();
        const fl = f >= 84 && f <= 107 && N.lighter.visible; N.flame.visible = fl;
        if (fl) { const hood = K.hoodLocal.clone().applyMatrix4(LW), tip = wpos(N.tip), dir = new THREE.Vector3(0, 1, 0).lerp(tip.clone().sub(hood).normalize(), 0.7).normalize(), s = 0.85 + 0.3 * Math.random();
          const FW = new THREE.Matrix4().compose(hood, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(s * 0.9 * U, s * U, s * 0.9 * U));
          new THREE.Matrix4().copy(N.flame.parent.matrixWorld).invert().multiply(FW).decompose(N.flame.position, N.flame.quaternion, N.flame.scale); }
      } else N.flame.visible = false;
    } else { N.cig.visible = false; N.lighter.visible = false; N.flame.visible = false; tl.r.x.set(0, 0, 0); tl.r.v.set(0, 0, 0); tl.l.x.set(0, 0, 0); tl.l.v.set(0, 0, 0); }
    effects(dt, name, f);
    stepParticles(dt);
    // points are sized in world units: pixels per world unit of the orthographic camera
    if (camera.isOrthographicCamera) smokeMat.uniforms.uPPU.value = renderer.domElement.height / ((camera.top - camera.bottom) / camera.zoom);
  }
  function effects(dt, name, f) {
    const I = name ? INFO[name] : null;
    const cigOn = N.cig.visible, lit = sm.lit && cigOn, inh = (g) => I && I.inhale.some(([a, b]) => g >= a && g <= b);
    const inhale = lit && inh(f);
    if (lit && !inhale && inh(sm.prevF)) sm.exhaleT = 0;
    if (I && I.ash && lit) I.ash.forEach((a) => { if (sm.prevF < a && f >= a) { const t = wpos(N.tip); for (let i = 0; i < 7; i++) spawn(t, new THREE.Vector3((Math.random() - 0.5) * 0.05 * U, (-0.05 - Math.random() * 0.1) * U, (Math.random() - 0.5) * 0.05 * U), 0.45, 0.006 * U, 0.006 * U, 0.8, 'ash'); } });
    sm.prevF = f;
    const tip = cigOn ? wpos(N.tip, tmp) : null, now = performance.now();
    const flick = 0.85 + 0.3 * Math.sin(now * 0.023) + 0.15 * Math.random(), heat = !lit ? 0 : inhale ? 3.2 * flick : 0.9 + 0.2 * Math.sin(now * 0.004);
    if (emberMat) { emberMat.emissive.setRGB(1, 0.28, 0.06); emberMat.emissiveIntensity = heat; }
    glow.visible = !!tip && lit; emberLight.intensity = 0;
    if (tip && lit) { glow.position.copy(tip); glow.scale.setScalar((inhale ? 0.028 * flick : 0.016) * U); glow.material.opacity = inhale ? 1 : 0.7; emberLight.position.copy(tip); emberLight.intensity = inhale ? 0.035 * flick * LI : 0; }
    if (tip && lit && !inhale) { tipAcc += dt * 38; while (tipAcc > 1) { tipAcc--; spawn(tip, new THREE.Vector3((Math.random() - 0.5) * 0.01 * U, (0.08 + Math.random() * 0.04) * U, (Math.random() - 0.5) * 0.01 * U), 2.4 + Math.random(), 0.008 * U, 0.09 * U, 0.16, 'tip'); } }
    if (sm.exhaleT >= 0) {
      sm.exhaleT += dt; const T = sm.exhaleT, { m } = mouthAxis(), dir = wpos(N.fwd, tmp2).sub(m).normalize(), rate = T < 0.2 ? 0 : T < 1.0 ? 100 : T < 2.0 ? 42 : 0;
      exAcc += dt * rate;
      while (exAcc > 1) { exAcc--;
        const v = dir.clone().multiplyScalar((0.18 + Math.random() * 0.34) * U).add(new THREE.Vector3((Math.random() - 0.5) * 0.16 * U, (-0.04 + (Math.random() - 0.5) * 0.1) * U, (Math.random() - 0.5) * 0.16 * U));
        const p0 = m.clone().addScaledVector(dir, 0.01 * U).add(new THREE.Vector3((Math.random() - 0.5) * 0.02 * U, (Math.random() - 0.5) * 0.015 * U, (Math.random() - 0.5) * 0.02 * U));
        spawn(p0, v, 3.0 + Math.random() * 1.6, (0.03 + Math.random() * 0.03) * U, (0.3 + Math.random() * 0.3) * U, 0.13 + Math.random() * 0.07, 'exhale'); }
      if (T > 2.1) sm.exhaleT = -1;
    }
    if (N.flame.visible) { flameLight.position.copy(wpos(N.flame, tmp2)); flameLight.intensity = (0.35 + Math.random() * 0.12) * LI; } else flameLight.intensity = 0;
  }
  return {
    fx, pre, post, setSitBase, setDrinkL, sipTime: () => sm.dT, holdStart: () => (sm.mode === 'sit' ? D.smoke_start + D.smoke_light : Infinity), clockT: () => sm.t,
    active: () => sm.on && sm.W > 0.001,
    status: () => ({ on: sm.on, mode: sm.mode, t: +sm.t.toFixed(2), clip: sm.cur, frame: Math.round(sm.f), W: +sm.W.toFixed(2), lit: sm.lit, rest: sm.rest, cig: N.cig.visible, lighter: N.lighter.visible, particles: liveN }),
    props: N,
  };
}
