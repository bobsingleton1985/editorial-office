// Listening to jazz at the TV: several people in the zone, each with their own motion. A run is start, a few loops, stop. Each next loop
// is chosen online, a second before the current one ends: the one nobody else in the zone is playing then (their committed clips are known), and
// not the same one twice in a row. Deterministic: the same timeline and seed give the same choices for every viewer.
export const JAZZ_LOOPS = ['jazz_01', 'jazz_02_tap', 'jazz_03_tap', 'jazz_04', 'jazz_05'];
const REPEAT = 2, LEAD = 1;         // LEAD: the next loop is chosen this long (s) before the current one ends
                     // a repeat of one's own last loop costs as much as 2 s of playing the same as someone else
// a new run: t0 — start (s, the plan clock); loops — how many; seed — small integer (the place index) to vary equal choices
export function jazzStart(t0, loops, seed, others, dur, X = 0.35) {
  const g = { t0, segs: [{ n: 'jazz_start', s: 0, d: dur('jazz_start') }], T: 0, jazz: { left: loops, seed, prev: null, end: dur('jazz_start') - X, i: 0 } };
  g.T = g.jazz.end + X; jazzExtend(g, 0, others, dur, X); return g;
}
// commit the next loop (or the stop) shortly before the last committed loop ends; others: the plans of the others in the zone
export function jazzExtend(g, u, others, dur, X = 0.35) {
  const J = g.jazz; if (!J) return;
  const last = g.segs[g.segs.length - 1];
  if (J.done || (last.n !== 'jazz_start' && u < last.s + last.d - X - LEAD)) return;   // decide just before the join: the freshest picture
  if (J.left <= 0) { g.segs.push({ n: 'jazz_stop', s: J.end, d: dur('jazz_stop') }); J.end += dur('jazz_stop') - X; J.done = true; g.T = J.end + X; return; }
  const a = g.t0 + J.end;
  const cost = (n) => { const e = a + dur(n); let o = 0;
    for (const p of others) for (const s of p.segs) { if (s.n !== n) continue; const sa = p.t0 + s.s; o += Math.max(0, Math.min(e, sa + s.d) - Math.max(a, sa)); }
    return o + (n === J.prev ? REPEAT : 0) + ((J.seed * 3 + J.i * 7 + JAZZ_LOOPS.indexOf(n)) % 5) * 1e-3; };
  const n = [...JAZZ_LOOPS].sort((x, y) => cost(x) - cost(y))[0];
  g.segs.push({ n, s: J.end, d: dur(n) }); J.end += dur(n) - X; J.prev = n; J.left--; J.i++;
  g.T = J.end + X + dur('jazz_stop');                // room for the stop still to come (the envelope must not start fading)
}
