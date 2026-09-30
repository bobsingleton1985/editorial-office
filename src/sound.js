// Sounds of the newsroom. The phone rings (owner 30.09: variant A of the «Звонок телефона» stand — Western Electric 302,
// two brass gongs struck 20 times a second, US cadence 2 s on / 4 s off, a small office echo). Synthesised with WebAudio,
// no files. Off until the viewer switches it on in ☰ → «Звук»: browsers keep a page silent until a click.
const KEY = 'editorial.sound';
const PARTIALS = [[1, 1], [2.76, 0.42], [5.4, 0.22], [8.93, 0.1]], GONGS = [1180, 1490], RATE = 20, LEVEL = 0.09;

export function createSound() {
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  let ctx = null, dry = null, verb = null;
  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    const bus = ctx.createGain(); bus.gain.value = 0.6; bus.connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 0.8; dry.connect(bus);
    verb = ctx.createConvolver(); const len = Math.round(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);   // a small office: 1.3 s tail
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(bus);
    return ctx;
  }
  const unlock = () => { if (on && audio()) ctx.resume?.(); };
  addEventListener('pointerdown', unlock, { passive: true }); addEventListener('keydown', unlock);

  // one blow of the clapper on a gong: a few inharmonic bell partials, quick attack, ringing decay
  function strike(out, t, f, amp) {
    for (const [r, a] of PARTIALS) {
      const o = ctx.createOscillator(), g = ctx.createGain(), dec = 0.55 / Math.sqrt(r);
      o.frequency.value = f * r * (1 + (Math.random() - 0.5) * 0.002);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp * a, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.02);
    }
  }
  const bells = {}, st = {};                         // k -> the burst now sounding; k -> {cyc, real}
  function burst(k, dur) {
    if (!audio() || ctx.state !== 'running') return;
    const out = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    out.gain.value = LEVEL; out.connect(lp); lp.connect(dry); lp.connect(verb);
    const t0 = ctx.currentTime + 0.02, step = 1 / RATE;
    for (let s = 0; s < dur; s += step) GONGS.forEach((f, i) => strike(out, t0 + s + i * step / GONGS.length, f, 0.85 + Math.random() * 0.3));
    bells[k] = { out };
  }
  function hush(k) {
    const b = bells[k]; if (!b) return; delete bells[k];
    b.out.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(() => b.out.disconnect(), 400);
  }
  return {
    get on() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ } if (on) unlock(); else for (const k in bells) hush(k); },
    // every frame from the phones: t = seconds since the call came, -1 = silent (no call, or the handset is up)
    phone(k, t, onFor, cycle) {
      const s = st[k] ??= { cyc: -1, real: -9 };
      if (t < 0) { s.cyc = -1; hush(k); return; }
      const cyc = Math.floor(t / cycle), ph = t - cyc * cycle, now = performance.now() / 1000;
      if (ph >= onFor || cyc === s.cyc) return;
      s.cyc = cyc;
      if (on && onFor - ph > 0.25 && now - s.real > 1.5) { s.real = now; burst(k, onFor - ph); }   // at most one burst per 1.5 s of real time (a late viewer catching up stays quiet)
    },
  };
}
