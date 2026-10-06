import {createModelStatus} from './model-status.mjs';
// Connection to the shared newsroom: one stream of world states from the relay (Server-Sent Events).
// Every viewer receives the same {from, cmd, at}; `now()` is the relay's clock, so a late viewer can catch up.
export function connectLive(url, onWorld, onStatus, on = {}) {        // on: {weather, blinds} — shared room settings
  const modelStatus=createModelStatus(url);
  let presenceLease=null,presenceBusy=false,presenceDesired=false;
  const presence=async(visible=document.visibilityState==='visible')=>{presenceDesired=visible;if(!presenceLease||presenceBusy)return;presenceBusy=true;try{await fetch(url.replace(/\/$/,'')+'/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lease:presenceLease,visible}),keepalive:true});}catch{}finally{presenceBusy=false;if(presenceDesired!==visible)presence(presenceDesired);}};
  let executionLease=null, executionBusy=false,presentationLease=null,presentationBusy=false;
  const presentation=async body=>{if(!presentationLease||presentationBusy)return;presentationBusy=true;try{await fetch(url.replace(/\/$/,'')+'/presentation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,lease:presentationLease})});}catch{}finally{presentationBusy=false;}};
  const execution=async body=>{if(!executionLease||executionBusy)return;executionBusy=true;try{await fetch(url.replace(/\/$/,'')+'/execution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,lease:executionLease})});}catch{}finally{executionBusy=false;}};
  let offset = 0, es = null, alive = false;
  const now = () => Date.now() + offset;
  if (!url) { onStatus({ online: false, reason: 'no_relay' }); return { now, url }; }
  const clock = (d) => { if (typeof d.now === 'number') offset = d.now - Date.now(); };
  function open() {
    es = new EventSource(url.replace(/\/$/, '') + '/events?runtime=office-service-v46-20261006');
    es.addEventListener('presence-lease',e=>{try{presenceLease=JSON.parse(e.data).lease;presence();}catch{}});
    es.addEventListener('presentation-lease',e=>{try{presentationLease=JSON.parse(e.data).lease;}catch{}});
    es.addEventListener('simulation', e=>{try{on.simulation?.(JSON.parse(e.data));}catch{}});
    window.__simulationResync=()=>{es?.close();setTimeout(open,250);};
    es.addEventListener('executor',e=>{try{if(window.__simulationMode!=='viewer')executionLease=JSON.parse(e.data).lease;}catch{}});
    es.addEventListener('world', (e) => { try { const w = JSON.parse(e.data); clock(w); alive = true; modelStatus.connection(true);modelStatus.update(w.modelRequests);onWorld(w); window.dispatchEvent(new CustomEvent("editorial-world",{detail:w})); window.dispatchEvent(new CustomEvent("editorial-connection",{detail:true})); onStatus({ online: true, viewers: w.viewers }); } catch (err) { /* bad frame */ } });
    for (const k of ['weather', 'blinds', 'hostess']) es.addEventListener(k, (e) => { try { if (on[k]) on[k](JSON.parse(e.data)); } catch (err) { /* ignore */ } });
    es.addEventListener('viewers', (e) => { try { const v = JSON.parse(e.data); clock(v); alive = true; onStatus({ online: true, viewers: v.viewers }); } catch (err) { /* ignore */ } });
    es.onerror = () => {window.dispatchEvent(new CustomEvent("editorial-connection",{detail:false}));modelStatus.connection(false); if (alive || es.readyState === 2) onStatus({ online: false, reason: 'lost' }); alive = false;
      if (es.readyState === 2) setTimeout(open, 5000); };                 // closed for good: try again in 5 s
  }
  document.addEventListener('visibilitychange',()=>presence());
  window.addEventListener('pagehide',()=>presence(false));
  setInterval(()=>presence(),2000);
  open();
  return { now, url, execution, presentation };
}
