// Walking together: Recast crowd (DetourCrowd) on a navmesh made from the baked floor grid, plus the keep-right rule
// approved on the «Толпа в редакции» page v6 (handoffs/editorial-crowd-rules.md, code: handoffs/code/crowd-nav-v6.mjs).
// One simulation for the whole newsroom, stepped at a fixed 1/30 s from the walk requests, so every viewer — and a late one —
// gets the same walks: a request that lands in the past (a late viewer loading the second person) replays the crowd from the start
// of the current episode. The crowd only walks people from where they set off to the approach point; the last metre, turning
// and sitting stay with editor.js. People standing still (at a spot) are agents too, so the walkers go round them.
import { createNav } from './nav.js';
import { init, NavMeshQuery, Crowd } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';

export const STEP = 1 / 30;
const AG = { height: 2.8, maxAcceleration: 2, separationWeight: 0.5, collisionQueryRange: 2.4, pathOptimizationRange: 8, updateFlags: 7 };
const PASS = { lookAhead: 3.2, range: 7, margin: 0.35, maxShift: 0.9, beyond: 3 };
const HANDOFF = 0.5, REPLAN = 5, ON_MESH = 0.35, HX = { x: 1.5, y: 0.5, z: 1.5 };
const hyp = Math.hypot;

// the static furniture from the 4 cm grid (1 = blocked) as boxes, runs merged along rows and then across rows
function gridBoxes(G) {
  const { x0, y0, cell: C, w: W, h: H } = G;
  const raw = typeof atob === 'function' ? atob(G.bits) : Buffer.from(G.bits, 'base64').toString('binary');
  const bit = (i, j) => (raw.charCodeAt((j * W + i) >> 3) >> ((j * W + i) & 7)) & 1;
  const out = []; let open = new Map();
  for (let j = 0; j <= H; j++) {
    const runs = new Map();
    if (j < H) for (let i = 0; i < W; i++) { if (!bit(i, j)) continue; let e = i; while (e + 1 < W && bit(e + 1, j)) e++; runs.set(i + ':' + e, [i, e]); i = e; }
    const next = new Map();
    for (const [k, r] of runs) next.set(k, open.has(k) ? open.get(k) : { i0: r[0], i1: r[1], j0: j });
    for (const [k, b] of open) if (!runs.has(k)) out.push([x0 + b.i0 * C, -(y0 + j * C), x0 + (b.i1 + 1) * C, -(y0 + b.j0 * C)]);
    open = next;
  }
  return { boxes: out, floor: [x0, -(y0 + H * C), x0 + W * C, -y0] };
}
function triangles(floor, boxes) {
  const positions = [], indices = [];
  const quad = (a, b, c, d) => { const n = positions.length / 3; positions.push(...a, ...b, ...c, ...d); indices.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  const [x, z, X, Z] = floor; quad([x, 0, z], [x, 0, Z], [X, 0, Z], [X, 0, z]);
  for (const [x, z, X, Z] of boxes) { const y = 3;
    quad([x, y, z], [x, y, Z], [X, y, Z], [X, y, z]); quad([x, 0, z], [x, y, z], [X, y, z], [X, 0, z]); quad([X, 0, z], [X, y, z], [X, y, Z], [X, 0, Z]);
    quad([X, 0, Z], [X, y, Z], [x, y, Z], [x, 0, Z]); quad([x, 0, Z], [x, y, Z], [x, y, z], [x, 0, z]); }
  return { positions, indices };
}

// G: navgrid.js GRID; extra: [x0, z0, x1, z1] boxes (chairs where they stand); radius: body radius (arm swing + 6 cm)
export async function createCrowd(G, extra, radius) {
  await init();
  const { boxes, floor } = gridBoxes(G), cs = 0.035;
  const { positions, indices } = triangles(floor, [...boxes, ...extra]);
  const r = generateSoloNavMesh(positions, indices, { cs, ch: 0.02, walkableSlopeAngle: 40, walkableHeight: 140, walkableClimb: 2,
    walkableRadius: Math.ceil(radius / cs), minRegionArea: 4, mergeRegionArea: 8, maxSimplificationError: 0.5 });
  if (!r.success) throw Error(r.error);
  const mesh = r.navMesh, query = new NavMeshQuery(mesh), V = (p) => ({ x: p.x, y: 0, z: p.z });
  const snap = (p) => { const q = query.findClosestPoint(V(p), { halfExtents: HX }); if (!q.success) return null;
    return { x: q.point.x, z: q.point.z, d: hyp(q.point.x - p.x, q.point.z - p.z), ref: q.polyRef }; };

  // ---------- the episode: people, their walk requests, the crowd and the recorded poses since tBase
  const people = new Map();   // id -> { stand: {x,z}|null, reqs: [{t0, from, to, speed, done, doneT, doneAt, stalled}], agent, cur, pass, stall }
  let crowd = null, tBase = 0, t = 0, dirty = true, hist = new Map(); const log = [];   // hist: id -> [{x, z, vx, vz, dx, dz, w (walking), seg}]
  const person = (id) => { let p = people.get(id); if (!p) { people.set(id, p = { stand: null, reqs: [] }); order = [...people.keys()].sort().map((k) => people.get(k)); } return p; };
  let order = [];                                  // everybody, by id: the same order for every viewer, whoever loaded first
  const segAt = (p, tt) => { let s = null; for (const q of p.reqs) if (q.t0 <= tt + 1e-6) s = q; return s; };
  function staticPos(p, tt) {                        // where somebody who is not walking stands at time tt
    const s = segAt(p, tt);
    if (s) return s.stop ? s.from : s.done ? s.doneAt : s.from;
    if (p.reqs.length) return p.reqs[0].from;        // before his first walk: where he set off from
    return p.stand;
  }
  function rebuild() {
    if (crowd) crowd.destroy();
    crowd = new Crowd(mesh, { maxAgents: 8, maxAgentRadius: radius });
    t = tBase; hist = new Map(); dirty = false;
    for (const id of [...people.keys()].sort()) {
      const p = people.get(id); p.agent = null; p.cur = null; p.pass = null; p.detour = null; p.stall = 0; p.boost = 0;
      for (const q of p.reqs) { if(q.stop)continue; q.done = false; q.doneT = null; q.doneAt = null; q.stalled = false; }
      const at = staticPos(p, t); if (!at) continue;
      p.agent = crowd.addAgent(V(at), { ...AG, radius, maxSpeed: 2 });
      hist.set(id, []);
    }
    record();
  }
  function record() {
    for (const [id, p] of [...people.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) { if (!p.agent) {if(!hist.has(id))hist.set(id,[]);hist.get(id).push(null);continue;}
      if(!hist.has(id))hist.set(id,[]);const a = p.agent, pos = a.position(), vel = a.velocity(), w = !!(p.cur && !p.cur.done);
      let dx = 0, dz = 0; if (w) { const n = a.nextTargetInPath(); dx = n.x - pos.x; dz = n.z - pos.z; }
      hist.get(id).push({ x: pos.x, z: pos.z, vx: w ? vel.x : 0, vz: w ? vel.z : 0, dx, dz, w, seg: p.cur }); }
  }
  function stepOnce() {
    const tn = t + STEP;
    for (const p of order) {
      const s = segAt(p, tn);
      if(s?.stop){if(p.cur!==s){if(p.agent)crowd.removeAgent(p.agent);p.agent=s.from?crowd.addAgent(V(s.from),{...AG,radius,maxSpeed:0}):null;p.cur=s;p.pass=null;p.detour=null;p.stall=0;}continue;}
      if(!p.agent&&s)p.agent=crowd.addAgent(V(s.from),{...AG,radius,maxSpeed:s.speed});
      if(!p.agent)continue;
      if (s && s !== p.cur) {                          // a new walk starts: from where he is, towards the approach point
        p.cur = s; p.stall = 0; p.pass = null; p.detour = null; p.agent.updateFlags = AG.updateFlags; p.agent.maxSpeed = s.speed;
        p.agent.teleport(V(s.from)); p.agent.requestMoveTarget(V(s.to));
        p.boost = s.v0 > 0 ? tn + s.v0 / 8 : 0; p.agent.maxAcceleration = p.boost ? 8 : AG.maxAcceleration;   // coming out of a stand-up already moving
      }
      if (p.boost && tn >= p.boost) { p.boost = 0; p.agent.maxAcceleration = AG.maxAcceleration; }
    }
    followDetours();
    socialPass();
    for (const p of order) if (p.agent && !(p.cur && !p.cur.done)) { const at = staticPos(p, tn); if (at) p.agent.teleport(V(at)); }
    crowd.update(STEP);
    for (const p of order) { const s = p.cur; if (!p.agent || !s || s.done) continue;
      const pos = p.agent.position(), vel = p.agent.velocity(), sp = hyp(vel.x, vel.z);
      const fin = (stalled) => { s.done = true; s.doneT = tn; s.doneAt = { x: pos.x, z: pos.z }; s.stalled = stalled; p.agent.resetMoveTarget(); p.pass = null; p.detour = null; p.agent.updateFlags = AG.updateFlags; };
      if (hyp(pos.x - s.to.x, pos.z - s.to.z) < HANDOFF) { fin(false); continue; }
      if (sp < 0.05) { p.stall += STEP; if (p.stall + 1e-6 >= REPLAN) { reroute(p, tn); p.stall = 0; } } else p.stall = 0;
    }
    t = tn; record();
  }
  function advance(tq) { if (dirty) rebuild(); let n = 0; while (t < tq - 1e-6 && n++ < 3600) stepOnce(); }

  // Five seconds of blocked walking: reuse the floor planner with the other
  // bodies as temporary obstacles, then let DetourCrowd execute its waypoints.
  // No teleport or unguarded native walk; an unavailable detour is retried in 5 s.
  let detourNav = null;
  function reroute(p, now) {
    if (!detourNav) detourNav = createNav(G, radius);
    const bodies = order.filter(o => o !== p && o.agent).map(o => {
      const q = o.agent.position();
      return [q.x - radius, q.z - radius, q.x + radius, q.z + radius];
    });
    detourNav.setBoxes([...extra, ...bodies]);
    const pos = p.agent.position(), path = detourNav.path(pos, p.cur.to, 0);
    const points = path?.slice(1).map(q => snap(q));
    const valid = points?.length && points.every(q => q && q.d < 0.2);
    const partner = p.pass?.other;
    if (partner?.pass?.other === p) {
      partner.pass = null; partner.agent.updateFlags = AG.updateFlags;
      partner.agent.requestMoveTarget(V(partner.cur.to));
    }
    p.pass = null; p.agent.updateFlags = AG.updateFlags;
    p.detour = valid ? points.map(q => ({x: q.x, z: q.z})) : null;
    p.agent.resetMoveTarget();
    p.agent.requestMoveTarget(V(p.detour?.[0] || p.cur.to));
    log.push({t: +(now - tBase).toFixed(2), kind: 'blocked_replan', found: !!valid,
      from: {x: pos.x, z: pos.z}, to: {...p.cur.to}, waypoints: p.detour?.map(q => ({...q})) || []});
    if (log.length > 50) log.shift();
  }
  function followDetours() {
    for (const p of order) if (p.agent && p.detour && p.cur && !p.cur.done) {
      const q = p.agent.position(), next = p.detour[0];
      if (hyp(q.x - next.x, q.z - next.z) < 0.2) {
        p.detour.shift();
        if (!p.detour.length) p.detour = null;
        p.agent.requestMoveTarget(V(p.detour?.[0] || p.cur.to));
      }
    }
  }

  // ---------- keep right (crowd-nav v6 socialPass): people see an oncoming person early and both keep to their right
  const walking = () => order.filter((p) => p.agent && p.cur && !p.cur.done);
  function routeOf(p) {                               // his corridor to the real target, as a polyline with lengths
    const q = p.agent.position(), r = query.computePath(q, V(p.cur.to)), pts = (r.path || []).map((v) => ({ x: v.x, z: v.z }));
    if (pts.length < 2) return null; pts[0] = { x: q.x, z: q.z };
    return pts;
  }
  function along(pts, dist) {                         // the point `dist` along a polyline, with the local direction
    let left = dist;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = hyp(b.x - a.x, b.z - a.z); if (l < 1e-6) continue;
      const d = [(b.x - a.x) / l, (b.z - a.z) / l]; if (l >= left || i === pts.length - 1) { const k = Math.min(left, l); return { x: a.x + d[0] * k, z: a.z + d[1] * k, dir: d }; } left -= l; }
    const a = pts[pts.length - 2], b = pts[pts.length - 1], l = hyp(b.x - a.x, b.z - a.z) || 1; return { x: b.x, z: b.z, dir: [(b.x - a.x) / l, (b.z - a.z) / l] };
  }
  function rayTo(from, to) {                          // reachable straight from `from` towards `to` without crossing a wall, 5 cm short of it
    const c = query.findClosestPoint(V(from), { halfExtents: HX }); if (!c.success) return { ...from };
    const st = c.point, r = query.raycast(c.polyRef, st, V(to)), len = hyp(to.x - st.x, to.z - st.z);
    let k = r.success ? Math.min(1, r.t) : 0; if (k < 1 && len > 0) k = Math.max(0, k - 0.05 / len);
    return { x: st.x + (to.x - st.x) * k, z: st.z + (to.z - st.z) * k };
  }
  function alongRoute(p, dist) {                      // a point `dist` ahead on his own route, with the local route direction
    const q = p.agent.position(), r = query.computePath(q, V(p.cur.to)), pts = r.path || []; if (pts.length < 2) return null;
    let a = { x: q.x, z: q.z }, left = dist;
    for (let i = 1; i < pts.length; i++) { const b = pts[i], l = hyp(b.x - a.x, b.z - a.z); if (l < 1e-6) continue; const d = [(b.x - a.x) / l, (b.z - a.z) / l];
      if (l >= left || i === pts.length - 1) { const k = Math.min(left, l); return { pt: { x: a.x + d[0] * k, z: a.z + d[1] * k }, dir: d, end: l < left }; }
      left -= l; a = b; }
    return null;
  }
  function socialPass() {
    const all = walking().filter(p => !p.detour), R2 = 2 * radius, need = R2 + PASS.margin;
    for (const p of all) if (p.pass?.via) {             // at his side of the meeting point (or nearly): on along the lane, no braking before it
      const q = p.agent.position(), v = p.pass.via, f = p.pass.dir;
      if (hyp(q.x - v.x, q.z - v.z) < 1.2 || (q.x - v.x) * f[0] + (q.z - v.z) * f[1] > -0.3) { p.pass.via = null; p.agent.requestMoveTarget(V(p.pass.wp)); }
    }
    for (const p of all) if (p.pass) {
      const o = p.pass.other;if(!o.agent){p.pass=null;p.stall=0;p.agent.updateFlags=AG.updateFlags;p.agent.requestMoveTarget(V(p.cur.to));continue;}const f = p.pass.dir, a = p.agent.position(), b = o.agent.position(), rp = [b.x - a.x, b.z - a.z], ahead = rp[0] * f[0] + rp[1] * f[1], d = hyp(rp[0], rp[1]);
      if (!(o.cur && !o.cur.done) || (ahead < -0.2 && d > R2) || d > PASS.range) { p.pass = null; p.stall = 0; p.agent.updateFlags = AG.updateFlags; p.agent.requestMoveTarget(V(p.cur.to)); log.push({ t: +(t - tBase).toFixed(2), end: true, ahead: +ahead.toFixed(2), d: +d.toFixed(2) }); }
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (a.pass || b.pass) continue;
      // where both will be: along their own routes at full pace (straight lines lie at corners and at the start of a walk)
      const A = a.agent.position(), B = b.agent.position(); if (hyp(B.x - A.x, B.z - A.z) > PASS.range) continue;
      const ra = routeOf(a), rb = routeOf(b); if (!ra || !rb) continue;
      let best = null;
      for (let tau = 0.1; tau <= PASS.lookAhead + 1e-6; tau += 0.1) {
        const pa = along(ra, a.cur.speed * tau), pb = along(rb, b.cur.speed * tau), d = hyp(pa.x - pb.x, pa.z - pb.z);
        if (!best || d < best.d) best = { d, tau, pa, pb };
      }
      if (!best || best.d >= need || best.tau <= 0.15) continue;
      const fa = best.pa.dir, fb = best.pb.dir;
      if (fa[0] * fb[0] + fa[1] * fb[1] > -0.5) continue;              // only oncoming; crossings stay with the crowd's own avoidance
      const tc = best.tau, m0 = { x: (best.pa.x + best.pb.x) / 2, z: (best.pa.z + best.pb.z) / 2 }, ms = snap(m0) || m0, mid = { x: ms.x, z: ms.z };
      const ax = [fa[0] - fb[0], fa[1] - fb[1]], al = hyp(ax[0], ax[1]), u = [ax[0] / al, ax[1] / al];   // one passing axis for both: parallel lanes
      const side = [[a, u, A], [b, [-u[0], -u[1]], B]].map(([x, f, X]) => {      // free room to each one's right at the meeting point (up to maxShift)
        const right = [-f[1], f[0]], pt = rayTo(mid, { x: mid.x + right[0] * PASS.maxShift, z: mid.z + right[1] * PASS.maxShift });
        return { x, f, X, room: Math.max(0, (pt.x - mid.x) * right[0] + (pt.z - mid.z) * right[1]), dist: hyp(X.x - mid.x, X.z - mid.z) };
      });
      // both keep right; when one has a wall at his right (a table corner), the other takes the rest of the width
      const [s0, s1] = side; s0.shift = Math.min(s0.room, need / 2); s1.shift = Math.min(s1.room, need - s0.shift); s0.shift = Math.min(s0.room, Math.max(s0.shift, need - s1.shift));
      for (const sd of side) {                        // the lane: from his shifted place at the meeting point straight on, well past it
        const f = sd.f, m = rayTo(mid, { x: mid.x - f[1] * sd.shift, z: mid.z + f[0] * sd.shift }), e = rayTo(m, { x: m.x + f[0] * PASS.beyond, z: m.z + f[1] * PASS.beyond });
        if (hyp(e.x - m.x, e.z - m.z) > 1) { sd.lane = true; sd.via = m; sd.wp = e; continue; }   // first to his side of the meeting point, then on
        const ar = alongRoute(sd.x, sd.dist + PASS.beyond);                      // a wall ahead: along his own route instead (as on the pilot page)
        sd.lane = !!ar && !ar.end; sd.wp = !ar || ar.end ? { ...sd.x.cur.to } : rayTo(ar.pt, { x: ar.pt.x - ar.dir[1] * sd.shift, z: ar.pt.z + ar.dir[0] * sd.shift }); }
      const width = s0.room + s1.room, kind = width >= need - 0.05 ? 'keep_right' : width >= R2 - 0.1 ? 'squeeze' : 'wait';
      log.push({ t: +(t - tBase).toFixed(2), kind, width: +width.toFixed(2), tc: +tc.toFixed(2), mid: [+mid.x.toFixed(2), +mid.z.toFixed(2)], sides: side.map((sd) => ({ room: +sd.room.toFixed(2), shift: +sd.shift.toFixed(2), lane: sd.lane, wp: [+sd.wp.x.toFixed(2), +sd.wp.z.toFixed(2)], f: sd.f.map((v) => +v.toFixed(2)) })) }); if (log.length > 50) log.shift();
      if (kind !== 'wait') for (const s of side) { s.x.pass = { other: s.x === a ? b : a, dir: s.f, kind, via: s.via || null, wp: s.wp }; s.x.agent.requestMoveTarget(V(s.via || s.wp)); if (s.lane) s.x.agent.updateFlags = 1; }
      else { const [w, m] = side[0].dist >= side[1].dist ? side : [side[1], side[0]];     // the one farther from the narrow place waits
        w.x.pass = { other: m.x, dir: w.f, kind: 'wait' }; w.x.agent.requestMoveVelocity({ x: 0, y: 0, z: 0 });
        m.x.pass = { other: w.x, dir: m.f, kind: 'go' }; }
    }
  }

  // ---------- API
  const q30 = (tt) => Math.round(tt / STEP) * STEP;
  return {
    // somebody standing still (a spot) or sitting (null: not an obstacle for the crowd — his chair or the bench already is)
    stand(id, pos, at=null) {
      const p=person(id),s=pos?snap(pos):null,v=s&&s.d<ON_MESH?{x:s.x,z:s.z}:null;
      if(at===null||!p.reqs.length){if((p.stand&&v&&hyp(p.stand.x-v.x,p.stand.z-v.z)<1e-4)||(!p.stand&&!v))return;p.stand=v;dirty=true;return;}
      const t0=q30(at),last=p.reqs.at(-1);
      if(last?.stop&&JSON.stringify(last.from)===JSON.stringify(v))return;
      p.reqs=p.reqs.filter(q=>q.t0<t0);p.reqs.push({stop:true,t0,from:v,to:v,done:true,doneT:t0,doneAt:v});dirty=true;
    },
    // a walk from `from` to `to` starting at t0 (s); false: no crowd walk possible (the page walks its own path then)
    start(id, t0, from, to, speed, v0 = 0) {
      const a = snap(from), b = snap(to); if (!a || !b || a.d > 0.8 || b.d > 0.8) return null;
      t0 = q30(t0); const p = person(id);
      const busy = [...people.values()].some((o) => { const l = o.reqs[o.reqs.length - 1]; return l && (!l.done || l.doneT > t0); });
      if (![...people.values()].some((o) => o.reqs.length)) tBase = t0;
      else if (crowd && !busy) {                      // a new episode: everybody stands where his last walk ended
        // A final stand event makes history dirty even after all walks finish.
        // Rebase completed episodes so resuming after idle does not replay hours.
        for (const o of people.values()) { const l = o.reqs[o.reqs.length - 1]; if (l) o.stand = l.doneAt; o.reqs = []; }
        tBase = t0;
      } else if (t0 < tBase) tBase = t0;
      const req = { t0, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, speed, v0 };
      p.reqs = p.reqs.filter((q) => q.t0 < t0); p.reqs.push(req);
      dirty = true;                                    // replayed from the start of the episode: the same for every viewer
      return req;
    },
    // his pose at time tt (s): {x, z, vx, vz, dx, dz (route ahead), walking, done, stalled}
    pose(id, tt) {
      advance(tt); const h = hist.get(id); if (!h || !h.length) return null;
      const k = Math.max(0, Math.min(h.length - 1, (tt - tBase) / STEP)), i = Math.floor(k), f = k - i, a = h[i], b = h[Math.min(i + 1, h.length - 1)];
      if(!a||!b)return null;
      const s = a.seg && a.seg.done && a.seg.doneT <= tt + 1e-6 ? a.seg : b.seg && b.seg.done && b.seg.doneT <= tt + 1e-6 ? b.seg : null;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, vx: a.vx + (b.vx - a.vx) * f, vz: a.vz + (b.vz - a.vz) * f, dx: a.dx, dz: a.dz,
        walking: a.w, done: !!s, stalled: !!s?.stalled, seg: a.seg || b.seg };
    },
    snap, query, radius, debug: () => ({ tBase, t, log, people: [...people.entries()].map(([id, p]) => ({ id, stand: p.stand, reqs: p.reqs.map((q) => ({ t0: q.t0, done: q.done, doneT: q.doneT, stalled: q.stalled })) })) }),
  };
}
