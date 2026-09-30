// Small gestures in the pauses (MC Seated SitChairTable / MC Idles on the same MOTUS rig, add-on editor2A-gestures-web-v01.glb):
// while he just sits at a desk or on the bench, or just stands, now and then he looks around, reads the papers, leans on the desk,
// checks his watch, scratches his head, rubs his neck; tired (the director's fatigue ≥ 60) — he yawns and dozes off over the desk (resting clears the typewriter away).
// Every viewer sees the same: the gesture of a time slot is chosen from the decision's number and the slot's number, and the
// clock is the time since the decision (late viewers replay it). The director knows nothing about it.

const TIRED = 60;
// a gesture = clips played one after another (crossfaded); the last one of a sequence named *_stop is its way out
export const POOLS = {
  desk: { P: 24, calm: [['sit_idle_02'], ['sit_idle_03'], ['sit_lookat'], ['sit_papers'], ['sit_lean_start', 'sit_lean_01', 'sit_lean_02', 'sit_lean_stop'],
    ['feet_start', 'feet_idle', 'feet_look', 'feet_idle', 'feet_tap', 'feet_idle', 'feet_stop'],                     // feet on the desk (the chair pushed back)
    ['feet_start', 'feet_idle', 'feet_relax_start', 'feet_relax_01', 'feet_relax_02', 'feet_relax_stop', 'feet_brush', 'feet_stop'],
    ['write_start', 'write_01', 'write_look', 'write_02', 'write_stop'], ['write_start', 'write_secret', 'write_01', 'write_stop']],   // writing by hand (pencil and sheet)
    tired: [['sit_doze_start', 'sit_doze', 'sit_doze', 'sit_doze_stop'], ['sit_lean_start', 'sit_lean_01', 'sit_lean_02', 'sit_lean_stop'], ['sit_lookat']] },   // resting clears the desk (no typewriter)
  bench: { P: 24, calm: [['sit_idle_02'], ['sit_idle_03'], ['sit_lookat']], tired: [['sit_idle_03'], ['sit_lookat']] },
  stand: { P: 16, calm: [['stand_look'], ['stand_watch_1'], ['stand_watch_2'], ['stand_scratch_1'], ['stand_scratch_2'], ['stand_neck_1'], ['stand_neck_2'], ['stand_idle_02']],
    tired: [['stand_yawn_1'], ['stand_yawn_2'], ['stand_neck_1'], ['stand_yawn_1'], ['stand_look']] },
};
export const SEATED = new Set(Object.values(POOLS.desk).concat(Object.values(POOLS.bench)).flat(2).filter((n) => typeof n === 'string'));
const X = 0.35, ENV = 0.6;                                         // crossfade between clips, fade in/out over the plain idle

function rnd(seq, slot, salt) {                                    // the same numbers for every viewer
  let h = (Math.imul(seq | 0, 2654435761) ^ Math.imul(slot + 1, 2246822519) ^ Math.imul(salt + 7, 3266489917)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// the gesture planned for this slot: {t0, segs: [{n, s, d}], T} (times from the decision), or null for a quiet slot
export function plan(kind, seq, slot, fatigue, dur) {
  const pool = POOLS[kind]; if (!pool) return null;
  if (rnd(seq, slot, 1) > 0.75) return null;
  const list = (fatigue ?? 0) >= TIRED ? pool.tired : pool.calm, names = list[Math.floor(rnd(seq, slot, 2) * list.length)];
  const segs = []; let s = 0;
  for (const n of names) { const d = dur(n); if (!d) return null; const q = segs[segs.length - 1];
    if (q && q.n === n) { q.d += d; q.loop = d; s += d; continue; }                // the same loop again: one longer segment
    segs.push({ n, s, d }); s += d - X; }
  const T = s + X, t0 = slot * pool.P + 3 + rnd(seq, slot, 3) * Math.max(0, pool.P - 3 - Math.min(T, pool.P - 3));
  return { t0, segs, T, kind };
}

// weights and clip times of a running gesture at u seconds after its start: {e: envelope, w: {name: [weight, time]}}
export function sample(g, u) {
  const e = Math.min(1, Math.max(0, u / ENV)) * Math.min(1, Math.max(0, (g.T - u) / ENV)), sm = (t) => t * t * (3 - 2 * t), w = {};
  for (let i = 0; i < g.segs.length; i++) { const a = g.segs[i], b = g.segs[i + 1];
    if (u < a.s || u >= a.s + a.d) continue;
    let k = i === 0 ? 1 : sm(Math.min(1, (u - a.s) / X));
    if (b && u >= b.s) k *= 1 - sm(Math.min(1, (u - b.s) / X));
    const p = w[a.n], o = a.o || 0; w[a.n] = [(p ? p[0] : 0) + k * sm(e), a.loop ? (u - a.s) % a.loop : o + Math.min(u - a.s, a.d - 1e-3)]; }   // o: the clip starts that far in
  return { e: sm(e), w };
}

// cut a running gesture short (he is about to get up, or the call is over): a sequence goes straight to its way out (from its
// first *_stop clip to the end), a single clip fades out
export function wrapUp(g, u) {
  const i = g.segs.findIndex((a, j) => j > 0 && /_stop$/.test(a.n));
  if (i > 0) {
    if (u >= g.segs[i].s) return g;
    const cur = g.segs.find((a) => u >= a.s && u < a.s + a.d) || g.segs[0], out = []; let s = u;
    for (const a of g.segs.slice(i)) { out.push({ ...a, s }); s += a.d - X; }
    return { ...g, segs: [{ ...cur, d: u - cur.s + X }, ...out], T: s + X };
  }
  return { ...g, T: Math.min(g.T, u + ENV) };
}

// a phone call: take the handset, talk (the talk clips one after another, for as long as the call lasts), put it back.
// Seated at the desk he reaches for it at once and sits back while lifting it (the pack's clips are "on a chair"); standing he talks where he is.
export const PHONE = {
  desk: { start: ['phone_start'], talk: ['phone_01', 'phone_02', 'phone_03'], end: ['phone_stop', 'chair_to_tbl'] },   // straight from the desk to the handset (no hands-on-knees first)
  stand: { start: ['stand_phone_start'], talk: ['stand_phone_01', 'stand_phone_02', 'stand_phone_03'], end: ['stand_phone_stop'] },
};
const SKIP = 8 / 30;                                               // at the desk the start clip is entered after its idle opening
export function phonePlan(kind, t0, dur, minutes = 20) {
  const P = PHONE[kind], names = [...P.start]; let talk = 0;
  while (talk < minutes * 60) for (const n of P.talk) { names.push(n); talk += dur(n) || 5; }
  names.push(...P.end);
  const segs = []; let s = 0;
  for (const n of names) { const o = n === 'phone_start' && kind === 'desk' ? SKIP : 0, d = dur(n) - o; if (!(d > 0)) return null; segs.push({ n, s, d, o }); s += d - X; }
  return { t0, segs, T: s + X, kind, phone: true };
}
