// Presentation-only interpolation in the server hand's reference frame. The
// authored endpoint poses remain exact; no mixer, IK or grip solver runs here.
import * as THREE from 'three';
const caches = new WeakMap();
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(),
  q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(),
  s0 = new THREE.Vector3(), s1 = new THREE.Vector3(),
  r0 = new THREE.Matrix4(), r1 = new THREE.Matrix4(), out = new THREE.Matrix4(), check = new THREE.Matrix4();

function decomposeTRS(m, p, q, s) {
  m.decompose(p, q, s); q.normalize(); check.compose(p, q, s);
  const scale = Math.max(1, ...m.elements.slice(0, 12).map(Math.abs));
  return m.elements.every((v, i) => Number.isFinite(v) && Math.abs(v - check.elements[i]) <= scale * 1e-5);
}

// Rigid rotations keep their shape; baked affine/sheared props retain all
// matrix components instead of silently losing the shear in TRS decomposition.
export function interpolateAffine(target, a, b, alpha) {
  if (a === b || a.every((v, i) => v === b[i])) return target.fromArray(a);
  r0.fromArray(a); r1.fromArray(b);
  if (decomposeTRS(r0, p0, q0, s0) && decomposeTRS(r1, p1, q1, s1))
    return target.compose(p0.lerp(p1, alpha), q0.slerp(q1, alpha), s0.lerp(s1, alpha));
  for (let i = 0; i < 16; i++) target.elements[i] = a[i] + (b[i] - a[i]) * alpha;
  return target;
}

function setup(graph) {
  const hands = new Map(), cups = new Map();
  graph.nodes.forEach((o, i) => {
    const actor = /^actor:([^/]+)/.exec(graph.schema[i][0])?.[1];
    if (actor && (o.name === 'hand_l' || o.name === 'hand_r')) hands.set(actor + ':' + o.name, i);
    if (o.name === 'PROP_|_mug_slot' && /^COFFEE [ABC]$/.test(o.parent?.name)) cups.set(o.parent.name.slice(-1) + ':coffee', i);
    if (o.name === 'PROP_|_mug_slot_L' && /^COFFEE L [ABC]$/.test(o.parent?.parent?.name)) cups.set(o.parent.parent.name.slice(-1) + ':smoke_coffee', i);
  });
  return { hands, cups, frames: new WeakMap() };
}
function worldAt(graph, cache, frame, index) {
  let matrices = cache.frames.get(frame);
  if (!matrices) { matrices = new Map(); cache.frames.set(frame, matrices); }
  if (matrices.has(index)) return matrices.get(index);
  const state = frame.states[index], m = new THREE.Matrix4();
  if (state.matrix) m.fromArray(state.matrix);
  else m.compose(new THREE.Vector3().fromArray(state.t), new THREE.Quaternion().fromArray(state.t, 3).normalize(), new THREE.Vector3().fromArray(state.t, 7));
  if (state.p >= 0) m.premultiply(worldAt(graph, cache, frame, state.p));
  else if (graph.externalParents[index]) {
    const parent = graph.externalParents[index]; parent.updateWorldMatrix(true, false); m.premultiply(parent.matrixWorld);
  }
  matrices.set(index, m); return m;
}
const active = s => s?.mode === 'seated' && (
  s.activity === 'coffee' && s.coffee?.sip != null && s.coffee.w > 0 ||
  s.activity === 'smoke_coffee' && s.smoke?.sip === true);

export function interpolateHeldCups(graph, frame) {
  const { a, b, alpha } = frame;
  if (!(alpha > 0 && alpha < 1)) return;
  let cache = caches.get(graph); if (!cache) { cache = setup(graph); caches.set(graph, cache); }
  for (const [id, actor] of Object.entries(a.meta?.actors || {})) {
    const x = actor.status, y = b.meta?.actors?.[id]?.status;
    if (!active(x) || !active(y) || x.activity !== y.activity || x.seat !== y.seat) continue;
    const prop = cache.cups.get(x.seat?.replace(/^desk/, '') + ':' + x.activity),
      hand = cache.hands.get(id + ':hand_' + (x.activity === 'coffee' ? 'r' : 'l'));
    if (prop === undefined || hand === undefined || a.states[prop].p !== b.states[prop].p || !!a.states[prop].matrix !== !!b.states[prop].matrix) continue;
    const c0 = worldAt(graph, cache, a, prop), c1 = worldAt(graph, cache, b, prop);
    // A cup resting on the table stays there while the hand approaches/leaves.
    if (c0.elements.every((v, k) => Math.abs(v - c1.elements[k]) < 1e-8)) continue;
    r0.copy(worldAt(graph, cache, a, hand)).invert().multiply(c0);
    r1.copy(worldAt(graph, cache, b, hand)).invert().multiply(c1);
    if (!decomposeTRS(r0, p0, q0, s0) || !decomposeTRS(r1, p1, q1, s1)) continue;
    out.compose(p0.lerp(p1, alpha), q0.slerp(q1, alpha), s0.lerp(s1, alpha));
    const h = graph.nodes[hand], cup = graph.nodes[prop];
    h.updateWorldMatrix(true, false); out.premultiply(h.matrixWorld);
    if (cup.parent) { cup.parent.updateWorldMatrix(true, false); out.premultiply(r0.copy(cup.parent.matrixWorld).invert()); }
    if (!decomposeTRS(out, p0, q0, s0)) continue;
    cup.position.copy(p0); cup.quaternion.copy(q0); cup.scale.copy(s0); cup.updateMatrix(); cup.matrixWorldNeedsUpdate = true;
  }
}
