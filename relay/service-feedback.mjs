// Delivery is witnessed by the authoritative scene executor. It does not depend
// on a viewer being present, but reconstruction and late/replayed receipts fail closed.
const clips=['HER-POUR','HER-TRAY-PICK','HER-TRAY-PUT'];
export function serviceDurations(value){
 if(!value||!clips.every(k=>Number.isFinite(value[k])&&value[k]>0&&value[k]<30))return null;
 return Object.fromEntries(clips.map(k=>[k,value[k]]));
}
export function createServiceFeedback(){
 const histories=new Map();
 return {
  reset(){histories.clear();},
  read(a,e,now){
   for(const key of histories.keys())if(key!==e?.seq+':'+e?.service?.id)histories.delete(key);
   const durations=serviceDurations(a?.serviceDurations);
   const result={serviceReady:a?.serviceReady===true&&!!durations,serviceDurations:durations,serviceWitness:null};
   const s=e?.service,w=a?.serviceWitness,n=s?.recipients?.length,d=serviceDurations(s?.durations);
   if(!s||!w||!d||!n||n>3||w.version!==1||w.id!==s.id||w.seq!==e.seq||a.seq!==e.seq||a.activity!=='heroine_serve'||JSON.stringify(w.recipients)!==JSON.stringify(s.recipients)||!Number.isInteger(w.step)||w.step<0||w.step>n*2+4||!Number.isInteger(w.poured)||w.poured<0||w.poured>n||!Number.isFinite(w.elapsedMs)||w.elapsedMs<0||!Number.isFinite(w.motionMs)||w.motionMs<0||w.motionMs>w.elapsedMs+1)return result;
   const key=e.seq+':'+s.id;let h=histories.get(key);
   if(!h){h={at:now,elapsed:0,motion:0,step:0,poured:0,valid:w.elapsedMs<=1500&&now-e.at<=2000&&!w.complete};histories.set(key,h);}
   if(now<h.at||now-h.at>3500||w.elapsedMs<h.elapsed||w.elapsedMs-h.elapsed>now-h.at+1500||w.motionMs<h.motion||w.step<h.step||w.poured<h.poured||w.valid!==true||s.cancelled||w.elapsedMs>now-e.at+250)h.valid=false;
   Object.assign(h,{at:now,elapsed:w.elapsedMs,motion:w.motionMs,step:w.step,poured:w.poured});
   const atTable=a.mode==='idle'&&Math.hypot(a.x-.45,a.z-2.1)<.08;
   const minimum=(n*d['HER-POUR']+d['HER-TRAY-PICK']+d['HER-TRAY-PUT'])*1000;
   const complete=h.valid&&w.complete===true&&w.trayOnTable===true&&w.phase==='delivered'&&w.step===n*2+4&&w.poured===n&&Math.abs(w.motionMs-minimum)<100&&atTable;
   result.serviceWitness={version:1,id:s.id,seq:e.seq,recipients:s.recipients,poured:w.poured,phase:w.phase==='delivered'?'delivered':'executing',motionMs:w.motionMs,elapsedMs:w.elapsedMs,historyVerified:h.valid,complete,trayOnTable:w.trayOnTable===true&&atTable};
   return result;
  },
 };
}
