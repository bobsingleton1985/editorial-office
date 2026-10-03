import {styleAllowed,visualIntentAt} from './conversation-policy.mjs';
import {sample as sampleGestures} from './gestures.js';
import {SOCIAL_CATALOG,socialPlan,socialAlias} from './social-playback.js';
import {conversationRepertoire} from './social-repertoire.js';
import {chooseConversationVariant} from './conversation-variants.mjs';
// Visual choreography only. No invented words, topics, feelings or semantic speaking events.
// All participants replay one timeline from the director's first verified participation.
// Choice events remain in the current pair until it ends; continue never repeats a choice.
// Listener uses the continuous native standing breathing idle. Explicit Jev styles
// may include every reaction clip, so a disjoint idle prevents delayed-choice collisions.
const CAPACITY=Math.max(...SOCIAL_CATALOG.styles.map(style=>style.entries.reduce((sum,id)=>sum+(SOCIAL_CATALOG.entries.find(e=>e.id===id)?.range?.[1]||0)-0.35,0)+0.35));
const byAlias=new Map(SOCIAL_CATALOG.entries.filter(e=>e.available).map(e=>[socialAlias(e.id),e]));
export function clipIdentity(name) {return byAlias.get(name)?.animation||name;}
// Two accepted standing idle takes from different native clips, disjoint from
// the explicit social catalogue. They remain distinct during speech fades/pauses.
export function conversationBase(social,actor) {
 const seated=(social.visual?.profiles?.[actor]||social.assignment?.playbackProfile||'stand')!=='stand'&&(social.visual?.profiles?.[actor]||social.assignment?.playbackProfile)!=='teletype-standing';
 return [actor,social.partner].sort().indexOf(actor)===0?(seated?'sit_idle':'stand_idle'):(seated?'g_sit_idle_02':'g_stand_idle_02');
}
const hash=s=>{let v=0;for(const c of s)v=(v*31+c.charCodeAt(0))>>>0;return v;};
function phrase(styles,key,duration,context) {
 const segs=[];let s=0;
 for(const style of styles){const p=socialPlan(style,key,0,duration,context);if(!p)return null;for(const a of p.segs)segs.push({...a,s:a.s+s,phraseEnd:p.T+s});s+=p.T-0.35;}
 return segs.length?{segs,T:s+0.35}:null;
}
export function turnAt(social,actor,time,duration) {
 if(!social||!social.partner||!Number.isFinite(time))return null;
 const members=[actor,social.partner].sort(),seed=hash(social.id||members.join('|'));
 const anchor=social.firstParticipation;
 // Mutual addressed standing idle establishes readiness before the server confirms the start.
 if(!Number.isFinite(anchor))return {id:social.id,index:-1,start:social.agreedAt??time,end:time+1,speaker:null,listener:null,role:'waiting',segs:[],T:1,offset:0,source:'visual_choreography',waiting:true};
 const events=(social.visual?.version===1?social.visual.events:[] )||[];
 const choices=events.filter(e=>members.includes(e.actor)&&Number.isFinite(e.at)&&typeof e.style==='string').map((e,i)=>({...e,key:e.actor+'|'+e.revision+'|'+i})).sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
 const consumed=new Set(),history=[],pools=new Map();let start=anchor, index=0;
 for(;index<100000;index++) {
  const speaker=members[(index+(seed%2))%2],listener=members.find(id=>id!==speaker);
  // A small lead gives viewers time to receive the choice before its full native take starts.
  const chosen=choices.find(e=>e.actor===speaker&&!consumed.has(e.key)&&e.at+3000<=start);
  if(chosen)consumed.add(chosen.key);
  const profile=social.visual?.profiles?.[speaker]||'stand';
  const context={...visualIntentAt(social,speaker,start),pose:profile==='stand'?'standing':profile};
  const poolKey=[context.pose,context.intent,context.relation].join('|');
  if(!pools.has(poolKey))pools.set(poolKey,conversationRepertoire(context,duration));
  const pool=pools.get(poolKey),phrases=[];
  const record=(variant,at)=>{history.push({actor:speaker,id:variant.id,identity:variant.identity});phrases.push({style:variant.id,identity:variant.identity,at,T:variant.plan.T});};
  // Preserve an explicit accepted actor choice exactly once so the actual expression
  // receipt still identifies the declared style. Automatic continuation uses the registry.
  let speech=chosen&&styleAllowed(chosen.style,context.intent,context.relation,context.pose)?phrase([chosen.style],chosen.key,duration,context):null;
  const unavailableChoice=!!chosen&&!speech;
  if(speech){const variant=pool.find(p=>p.id===chosen.style)||{id:chosen.style,identity:speech.segs.map(a=>clipIdentity(a.n)).join('|'),plan:speech};record(variant,0);}
  else {const variant=chooseConversationVariant(pool,history,social.id+'|'+index+'|first',speaker);if(variant){speech={...variant.plan,segs:variant.plan.segs.map(s=>({...s}))};record(variant,0);}}
  if(!speech)return {id:social.id,index,role:'unavailable',speaker,listener,start,end:time+1,segs:[],T:1,offset:0,source:'visual_choreography',unavailable:true};
  // Boundaries remain independent of choices and history. Only complete native
  // chains that fit are appended; spare time belongs to the quiet native base.
  const capacity=CAPACITY+((seed+index*11)%5)*1.2;
  let endOfSpeech=speech.T;
  for(let fill=0;fill<10;fill++) {
   const options=pool.filter(p=>p.identity!==history.at(-1)?.identity&&endOfSpeech+p.plan.T-0.35<=capacity+1e-6&&clipIdentity(speech.segs.at(-1).n)!==clipIdentity(p.plan.segs[0].n));
   const variant=chooseConversationVariant(options,history,social.id+'|'+index+'|fill|'+fill,speaker);
   if(!variant)break;
   const next=variant.plan,at=endOfSpeech-0.35;
   speech.segs.push(...next.segs.map(seg=>({...seg,s:seg.s+at,phraseEnd:seg.phraseEnd+at})));endOfSpeech=at+next.T;record(variant,at);
  }
  const pause=0.6+((seed+index*7)%5)*0.17,T=capacity+pause,end=start+T*1000;
  if(time<end) {
   const role=actor===speaker?'speaker':'listener';
   return {id:social.id,index,start,end,speaker,listener,role,context,phrases,segs:role==='speaker'?speech.segs:[],T,offset:Math.max(0,(time-start)/1000),speechEnd:start+endOfSpeech*1000,selected:!!chosen&&!unavailableChoice,choice:chosen||null,unavailableChoice,source:'visual_choreography'};
  }
  start=end;
 }
 return null;
}
export function turnPlan(social,actor,time,clock,duration) {
 const turn=turnAt(social,actor,time,duration);if(!turn)return null;
 const profile=social.visual?.profiles?.[actor]||social.assignment?.playbackProfile||'stand';
 return {kind:['stand','teletype-standing'].includes(profile)?'stand':profile.startsWith('desk')?'desk':'bench',social:true,profile,base:conversationBase(social,actor),baseAt:social.agreedAt??social.firstParticipation??time,turn,key:social.id+'|turn|'+turn.index,t0:clock-turn.offset,segs:turn.segs,T:turn.T,selected:turn.selected};
}
export function finishTurnPlan(g,u) {
 // Keep the whole current native speech phrase/reaction; do not wait through an empty rest.
 const active=g.segs.filter(s=>u>=s.s&&u<s.s+s.d);
 const end=g.turn?.role==='speaker'&&active.length?Math.max(...active.map(s=>s.phraseEnd??s.s+s.d)):active.length?Math.max(...active.map(s=>s.s+s.d)):u+0.35;
 return {...g,segs:g.segs.filter(s=>Number.isFinite(s.phraseEnd)?s.phraseEnd<=end+1e-6:s.s<end),T:Math.min(g.T,Math.max(u+0.35,end)),wrapped:true};
}

export function sampleTurnPlan(g,u) {
 if(!g.segs.length)return {e:0,w:{}};
 const shift=g.turn?.role==='listener'?g.segs[0].s:0;
 const T=Math.min(g.T,Math.max(...g.segs.map(s=>s.s+s.d)))-shift;
 return sampleGestures({...g,T,segs:g.segs.map(s=>({...s,s:s.s-shift}))},u-shift);
}

export function conversationGazeChars(chars,people) {
 const out={...chars};
 for(const [id,e]of Object.entries(chars||{})) {
  if(!e.social)continue;
  const partner=e.social.partner,other=chars[partner],a=people[id]?.ed?.conversationStatus?.(),b=people[partner]?.ed?.conversationStatus?.();
  const agreed=other?.social?.id===e.social.id&&other.social.partner===id&&a&&b&&a.conversationId===e.social.id&&b.conversationId===e.social.id&&a.turn===b.turn&&a.at===b.at&&a.speaker===b.speaker&&(a.speaker===id||a.speaker===partner);
  out[id]={...e,social:{...e.social,turn:agreed?{speaker:a.speaker,at:a.at,revision:a.revision,source:a.source}:{speaker:null,at:0,revision:-1,source:'visual_choreography_waiting'}}};
 }
 return out;
}
