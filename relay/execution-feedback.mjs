import {readTvWitness} from '../director/tv-control.mjs';
import {readPhoneWitness} from './phone-feedback.mjs';
import {createServiceFeedback} from './service-feedback.mjs';
// One currently connected viewer is the executor witness. Its lease is local to SSE and never goes into world/logs.
import crypto from 'node:crypto';
export function createExecutionFeedback() {
  const service=createServiceFeedback();
  let leader=null, sequence=0, capabilities=null, lastAccepted=0;const queue=[];let sleepSamples=new Map(),sleepObservation=0;let consumptionSamples=new Map(),consumptionObservation=0;
  return {
    connect(viewer,now=Date.now()) {if(!leader){leader=viewer;lastAccepted=now;}viewer.executionLease=crypto.randomUUID();return {lease:viewer.executionLease};},
    disconnect(viewer, viewers) {if(leader===viewer) {leader=[...viewers][0]||null;queue.length=0;capabilities=null;sleepSamples.clear();consumptionSamples.clear();service.reset();}},
    accept(body, viewers, world, now) {
      const viewer=[...viewers].find(v=>v.executionLease===body?.lease);
      if(!viewer || !world?.chars || !Array.isArray(body?.pairs) || body.pairs.length>6) return false;
      if(viewer!==leader) {if(now-lastAccepted<3500)return false;leader=viewer;queue.length=0;capabilities=null;sleepSamples.clear();consumptionSamples.clear();service.reset();}
      lastAccepted=now;
      if(body.capabilities && Array.isArray(body.capabilities.styles)) {
        const actors={};for(const id of Object.keys(world.chars)){const a=body.capabilities.actors?.[id],e=world.chars[id];actors[id]={loaded:a?.loaded===true,...(a&&Number.isInteger(a.seq)&&a.seq===e.seq?{seq:a.seq,...(id==='heroine'?service.read(a,e,now):{}),performanceDurations:Object.fromEntries(Object.entries(a.performanceDurations||{}).filter(([k,v])=>['heroine_dance1','heroine_dance2','heroine_pose1','heroine_love1'].includes(k)&&Number.isFinite(v)&&v>0&&v<120)),performanceWitness:a.performanceWitness?.id===e.performance?.id&&a.performanceWitness?.activity===e.activity&&Number.isFinite(a.performanceWitness?.duration)&&a.performanceWitness.duration>0&&a.performanceWitness.duration<600&&Number.isFinite(a.performanceWitness?.renderedMs)&&a.performanceWitness.renderedMs>=0&&a.performanceWitness.renderedMs<=600000?{id:e.performance.id,activity:e.activity,duration:a.performanceWitness.duration,renderedMs:a.performanceWitness.renderedMs,complete:a.performanceWitness.complete===true}:null,smokingAvailable:a.smokingAvailable===true,smoking:a.smoking?.seq===e.seq&&a.activity===e.activity&&['smoke','smoke_coffee'].includes(e.activity)?{seq:e.seq,sip:a.smoking.sip===true,cig:a.smoking.cig===true,lit:a.smoking.lit===true&&a.smoking.cig===true}:null,moneyWitness:a.moneyWitness===1?1:0,moneyWorkMs:Number.isFinite(a.moneyWorkMs)&&a.moneyWorkMs>=0?a.moneyWorkMs:0,meals:Array.isArray(a.meals)?a.meals.filter(x=>typeof x==='string'&&/^[a-z_]{1,40}$/.test(x)).slice(0,32):null,mealDurations:Object.fromEntries(Object.entries(a.mealDurations||{}).filter(([k,v])=>/^[a-z_]{1,40}$/.test(k)&&Number.isFinite(v)&&v>0&&v<300)),styles:Array.isArray(a.styles)?a.styles.filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,160):[],conversationId:typeof a.conversationId==='string'&&a.conversationId===e.social?.id?a.conversationId:null,conversationReady:a.conversationReady===true&&a.conversationId===e.social?.id&&a.activity==='conversation',activity:typeof a.activity==='string'?a.activity.slice(0,40):null,executing:a.executing===true,executionEnd:a.executionEnd?.seq===e.seq&&a.executionEnd.outcome==='completed'?{seq:e.seq,outcome:'completed',replayed:a.executionEnd.replayed===true}:null,mode:['idle','seated','walk','turn','trans','settle','whisky'].includes(a.mode)?a.mode:null,seat:typeof a.seat==='string'&&/^(desk[ABC]|bench[SMN]|diningChair)$/.test(a.seat)?a.seat:null,x:Number.isFinite(a.x)?a.x:null,z:Number.isFinite(a.z)?a.z:null,diningChairClear:a.diningChairClear===true,sleepAvailable:a.sleepAvailable===true,readingAvailable:a.readingAvailable===true,profiles:Array.isArray(a.profiles)?a.profiles.filter(x=>['stand','teletype-standing','desk-front','bench-left','bench-right','bench-front'].includes(x)):[]}:{})};}
        for(const [id,a] of Object.entries(actors)){
          const e=world.chars[id],raw=body.capabilities.actors?.[id];
          Object.assign(a,readTvWitness(raw,e));a.phone=readPhoneWitness(raw,e);
          a.consumptionAvailable=id==='heroine'&&a.loaded&&a.seq===e.seq&&Array.isArray(raw?.consumptionAvailable)?raw.consumptionAvailable.filter(x=>['heroine_coffee','whisky'].includes(x)):[];
          const s=raw?.consumption,kind=e.activity==='heroine_coffee'?'coffee':e.activity==='whisky'?'whisky':null,prev=consumptionSamples.get(id);
          if(id==='heroine'&&kind&&a.seq===e.seq&&a.activity===e.activity&&s?.seq===e.seq&&s.kind===kind&&Number.isFinite(s.totalMs)&&s.totalMs>=0&&s.totalMs<=2000){
            const elapsedMs=prev&&prev.seq===e.seq&&prev.kind===kind&&now>prev.at&&now-prev.at<3500&&s.totalMs>=prev.total?Math.max(0,Math.min(2000,now-prev.at,s.totalMs-prev.total)):0;
            a.consumption={seq:e.seq,kind,elapsedMs,observation:++consumptionObservation};consumptionSamples.set(id,{seq:e.seq,kind,total:s.totalMs,at:now});
          }else consumptionSamples.delete(id);
        }
        for(const [id,a] of Object.entries(actors)){
          const raw=body.capabilities.actors?.[id]?.sleep,e=world.chars[id],previous=sleepSamples.get(id);
          if(!raw||raw.id!==e.sleep?.id||a.seq!==e.seq||!['entering','asleep','waking','done'].includes(raw.phase)||!Number.isFinite(raw.elapsedMs)||raw.elapsedMs<0||!Number.isFinite(raw.poseStartedAt)||raw.poseStartedAt<e.sleep.requestedAt||raw.poseStartedAt>now){sleepSamples.delete(id);continue;}
          const fresh=previous&&previous.id===raw.id&&now-previous.at<=3500&&raw.elapsedMs>=previous.ms;
          const elapsedMs=fresh&&raw.phase==='asleep'&&previous.phase==='asleep'?Math.max(0,Math.min(2000,now-previous.at,raw.elapsedMs-previous.ms)):0;
          a.sleep={id:raw.id,phase:raw.phase,poseStartedAt:raw.poseStartedAt,elapsedMs,observation:++sleepObservation};
          sleepSamples.set(id,{id:raw.id,phase:raw.phase,ms:raw.elapsedMs,at:now});
        }
        capabilities={at:now,actors,styles:body.capabilities.styles.filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,160)};
      }
      for(const p of body.pairs) {
        if(!p || typeof p!=='object' || Array.isArray(p) || typeof p.conversationId!=='string' || p.conversationId.length>64 || !Number.isFinite(p.elapsedMs) || p.elapsedMs<0 || p.elapsedMs>2000 || !p.actors || typeof p.actors!=='object' || Array.isArray(p.actors))continue;
        const ids=Object.keys(p.actors);if(ids.length!==2)continue;
        const actors={};let valid=true;
        for(const id of ids) {const a=p.actors[id],e=world.chars[id];
          if(!a || typeof a!=='object' || !e || a.seq!==e.seq || e.social?.id!==p.conversationId || e.social?.partner!==a.partner || typeof a.ready!=='boolean') {valid=false;break;}
          actors[id]={seq:a.seq,partner:a.partner,ready:a.ready};
          const x=a.expression,event=e.social.visual?.events?.find(v=>v.actor===id&&v.intentEventId===x?.id);
          if(a.ready&&event&&Number.isInteger(x?.intentRevision)&&x.intentRevision===e.social.intent?.revision&&x.intentRevision===event.intentRevision&&x.intent===event.intent&&x.style===event.style&&typeof x.id==='string'&&x.id.length<160){
            actors[id].expression={id:x.id,intentRevision:x.intentRevision,intent:x.intent,style:x.style};
          }
        }
        if(valid)queue.push({conversationId:p.conversationId,actors,at:now,elapsedMs:p.elapsedMs,seq:++sequence});
      }
      if(queue.length>120)queue.splice(0,queue.length-120);return true;
    },
    read(since=0) {return queue.filter(x=>x.seq>since);},
    capabilities(now) {return capabilities && now-capabilities.at<3500 ? capabilities:null;},
    supported:true,
  };
}
