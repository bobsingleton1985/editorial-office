import {addMemory} from './daily-memory.mjs';
// Only active watched time and fresh executor intervals affect the one fatigue scale.
export const SLEEP = Object.freeze({threshold:95,wakeBelow:30,minMs:60000,fatigueRecovery:14,drunkRecovery:20,freshness:3500});
const clamp=x=>Math.max(0,Math.min(100,x));
export const awakeFatigueRate=hour=>hour>=22||hour<6?1.5:hour>=18?1:hour>=15?.5:.2;
export function initializeSleep(p){
 // Migrate current physiology, leaving historical memory records untouched.
 delete p.sleepPressure;
 if(p.sleep)delete p.sleep.pressureBefore;
 p.fatigue=clamp(Number.isFinite(p.fatigue)?p.fatigue:0);
}
export function requireSleep(p,now){
 initializeSleep(p);
 if(!p.sleep&&!p.sleepPending&&p.fatigue>=SLEEP.threshold){p.sleepPending={requestedAt:now,fatigue:p.fatigue};return true;}
 return false;
}
export function awakeFatigue(p,from,to,activityRate,actingMinutes,speed=1,offsetSeconds=0){
 initializeSleep(p);if(to<=from)return;
 let circadian=0;
 for(let t=from;t<to;){const local=t+offsetSeconds*1000,next=Math.min(to,t+(3600000-((local%3600000+3600000)%3600000)));circadian+=(next-t)/60000*awakeFatigueRate(new Date(local).getUTCHours());t=next;}
 p.fatigue=clamp(p.fatigue+(circadian+activityRate*actingMinutes)*speed);
}
export function startSleep(p,id,now,source,kind='desk'){
 initializeSleep(p);
 p.sleep={id,kind,phase:'entering',requestedAt:now,poseStartedAt:null,startedAt:null,wakeAt:null,confirmedMs:0,lastObservation:0,lastSampleAt:null,
  fatigueBefore:p.fatigue,drunkBefore:p.needs?.drunk??0,source};
 delete p.sleepPending;delete p.sleepRestoredAt;
}
export function acceptSleepSample(p,a,now,speed=1,sampleAt=now){
 const s=p.sleep,e=a?.sleep;
 if(!s||a?.seq!==p.seq||a.activity!=='sleep_desk'||a.loaded!==true||e?.id!==s.id||!Number.isInteger(e.observation)||e.observation<=s.lastObservation||!Number.isFinite(sampleAt)||sampleAt>now||now-sampleAt>=SLEEP.freshness||sampleAt<s.requestedAt||Number.isFinite(s.lastSampleAt)&&sampleAt<=s.lastSampleAt)return false;
 s.lastObservation=e.observation;s.lastSampleAt=sampleAt;
 if(!Number.isFinite(s.poseStartedAt)&&Number.isFinite(e.poseStartedAt)&&e.poseStartedAt>=s.requestedAt&&e.poseStartedAt<=sampleAt)s.poseStartedAt=e.poseStartedAt;
 if(e.phase==='asleep'&&s.phase!=='waking'&&a.executing===true&&Number.isFinite(s.poseStartedAt)){
  if(!Number.isFinite(s.startedAt)){s.startedAt=sampleAt;s.phase='asleep';addMemory(p,{event:'sleep_started',kind:s.kind,place:p.place,at:sampleAt,fatigue:p.fatigue,source:s.source});}
  const ms=(Number.isFinite(e.elapsedMs)?Math.max(0,Math.min(2000,e.elapsedMs)):0)*speed;s.confirmedMs+=ms;
  p.fatigue=clamp(p.fatigue-ms/60000*SLEEP.fatigueRecovery);
  if(Number.isFinite(p.needs?.drunk))p.needs.drunk=clamp(p.needs.drunk-ms/60000*SLEEP.drunkRecovery);
  if(s.confirmedMs>=SLEEP.minMs&&p.fatigue<=SLEEP.wakeBelow){s.phase='waking';s.wakeAt=now;s.reason='restored';}
 }
 if(e.phase==='done'&&s.phase==='waking'){
  addMemory(p,{event:'sleep_finished',kind:s.kind,place:p.place,startedAt:s.startedAt,endedAt:now,participatingSeconds:s.confirmedMs/1000,
   fatigueBefore:s.fatigueBefore,fatigueAfter:p.fatigue,drunkBefore:s.drunkBefore,drunkAfter:p.needs?.drunk??0,reason:s.reason,source:'sleep_executor'});
  p.sleep=null;p.sleepRestoredAt=now;
 }
 return true;
}
