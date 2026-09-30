// Music at the TV: several people in the zone, each with their own motion. A run is start, a few loops, stop. Each next loop
// is chosen online, a second before the current one ends: the one nobody else in the zone is playing then (their committed clips are known), and
// not the same one twice in a row. Deterministic: the same timeline and seed give the same choices for every viewer.
// The set of clips: listening (JAZZ: start, five loops, stop) or dancing (DANCE: five swing dances that begin and end in a standing pose — no start or stop).
export const JAZZ_LOOPS = ['jazz_01', 'jazz_02_tap', 'jazz_03_tap', 'jazz_04', 'jazz_05'];
export const JAZZ = { start: 'jazz_start', loops: JAZZ_LOOPS, stop: 'jazz_stop' };
export const DANCE = { start: null, loops: ['dance_charleston1', 'dance_charleston2', 'dance_crazylegs', 'dance_shimsham1', 'dance_shimsham2'], stop: null };
const REPEAT = 2, LEAD = 1;         // LEAD: the next loop is chosen this long (s) before the current one ends
                     // a repeat of one's own last loop costs as much as 2 s of playing the same as someone else
// a new run: t0 — start (s, the plan clock); loops — how many; seed — small integer (the place index) to vary equal choices; S — the set
export function jazzStart(t0, loops, seed, others, dur, X = 0.35, S = JAZZ) {
  const d0 = S.start ? dur(S.start) : 0;
  const g = { t0, segs: S.start ? [{ n: S.start, s: 0, d: d0 }] : [], T: 0, jazz: { S, left: loops, seed, prev: null, end: S.start ? d0 - X : 0, i: 0 } };
  g.T = g.jazz.end + X; jazzExtend(g, 0, others, dur, X); return g;
}
// commit the next loop (or the stop) shortly before the last committed loop ends; others: the plans of the others in the zone
export function jazzExtend(g, u, others, dur, X = 0.35) {
  const J = g.jazz; if (!J) return; const S = J.S || JAZZ;
  const last = g.segs[g.segs.length - 1];
  if (J.done || (last && last.n !== S.start && u < last.s + last.d - X - LEAD)) return;   // decide just before the join: the freshest picture
  if (J.left <= 0) { J.done = true;
    if (S.stop) { g.segs.push({ n: S.stop, s: J.end, d: dur(S.stop) }); J.end += dur(S.stop) - X; }
    g.T = J.end + X; return; }
  const a = g.t0 + J.end;
  const cost = (n) => { const e = a + dur(n); let o = 0;
    for (const p of others) for (const s of p.segs) { if (s.n !== n) continue; const sa = p.t0 + s.s; o += Math.max(0, Math.min(e, sa + s.d) - Math.max(a, sa)); }
    return o + (n === J.prev ? REPEAT : 0) + ((J.seed * 3 + J.i * 7 + S.loops.indexOf(n)) % 5) * 1e-3; };
  const n = [...S.loops].sort((x, y) => cost(x) - cost(y))[0];
  g.segs.push({ n, s: J.end, d: dur(n) }); J.end += dur(n) - X; J.prev = n; J.left--; J.i++;
  g.T = J.end + X + (S.stop ? dur(S.stop) : 1);    // room for the stop still to come (the envelope must not start fading)
}
