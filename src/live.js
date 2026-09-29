// Connection to the shared newsroom: one stream of world states from the relay (Server-Sent Events).
// Every viewer receives the same {from, cmd, at}; `now()` is the relay's clock, so a late viewer can catch up.
export function connectLive(url, onWorld, onStatus, on = {}) {        // on: {weather, blinds} — shared room settings
  let offset = 0, es = null, alive = false;
  const now = () => Date.now() + offset;
  if (!url) { onStatus({ online: false, reason: 'no_relay' }); return { now, url }; }
  const clock = (d) => { if (typeof d.now === 'number') offset = d.now - Date.now(); };
  function open() {
    es = new EventSource(url.replace(/\/$/, '') + '/events');
    es.addEventListener('world', (e) => { try { const w = JSON.parse(e.data); clock(w); alive = true; onWorld(w); onStatus({ online: true, viewers: w.viewers }); } catch (err) { /* bad frame */ } });
    for (const k of ['weather', 'blinds']) es.addEventListener(k, (e) => { try { if (on[k]) on[k](JSON.parse(e.data)); } catch (err) { /* ignore */ } });
    es.addEventListener('viewers', (e) => { try { const v = JSON.parse(e.data); clock(v); alive = true; onStatus({ online: true, viewers: v.viewers }); } catch (err) { /* ignore */ } });
    es.onerror = () => { if (alive || es.readyState === 2) onStatus({ online: false, reason: 'lost' }); alive = false;
      if (es.readyState === 2) setTimeout(open, 5000); };                 // closed for good: try again in 5 s
  }
  open();
  return { now, url };
}
