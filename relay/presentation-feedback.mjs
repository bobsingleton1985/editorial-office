import crypto from 'node:crypto';
// Viewers may attest presentation only. Positions, routes, readiness and paid
// command identity remain authoritative server data. Do not combine partial
// viewing intervals from different tabs into a completed performance.
export function createPresentationFeedback(){
  const viewers=new Map(),ended=new Map();
  // Arrival times include transport delay. A decrease in that delay compresses
  // two receipts without accelerating rendered frames. Budget at most one
  // existing freshness window; this never adds milliseconds to a witness.
  const transportJitterMs=3500;
  return {
    connect(viewer,now=Date.now()){const lease=crypto.randomUUID();viewers.set(viewer,{lease,at:0,connectedAt:now,actors:{},history:new Map()});return {lease};},
    disconnect(viewer){viewers.delete(viewer);},
    accept(body,world,now){
      const client=[...viewers.values()].find(v=>v.lease===body?.lease);
      if(!client||!body.actors||typeof body.actors!=='object'||Array.isArray(body.actors)||Object.keys(body.actors).length>12)return false;
      const actors={};
      for(const [id,v]of Object.entries(body.actors)){
        const e=world?.chars?.[id],w=v?.witness,p=e?.performance;
        if(!p||v.seq!==e.seq||w?.id!==p.id||w.activity!==e.activity||!Number.isFinite(w.duration)||Math.abs(w.duration-p.duration)>.001||!Number.isFinite(w.renderedMs)||w.renderedMs<0||w.renderedMs>w.duration*1000+1||w.renderedMs>Math.max(0,now-e.at)+80||typeof w.complete!=='boolean')continue;
        if(w.complete&&w.renderedMs<w.duration*1000-80)continue;
        const key=id+':'+e.seq+':'+p.id;let history=client.history.get(key);
        if(!history){history={actorId:id,seq:e.seq,performanceId:p.id,firstAt:now,firstMs:w.renderedMs,lastAt:now,lastMs:w.renderedMs,invalid:w.complete?'initial_complete':w.renderedMs>750?'initial_too_late':w.renderedMs>now-client.connectedAt+100?'initial_age':null};client.history.set(key,history);}
        else if(!history.invalid){
          if(w.renderedMs<history.lastMs)history.invalid='time_reversed';
          else if(now-history.lastAt>3500)history.invalid='receipt_gap';
          else if(w.renderedMs-history.lastMs>now-history.lastAt+transportJitterMs||w.renderedMs>history.firstMs+now-history.firstAt+transportJitterMs)history.invalid='progress_exceeds_transport_budget';
        }
        history.lastAt=now;history.lastMs=w.renderedMs;
        if(history.invalid)continue;
        actors[id]={seq:e.seq,witness:{id:w.id,activity:w.activity,duration:w.duration,renderedMs:w.renderedMs,complete:w.complete}};
      }
      for(const [key,h]of client.history){if(world?.chars?.[h.actorId]?.seq!==h.seq||world.chars[h.actorId].performance?.id!==h.performanceId)client.history.delete(key);}
      client.actors=actors;client.at=now;return true;
    },
    merge(caps,world,now){
      if(!caps)return null;const result=structuredClone(caps);
      const active=new Set();
      for(const [id,a]of Object.entries(result.actors||{})){
        const e=world?.chars?.[id],p=e?.performance;if(!p)continue;active.add(p.id);
        const candidates=[...viewers.values()].filter(v=>now-v.at<3500).map(v=>v.actors[id]).filter(v=>v?.seq===e.seq&&v.witness.id===p.id);
        candidates.sort((a,b)=>Number(b.witness.complete)-Number(a.witness.complete)||b.witness.renderedMs-a.witness.renderedMs);
        // This channel is fed exclusively by the server simulation worker.
        // Preserve physical completion before viewer presentation can delay or
        // reject its own evidence. A browser cannot create this work receipt.
        a.executionSource='server-simulation';
        a.performanceExecutionEnd=a.executionEnd?structuredClone(a.executionEnd):null;
        a.performanceWitness=candidates[0]?.witness||null;a.presentationSource=candidates.length?'viewer-render':null;
        const reasons={};for(const v of viewers.values())for(const h of v.history.values())if(h.actorId===id&&h.seq===e.seq&&h.performanceId===p.id&&h.invalid)reasons[h.invalid]=(reasons[h.invalid]||0)+1;
        a.presentationDiagnostics={eligibleViewers:candidates.length,rejectedHistories:reasons};
        if(a.executionEnd&&!a.performanceWitness?.complete){
          if(!ended.has(p.id))ended.set(p.id,now);
          // The viewer is intentionally ~120ms behind and reports at 500ms.
          // Give its last rendered frame time to arrive before the existing
          // director decides whether the performance was fully observed.
          if(now-ended.get(p.id)<2000){a.executionEnd=null;a.presentationPending=true;}
        }
      }
      for(const id of ended.keys())if(!active.has(id))ended.delete(id);
      return result;
    },
  };
}
