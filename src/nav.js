// Walking on the office floor: a baked 4 cm grid (static furniture) + boxes for things that move (desk chairs).
// Plain JS, no three.js: the page and the director on the Mac use the same code, so every viewer computes the same path.
// Coordinates here are three.js plan coordinates (x, z); the grid itself is stored in Blender plan coords (x, y = -z).

export function createNav(G, radius) {
  const { x0, y0, cell: C, w: W, h: H } = G;
  const raw = typeof atob === 'function' ? atob(G.bits) : Buffer.from(G.bits, 'base64').toString('binary');
  const bit = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) bit[k] = (raw.charCodeAt(k >> 3) >> (k & 7)) & 1;
  // inflate the static obstacles by the body radius (only edge cells need stamping)
  const R = Math.ceil(radius / C), disk = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if ((di * di + dj * dj) * C * C <= radius * radius) disk.push([di, dj]);
  const stat = new Uint8Array(bit);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (!bit[k]) continue;
    const edge = (i > 0 && !bit[k - 1]) || (i < W - 1 && !bit[k + 1]) || (j > 0 && !bit[k - W]) || (j < H - 1 && !bit[k + W]);
    if (!edge) continue;
    for (const [di, dj] of disk) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W && b < H) stat[b * W + a] = 1; }
  }
  let boxes = [];                                     // [x0, z0, x1, z1] in three plan coords, not inflated
  const ci = (x) => Math.floor((x - x0) / C), cj = (z) => Math.floor((-z - y0) / C);
  const cx = (i) => x0 + (i + 0.5) * C, cz = (j) => -(y0 + (j + 0.5) * C);
  function blockedCell(i, j) {
    if (i < 0 || j < 0 || i >= W || j >= H) return true;
    if (stat[j * W + i]) return true;
    const x = cx(i), z = cz(j);
    for (const b of boxes) if (x > b[0] - radius && x < b[2] + radius && z > b[1] - radius && z < b[3] + radius) return true;
    return false;
  }
  const blocked = (x, z) => blockedCell(ci(x), cj(z));
  const solid = (x, z) => { const i = ci(x), j = cj(z); if (i < 0 || j < 0 || i >= W || j >= H || bit[j * W + i]) return true;   // no inflation
    for (const b of boxes) if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return true; return false; };
  function nearestFree(i, j, maxR) {                  // ring search, deterministic order
    if (!blockedCell(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const d = di * di + dj * dj; if (d < bd && !blockedCell(i + di, j + dj)) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }
  function sight(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (C * 0.5)));
    for (let k = 1; k < n; k++) { const t = k / n; if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // A* over 8 neighbours (no corner cutting), then string-pulling
  const g = new Float32Array(W * H), from = new Int32Array(W * H), seen = new Uint8Array(W * H);
  function path(a, b, tol = 0.25) {
    const s = nearestFree(ci(a.x), cj(a.z), Math.ceil(0.8 / C)); if (!s) return null;
    const e = nearestFree(ci(b.x), cj(b.z), Math.ceil(tol / C)); if (!e) return null;
    const S = s[1] * W + s[0], E = e[1] * W + e[0];
    g.fill(Infinity); seen.fill(0); from.fill(-1);
    const heap = [], hf = [];
    const push = (k, f) => { heap.push(k); hf.push(f); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
    const pop = () => { const top = heap[0], lk = heap.pop(), lf = hf.pop();
      if (heap.length) { heap[0] = lk; hf[0] = lf; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } }
      return top; };
    const ei = e[0], ej = e[1], hh = (i, j) => { const dx = Math.abs(i - ei), dy = Math.abs(j - ej); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    g[S] = 0; push(S, hh(s[0], s[1]));
    let found = false;
    while (heap.length) {
      const k = pop(); if (seen[k]) continue; seen[k] = 1;
      if (k === E) { found = true; break; }
      const i = k % W, j = (k - i) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a2 = i + di, b2 = j + dj; if (blockedCell(a2, b2)) continue;
        if (di && dj && (blockedCell(i + di, j) || blockedCell(i, j + dj))) continue;
        const n = b2 * W + a2; if (seen[n]) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = k; push(n, ng + hh(a2, b2)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = E; k !== -1; k = from[k]) cells.push(k); cells.reverse();
    const pts = cells.map((k) => ({ x: cx(k % W), z: cz(Math.floor(k / W)) }));
    pts[0] = { x: a.x, z: a.z };                                    // start exactly where he stands
    const endOK = !blocked(b.x, b.z) || Math.hypot(cx(ei) - b.x, cz(ej) - b.z) <= tol;
    if (!endOK) return null;
    pts[pts.length - 1] = { x: b.x, z: b.z };
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) {                                     // farthest visible point
      let j = pts.length - 1; while (j > i + 1 && !sight(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  const length = (pts) => (pts ? pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0) : Infinity);
  return { path, length, blocked, solid, setBoxes: (b) => { boxes = b; }, get boxes() { return boxes; } };
}
