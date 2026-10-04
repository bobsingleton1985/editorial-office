// The renderer consumes one authoritative pose stream. No routes, mixer updates,
// contact solvers or visibility decisions run in a viewer.
import * as THREE from 'three';
import {interpolateHeldCups,interpolateAffine} from './simulation-props.js';
export const PROTOCOL = 'office-simulation-v1';
const round = n => Math.round(n * 1e5) / 1e5;
const textureCache=new WeakMap(), geometryCache=new WeakMap();
function canvasSnapshot(texture){
  if(!texture?.image?.toDataURL)return null;
  let c=textureCache.get(texture);if(!c||c.version!==texture.version){c={version:texture.version,png:texture.userData.simulationImage ? texture.userData.simulationImage() : texture.image.toDataURL('image/png')};textureCache.set(texture,c);}return c.png;
}
function geometrySnapshot(o){
  if(!o.userData.simulationGeometry)return null;
  const g=o.geometry;let value=geometryCache.get(g);if(!value){value={index:g.index?Array.from(g.index.array):null,attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,array:Array.from(a.array,round)}]))};geometryCache.set(g,value);}return value;
}
function applyCanvas(texture,png){
  if(!texture||!png||texture.userData.simulationPNG===png)return;texture.userData.simulationPNG=png;
  const image=new Image();image.onload=()=>{if(texture.userData.simulationPNG!==png)return;texture.image=image;texture.needsUpdate=true;};image.src=png;
}
const materials = o => o.material ? [].concat(o.material) : [];

export function registerSimulationGraph(roots) {
  const nodes = [], ids = new Map(), schema = [];
  function visit(o, key) {
    if (!o || ids.has(o)) return;
    ids.set(o, nodes.length); nodes.push(o);
    schema.push([key, o.name, o.type, o.morphTargetInfluences?.length || 0]);
    o.children.forEach((c, i) => visit(c, key + '/' + i));
  }
  Object.entries(roots).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, o]) => visit(o, k));
  const externalParents = nodes.map(o => ids.has(o.parent) ? null : o.parent);
  return { nodes, ids, schema, externalParents };
}

export function captureSimulation(graph, meta) {
  const { nodes, ids } = graph;
  const states = nodes.map(o => {
    for (const child of o.children) if (!ids.has(child)) throw Error('Simulation graph changed: ' + o.name);
    const attrs = {};
    for (const [k, a] of Object.entries(o.geometry?.attributes || {})) {
      if (a.usage === THREE.DynamicDrawUsage) attrs[k] = Array.from(Number.isFinite(o.geometry.drawRange.count)?a.array.subarray(0,(o.geometry.drawRange.start+o.geometry.drawRange.count)*a.itemSize):a.array, round);
    }
    return {
      p: ids.get(o.parent) ?? -1, v: o.visible,
      t: [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].map(round),
      // Props using matrixAutoUpdate=false keep their exact affine matrix.
      matrix: o.matrixAutoUpdate ? null : o.matrix.toArray().map(round),
      morph: o.morphTargetInfluences?.map(round) || null,
      light: o.isLight ? [round(o.intensity), ...o.color.toArray().map(round)] : null,
      materials: materials(o).map(m => [round(m.opacity), round(m.emissiveIntensity || 0),
        m.map ? [round(m.map.offset.x), round(m.map.offset.y)] : null,canvasSnapshot(m.map)]),
      mesh:geometrySnapshot(o),
      attrs, range: Object.keys(attrs).length ? [o.geometry.drawRange.start, Number.isFinite(o.geometry.drawRange.count)?o.geometry.drawRange.count:null] : null,
    };
  });
  return { protocol: PROTOCOL, schema: graph.schema, states, meta };
}

// Patches are cumulative within an epoch. A missed sequence requires a new
// keyframe; stale packets never overwrite newer state.
export function createPoseBuffer({ delay = 250, staleAfter = 1500 } = {}) {
  let epoch = null, seq = -1, schema = null, states = null, frames = [], received = -Infinity;
  return {
    push(p, localNow = performance.now()) {
      if (p?.protocol !== PROTOCOL || !Number.isSafeInteger(p.seq) || !Number.isFinite(p.at)) return false;
      if (p.keyframe) {
        if (!Array.isArray(p.schema) || !Array.isArray(p.states) || p.schema.length !== p.states.length) return false;
        if (p.epoch === epoch && p.seq <= seq) return true;
        epoch = p.epoch; schema = p.schema; states = p.states; frames = [];
      } else {
        if(p.epoch===epoch&&p.seq<=seq)return true;
        if (p.epoch !== epoch || p.seq !== seq + 1 || !states || !Array.isArray(p.changes)) return false;
        const next = states.slice();
        for (const [i, s] of p.changes) { if (!Number.isInteger(i) || i < 0 || i >= next.length) return false; next[i] = s; }
        states = next;
      }
      if (frames.length && p.at < frames.at(-1).at) return false;
      seq = p.seq; received = localNow;
      frames.push({ at: p.at, states, meta: p.meta }); if (frames.length > 60) frames.shift();
      return true;
    },
    sample(serverNow, localNow = performance.now()) {
      if (!frames.length) return null;
      const target = serverNow - delay;
      let a = frames[0], b = a;
      for (const f of frames) { if (f.at <= target) a = f; if (f.at >= target) { b = f; break; } b = f; }
      const alpha = b.at > a.at ? Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at))) : 0;
      return { a, b, alpha, schema, epoch, seq, latestAt:frames.at(-1).at, oldestAt:frames[0].at, stale: localNow - received > staleAfter || serverNow-frames.at(-1).at > staleAfter };
    },
    reset() { epoch = null; seq = -1; schema = states = null; frames = []; },
  };
}

const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
export function applySimulation(graph, frame) {
  if(graph.checkedSchema!==frame.schema){if (JSON.stringify(graph.schema) !== JSON.stringify(frame.schema)) throw Error('Simulation asset/graph version mismatch');graph.checkedSchema=frame.schema;}
  const { nodes, externalParents } = graph, { a, b, alpha } = frame;
  for (let i = 0; i < nodes.length; i++) {
    const o = nodes[i], x = a.states[i], y = b.states[i];
    const s = alpha >= 1 ? y : x;
    const parent = s.p < 0 ? externalParents[i] : nodes[s.p];
    if (o.parent !== parent) { if (parent) parent.add(o); else o.removeFromParent(); }
    o.visible = s.v;
    const f = x.p === y.p && !x.matrix && !y.matrix ? alpha : 0;
    const v = f ? x.t.map((n, k) => n + (y.t[k] - n) * f) : s.t;
    o.position.fromArray(v); o.scale.fromArray(v, 7);
    q0.fromArray(f?x.t:s.t, 3); q1.fromArray(y.t, 3); o.quaternion.copy(q0.slerp(q1, f).normalize());
    if (s.matrix) {
      o.matrixAutoUpdate = false;
      // Baked props use affine matrices (including shear). Sample them on the
      // same clock as the hands; holding x while bones advance breaks contact.
      // Preserve the exact matrix at endpoints and across parenting/mode changes.
      if (x.p === y.p && x.matrix && y.matrix && alpha > 0 && alpha < 1) {
        interpolateAffine(o.matrix, x.matrix, y.matrix, alpha);
      } else o.matrix.fromArray(s.matrix);
    }
    else { o.matrixAutoUpdate = true; o.updateMatrix(); }
    o.matrixWorldNeedsUpdate = true;
    if (s.morph && o.morphTargetInfluences) s.morph.forEach((n, j) => { o.morphTargetInfluences[j] = x.morph[j] + (y.morph[j] - x.morph[j]) * alpha; });
    if (s.light && o.isLight) { o.intensity = s.light[0]; o.color.fromArray(s.light, 1); }
    materials(o).forEach((m, j) => { const v = s.materials[j]; if (!v) return; m.opacity = v[0]; if ('emissiveIntensity' in m) m.emissiveIntensity = v[1]; if (m.map && v[2]) m.map.offset.fromArray(v[2]);applyCanvas(m.map,v[3]); });
    if(s.mesh&&o.userData.receivedGeometry!==s.mesh){const g=new THREE.BufferGeometry();if(s.mesh.index)g.setIndex(s.mesh.index);for(const [k,a]of Object.entries(s.mesh.attributes))g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(a.array),a.itemSize,a.normalized));o.geometry.dispose();o.geometry=g;o.userData.receivedGeometry=s.mesh;}
    if(s.range)o.geometry.setDrawRange(s.range[0],s.range[1]??Infinity);
    for (const [k, values] of Object.entries(s.attrs)) { const attr = o.geometry?.attributes[k]; if (attr && attr.array.length >= values.length) { attr.array.set(values); attr.needsUpdate = true; } }
  }
  interpolateHeldCups(graph, frame);
  return alpha >= 1 ? b.meta : a.meta;
}
