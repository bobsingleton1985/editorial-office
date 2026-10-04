// Cosmetic cues follow the displayed authoritative smoking clock. No actor,
// prop, need, or animation state is changed by these helpers.
export function buildSmokeTimeline(segments, info, fps, rest) {
  const out = {};
  for (const [mode, clips] of Object.entries(segments)) {
    let t = 0; const exhales = [], ashes = [], inhales = [];
    for (const [name, duration] of clips) {
      for (const [a, b] of info[name].inhale) {
        inhales.push([t + (a - 1) / fps, t + (b - 1) / fps]);
        exhales.push(t + (b - 1) / fps);
      }
      for (const f of info[name].ash || []) ashes.push(t + (f - 1) / fps);
      t += duration;
    }
    out[mode] = { cycle: t + rest[mode], exhales, ashes, inhales };
  }
  return out;
}

export function smokeVisualCue(timeline, smoke) {
  const line = timeline[smoke?.mode], t = smoke?.fxTime ?? smoke?.t;
  if (!line || !Number.isFinite(t) || t < 0) return { lit: false, inhale: false, exhale: -1, ash: 0 };
  const cycle = Math.floor(t / line.cycle), local = t - cycle * line.cycle;
  const lit = !!(smoke.on && smoke.W > .001 && smoke.cig && smoke.lit);
  let last = -Infinity;
  for (const end of line.exhales) {
    if (end <= local) last = end;
    else if (cycle > 0) last = Math.max(last, end - line.cycle);
  }
  const elapsed = local - last;
  return { lit, inhale: lit && line.inhales.some(([a, b]) => local >= a && local <= b),
    exhale: lit && elapsed >= 0 && elapsed <= 2.1 ? elapsed : -1,
    ash: cycle * line.ashes.length + line.ashes.filter(at => at <= local).length };
}

export function sampleSmokeStatus(frame, id) {
  const read = meta => {
    const actor = meta?.actors?.[id], cue = actor?.smokeFx;
    return cue?.version === 1 && actor.status?.smoke ? { ...actor.status.smoke, fxVersion: cue.version, fxTime: cue.time, fxGeneration: cue.generation } : null;
  };
  const x = read(frame.a.meta), y = read(frame.b.meta);
  const selected = frame.alpha >= 1 ? y : x;
  if (selected?.fxVersion !== 1) return null;
  const same = x?.fxVersion === 1 && y?.fxVersion === 1 && x.fxGeneration === y.fxGeneration && x.mode === y.mode;
  return { ...selected, fxTime: same && y.fxTime >= x.fxTime ? x.fxTime + (y.fxTime - x.fxTime) * frame.alpha : selected.fxTime };
}

export function createSmokeDisplayClock() {
  let epoch, at, blocked = true;
  return (frame) => {
    const now = frame.a.at + (frame.b.at - frame.a.at) * frame.alpha;
    const gap = at == null ? 0 : (now - at) / 1000;
    const reset = epoch !== frame.epoch || blocked || gap < 0 || gap > .25;
    epoch = frame.epoch; at = now;
    const stale = !!frame.stale; blocked = stale;
    return { dt: stale || reset ? 0 : gap, reset: reset && !stale, stale, at: now };
  };
}
