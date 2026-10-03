const X=.35;
export const DESK_SLEEP={entry:['sit_lean_start','sit_doze_start'],loop:'sit_doze',exit:['sit_doze_stop','sit_lean_stop']};
export const deskSleepAvailable=duration=>[...DESK_SLEEP.entry,DESK_SLEEP.loop,...DESK_SLEEP.exit].every(n=>duration(n)>0);
export function sleepPlan(sleep,startedAt,now,clock,duration){
 if(!deskSleepAvailable(duration))return null;
 const segs=[];let t=0;
 for(const n of DESK_SLEEP.entry){const d=duration(n);segs.push({n,s:t,d});t+=d-X;}
 const loopStart=t,asleepAt=loopStart+X,wake=Number.isFinite(sleep.wakeAt)?Math.max(asleepAt,(sleep.wakeAt-startedAt)/1000):Infinity;
 segs.push({n:DESK_SLEEP.loop,s:loopStart,d:wake-loopStart+X,loop:duration(DESK_SLEEP.loop)});t=wake;
 if(Number.isFinite(wake))for(const n of DESK_SLEEP.exit){const d=duration(n);segs.push({n,s:t,d});t+=d-X;}
 const elapsed=Math.max(0,(now-startedAt)/1000),T=t+X;
 return {kind:'desk',sleep:true,sleepId:sleep.id,t0:clock-elapsed,segs,T,phase:elapsed>=T?'done':elapsed>=wake?'waking':elapsed>=asleepAt?'asleep':'entering',startedAt};
}
