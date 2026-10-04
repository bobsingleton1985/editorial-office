import {satisfyMutualFlirt} from './flirt-need.mjs';
import {initializeRelationships,publicRelations,currentIntent,confirmIntentSignals,observeConversationExperience} from './relationship-core.mjs';
// Canonical joint participation. Only fresh, revision-matching executor intervals satisfy social.
export const SOCIAL = { grow: 0.6, start: 35, relief: 18, freshness: 3500, maxFrame: 2000 };
export function initializeSocial(st) { initializeRelationships(st); st.social ??= { next: 0, pairs: {}, deferred: {} }; return st.social; }
export function pairOf(st, id) { return Object.values(initializeSocial(st).pairs).find(p => p.members.includes(id)) || null; }
export function beginConversation(st, a, b, places, now, source) {
  if (a === b || !st.chars[a] || !st.chars[b] || pairOf(st,a) || pairOf(st,b)) return null;
  const s=initializeSocial(st), id='conversation-'+(++s.next);
  const p=s.pairs[id]={id,members:[a,b],places,agreedAt:now,consentSource:source,seconds:0,simulatedSeconds:0,lastReport:0,firstParticipation:null,
    expressionHistory:[a,b].flatMap(id=>st.chars[id].expressionHistory||[]).sort((x,y)=>x.at-y.at).slice(-48),expressionRelations:Object.fromEntries([a,b].map(id=>[id,st.chars[id].relationships[id===a?b:a].stance])),
    intents:{},intentEvents:[],visualIntentEvents:[],visualEvents:[], needsBefore:{}, needsAfter:{}, phase:'approach', reportSeq:0};
  return p;
}
export function publicConversation(st, id, includeVisual=false) {
  const p=pairOf(st,id); if(!p)return null;
  return {id:p.id,partner:p.members.find(x=>x!==id),intent:{...structuredClone(currentIntent(p,id)),expressedAt:(p.intentEvents||[]).find(e=>e.actor===id&&e.revision===currentIntent(p,id).revision)?.confirmedAt||null},relationship:publicRelations(st,id)[p.members.find(x=>x!==id)],phase:p.phase,participatingSeconds:p.seconds,agreedAt:p.agreedAt,
    assignment:structuredClone(p.assignments?.[id]||null),firstParticipation:p.firstParticipation,...(includeVisual?{visual:{version:1,members:[...p.members],actorKinds:Object.fromEntries(p.members.map(id=>[id,id==='heroine'?'heroine-her':'motus'])),profiles:Object.fromEntries(p.members.map(id=>[id,p.assignments?.[id]?.playbackProfile||'stand'])),events:(p.visualEvents||[]).map(e=>({...e})),intentEvents:(p.visualIntentEvents||[]).map(e=>({...e}))}}:{}),simulatedParticipatingSeconds:p.simulatedSeconds,consentSource:p.consentSource};
}
export function finishConversation(st, id, reason, source, now) {
  const p=pairOf(st,id); if(!p)return null;
  for(const member of p.members) {
    const actor=st.chars[member], own=member===id;
    const event={event:p.seconds>0?'conversation_finished':'conversation_cancelled',conversationId:p.id,partner:p.members.find(x=>x!==member),
      agreedAt:p.agreedAt,startedAt:p.firstParticipation,endedAt:now,participatingSeconds:p.seconds,simulatedParticipatingSeconds:p.simulatedSeconds,
      ownNeedsBefore:p.needsBefore[member]??null,ownNeedsAfter:actor.needs.social,
      ...(p.flirtEpisodes?.[member]?{flirt:{...p.flirtEpisodes[member],after:actor.needs.flirt}}:{}),
      reason:own?reason:reason==='self_leave'?'partner_departure':reason,source,initiator:id};
    observeConversationExperience(st,member,event);
    actor.memory.push(event);actor.memory=actor.memory.slice(-12);
    actor.busyUntil=Math.min(actor.busyUntil,now);
    if(!own){actor.activity='wait';actor.activityUntil=now;actor.since=now;actor.entry={...actor.entry,activity:'wait',label:'собеседник завершил участие',source};}
  }
  delete st.social.pairs[p.id];return p;
}
export function applyParticipation(st, report, now, fast=1) {
  const p=initializeSocial(st).pairs[report?.conversationId];
  if(!p || !Number.isInteger(report.seq) || report.seq<=p.reportSeq || !Number.isFinite(report.at) || now-report.at>SOCIAL.freshness || report.at>now+250) return false;
  p.reportSeq=report.seq;
  const actors=report.actors;
  const valid=p.members.every(id=>actors?.[id]?.seq===st.chars[id].seq && st.chars[id].activity==='conversation' && actors[id].ready===true && actors[id].partner===p.members.find(x=>x!==id));
  if(!valid) {p.phase='waiting';p.lastReport=report.at;p.wasReady=false;return false;}
  if(!p.wasReady || report.at-p.lastReport>SOCIAL.freshness) {p.wasReady=true;p.lastReport=report.at;p.phase='active';return false;}
  // First report only establishes readiness; never infer participation before an actual rendered interval.
  const elapsed=Math.min(SOCIAL.maxFrame, Math.max(0,report.elapsedMs||0),Math.max(0,report.at-(p.lastReport||report.at)));
  const seconds=elapsed/1000*fast;
  p.lastReport=report.at;p.phase='active';
  if(!seconds)return false;
  if(p.firstParticipation===null) {p.firstParticipation=report.at-elapsed;for(const id of p.members)p.needsBefore[id]=st.chars[id].needs.social;}
  confirmIntentSignals(st,p,report);
  satisfyMutualFlirt(st,p,seconds);
  p.seconds+=elapsed/1000;p.simulatedSeconds+=seconds;
  for(const id of p.members) {const n=st.chars[id].needs; n.social=Math.max(0,n.social-SOCIAL.relief*seconds/60);p.needsAfter[id]=n.social;}
  return true;
}
export function pauseParticipation(st, now) {for(const p of Object.values(initializeSocial(st).pairs)) {p.lastReport=0;p.wasReady=false;p.phase='waiting';p.pausedAt=now;}}
export function expireParticipation(st, now) {for(const p of Object.values(initializeSocial(st).pairs))if(now-p.lastReport>SOCIAL.freshness){p.phase=p.firstParticipation===null?'approach':'waiting';p.wasReady=false;}}
