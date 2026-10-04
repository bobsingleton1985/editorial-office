import {relationProjection} from './relationship-context.mjs';
import {ensureDevelopment,recordObservation,flirtPermitted,courtshipOptions,confirmCourtship} from './relationship-development.mjs';
import {chooseConversationVariant} from './conversation-variants.mjs';
import {EXPRESSION_CATALOG} from './conversation-expression-catalog.mjs';
import {RELATION_EVIDENCE,relationshipFact,appraisalMeaning} from './relationship-facts.mjs';
import {styleAllowed,intentOptions,RELATION_TEXT,INTENT_TEXT} from './conversation-policy.mjs';
export function initializeRelationships(st){
 for(const [id,p]of Object.entries(st.chars)){p.relationships??={};for(const partner of Object.keys(st.chars))if(partner!==id)ensureDevelopment(p.relationships[partner]??={stance:'neutral',revision:0,updatedAt:null,basis:null,observations:[],decisions:[]});}
}
export function relationOf(st,id,partner){initializeRelationships(st);return st.chars[id]?.relationships[partner]||null;}
export function publicRelations(st,id){initializeRelationships(st);return Object.fromEntries(Object.entries(st.chars[id]?.relationships||{}).map(([other,r])=>[other,relationProjection(r)]));}
export function currentIntent(pair,id){return pair?.intents?.[id]||{intent:'calm',revision:0,at:pair?.agreedAt??null,basis:{kind:'initial_calm'}};}
export function availableIntents(st,pair,id){const partner=pair.members.find(x=>x!==id),r=relationOf(st,id,partner);return intentOptions(r,st.chars[id].fatigue??0,r.observations.filter(e=>e.conversationId===pair.id),{flirtAllowed:flirtPermitted(r,partner)}).filter(o=>(pair.assignments?.[id]?.playbackProfile||'stand')==='stand'||o.id==='calm');}
export function expressionStyle(pair,id,intent,available=EXPRESSION_CATALOG.map(x=>x.id)){
 const profile=pair?.assignments?.[id]?.playbackProfile||'stand',pose=profile==='stand'?'standing':profile;
 const relation=pair?.expressionRelations?.[id]||'neutral';
 const representatives={friendly:['gestures-standing__IDLE-081','gestures-standing__IDLE-083','gestures-standing__IDLE-087','clap_a','clap_b'],
  tense:['mixamo-gap__mxg_annoyed_shake','mixamo-gap__mxg_look_away','mixamo-gap__mxg_whatever','hands_hips'],object:['mixamo-gap__mxg_thoughtful_shake'],
  confront:['mixamo-gap__mxg_arguing','mixamo-gap__mxg_angry_gesture','gestures-standing__IDLE-058','gestures-standing__IDLE-061','gestures-standing__IDLE-064','emotions-loud__IDLE-058','emotions-loud__IDLE-061','emotions-loud__IDLE-064','emotions-loud__IDLE-070','emotions-loud__IDLE-071']};
 const actorKind=id==='heroine'?'heroine-her':'motus';
 const pool=EXPRESSION_CATALOG.filter(s=>s.actorKind===actorKind&&available?.includes(s.id)&&s.profile===(profile==='teletype-standing'?'stand':profile)&&styleAllowed(s.id,intent,relation,pose,{actorKind,flirtAllowed:true})&&(intent==='calm'||intent==='flirt'||s.allowedIntents?.includes(intent)||representatives[intent]?.includes(s.id)));
 return chooseConversationVariant(pool,pair.expressionHistory||[],pair.id+'|'+id+'|'+intent+'|'+((pair.intents?.[id]?.revision||0)+1),id)?.id||null;
}
export function chooseIntent(st,pair,id,intent,now,source,available){
 const option=availableIntents(st,pair,id).find(x=>x.id===intent);if(!option)return false;
 pair.expressionRelations={...(pair.expressionRelations||{}),[id]:relationOf(st,id,pair.members.find(x=>x!==id)).stance};
 const style=expressionStyle(pair,id,intent,available);if(!style)return false;
 pair.intents??={};pair.intentEvents??=[];pair.visualIntentEvents??=[];
 const revision=(pair.intents[id]?.revision||0)+1,relation=relationOf(st,id,pair.members.find(x=>x!==id));
 const event={id:pair.id+':'+id+':intent:'+revision,actor:id,intent,revision,at:now,source,basis:structuredClone(option.basis)};
 pair.intents[id]={intent,revision,at:now,basis:structuredClone(option.basis)};pair.intentEvents.push(event);
 pair.visualIntentEvents.push({...event,relation:relation.stance});
 pair.visualEvents??=[];pair.visualEvents.push({actor:id,style,revision:'intent-'+revision,at:now,intent,intentRevision:revision,intentEventId:event.id,relation:relation.stance});return true;
}
export function confirmIntentSignals(st,pair,report){
 for(const [actor,a]of Object.entries(report.actors||{})){
  const receipt=a.expression,e=(pair.intentEvents||[]).find(e=>e.actor===actor&&e.id===receipt?.id);
  if(!e||e.confirmedAt||receipt.intentRevision!==e.revision||receipt.intent!==e.intent||currentIntent(pair,actor).revision!==e.revision||report.at<e.at||!a.ready)continue;
  const visual=(pair.visualEvents||[]).find(v=>v.intentEventId===e.id&&v.actor===actor);
  if(!visual||receipt.style!==visual.style)continue;
  e.confirmedAt=report.at;const identity=EXPRESSION_CATALOG.find(x=>x.id===receipt.style)?.identity;
  if(identity){const played={actor,id:receipt.style,identity,at:report.at,eventId:e.id};pair.expressionHistory??=[];pair.expressionHistory.push(played);pair.expressionHistory=pair.expressionHistory.slice(-48);st.chars[actor].expressionHistory??=[];st.chars[actor].expressionHistory.push({...played});st.chars[actor].expressionHistory=st.chars[actor].expressionHistory.slice(-24);}
  const recipient=pair.members.find(id=>id!==actor),r=relationOf(st,recipient,actor);
  // Private stress, relationship and justification are never copied to the recipient.
  const signal={id:e.id,conversationId:pair.id,actor,intent:e.intent,kind:{flirt:'flirt_address',calm:'neutral_address',friendly:'friendly_address',tense:'self_tension',object:'directed_objection',confront:'directed_objection'}[e.intent],observedAt:report.at,source:'addressed_renderer_expression'};
  recordObservation(r,signal);
  confirmCourtship(st,actor,recipient,e,report.at);
  if(e.courtship&&['decline','later','friendly'].includes(e.courtship.answer)&&currentIntent(pair,recipient).intent==='flirt'){
    const revision=currentIntent(pair,recipient).revision+1;
    const calm={intent:'calm',revision,at:report.at,basis:{kind:'respect_received_boundary',eventId:e.id}};
    pair.intents[recipient]=calm;
    pair.visualIntentEvents.push({actor:recipient,...calm,relation:relationOf(st,recipient,actor).stance});
    pair.visualEvents=pair.visualEvents.filter(v=>v.actor!==recipient);
  }
 }
}
// Only producers of completed public world events call these builders.
function observe(st,id,partner,event){
 if(id===partner||!st.chars[id]||!st.chars[partner]||!RELATION_EVIDENCE[event.kind])return false;
 const r=relationOf(st,id,partner);if(r.observations.some(e=>e.id===event.id))return false;
 return recordObservation(r,event);
}
export function observeConversationExperience(st,id,episode){
 if(episode.event!=='conversation_finished'||!Number.isFinite(episode.startedAt)||!(episode.participatingSeconds>0))return false;
 return observe(st,id,episode.partner,{id:episode.conversationId+':experienced:'+id,kind:'conversation_experienced',actor:episode.partner,
  conversationId:episode.conversationId,observedAt:episode.endedAt,startedAt:episode.startedAt,participatingSeconds:episode.participatingSeconds,
  ownNeedsBefore:episode.ownNeedsBefore,ownNeedsAfter:episode.ownNeedsAfter,completionReason:episode.reason,completionSource:episode.source,
  source:'confirmed_joint_participation'});
}
export function observeWorkCompleted(st,actor,task,now){
 if(!st.chars[actor]||!task?.id||!(task.need_min>0)||!(task.done_min>=task.need_min))return false;
 let changed=false;
 for(const id of Object.keys(st.chars))if(id!==actor)changed=observe(st,id,actor,{id:'work-finished:'+task.id+':'+actor,kind:'work_completed',actor,
  taskId:task.id,title:task.title,observedAt:now,source:'director_work_finished',visibility:'shared_newsroom_state'})||changed;
 return changed;
}
function pendingEvidence(r){
 return r.observations.filter(e=>RELATION_EVIDENCE[e.kind]&&!e.appraisedAt&&e.id!==r.basis?.id&&(!r.lastAppraisal?.consideredEventIds?.includes(e.id)));
}
export function relationOptions(st,id,partner){
 const r=relationOf(st,id,partner);if(!r)return [];
 const fresh=pendingEvidence(r);if(!fresh.length)return [];
 const result=[];
 for(const stance of ['neutral','warm','guarded']){
  const evidence=fresh.filter(e=>stance===r.stance||stance==='neutral'||stance==='warm'&&RELATION_EVIDENCE[e.kind].positive||stance==='guarded'&&RELATION_EVIDENCE[e.kind].guarded).at(-1);
  if(evidence)result.push({stance,evidence,unchanged:stance===r.stance,meaning:appraisalMeaning(stance,r.stance,evidence)});
 }
 return result;
}
export function appraisalAction(partner,option){return 'relationship_appraise@'+partner+':'+option.stance+':'+encodeURIComponent(option.evidence.id);}
export function appraisalActions(st,id,names={}){
 const result=[];
 for(const partner of Object.keys(st.chars))if(partner!==id)for(const option of relationOptions(st,id,partner))result.push({id:appraisalAction(partner,option),description:
  'Своя оценка отношения к '+(names[partner]||partner)+': '+option.meaning+' Факт: '+relationshipFact(option.evidence,names[partner]||partner)+
  ' Время события: '+option.evidence.observedAt+'. Это отдельное решение; текущее занятие и путь продолжаются. Можно выбрать обычное действие без пересмотра отношения.'});
 return result;
}
export function chooseAppraisal(st,id,partner,stance,eventId,now,source,confidence=null){
 if(source!=='jev')return false; // the fallback never invents the character's appraisal
 const choice=relationOptions(st,id,partner).find(x=>x.stance===stance&&x.evidence.id===eventId);if(!choice)return false;
 const r=relationOf(st,id,partner),before=r.stance,consideredEventIds=pendingEvidence(r).map(e=>e.id);
 r.revision++;if(stance!==before){r.stance=stance;r.updatedAt=now;r.basis=structuredClone(choice.evidence);}
 const event={event:stance===before?'relationship_appraised':'relationship_changed',partner,before,after:stance,at:now,source,confidence,
  basis:structuredClone(choice.evidence),assessment:choice.meaning,assessmentSource:'selected_appraisal_option',consideredEventIds};
 for(const e of r.observations)if(consideredEventIds.includes(e.id))e.appraisedAt=now;
 r.lastAppraisal=structuredClone(event);r.decisions.push(event);r.decisions=r.decisions.slice(-6);
 st.chars[id].memory.push(structuredClone(event));st.chars[id].memory=st.chars[id].memory.slice(-12);
 const pair=Object.values(st.social?.pairs||{}).find(p=>p.members.includes(id)&&p.members.includes(partner));
 if(pair){pair.expressionRelations={...(pair.expressionRelations||{}),[id]:stance};pair.visualIntentEvents??=[];const intent=currentIntent(pair,id);pair.visualIntentEvents.push({actor:id,intent:intent.intent,relation:stance,revision:intent.revision,at:now,basis:structuredClone(intent.basis)});}
 return true;
}
// Compatibility for old, explicitly chosen conversation-scoped appraisals.
export function chooseRelation(st,pair,id,stance,now,source){
 const partner=pair.members.find(x=>x!==id),option=relationOptions(st,id,partner).find(x=>x.stance===stance);return !!option&&chooseAppraisal(st,id,partner,stance,option.evidence.id,now,source);
}
export {RELATION_TEXT,INTENT_TEXT,relationshipFact};

export function observeFinancialFact(st,id,partner,event){
 if(event.source!=="agreed_money_ledger"||!["gift_accepted","loan_repaid","loan_forgiven","loan_overdue"].includes(event.kind))return false;
 return observe(st,id,partner,event);
}

export function courtshipActions(st,pair,id){
 if(!pair||pair.phase!=='active')return [];
 const partner=pair.members.find(x=>x!==id),r=relationOf(st,id,partner);
 return courtshipOptions(r,id,partner).filter(o=>!(pair.intentEvents||[]).some(e=>e.actor===id&&!e.confirmedAt&&e.revision===currentIntent(pair,id).revision&&e.courtship?.replyTo===o.replyTo)).map(o=>({id:`courtship_reply@${o.answer}:${encodeURIComponent(o.replyTo)}`,description:o.statement+' Это отдельный ответ на наблюдавшийся флирт, без обещания танца или поцелуя.',...o}));
}
export function chooseCourtship(st,pair,id,action,now,source,available){
 if(source!=='jev')return false;
 const o=courtshipActions(st,pair,id).find(o=>o.id===action);if(!o)return false;
 if(!chooseIntent(st,pair,id,o.intent,now,source,available))return false;
 const detail={answer:o.answer,replyTo:o.replyTo,statement:o.statement};
 pair.intentEvents.at(-1).courtship=detail;pair.intents[id].courtship=detail;
 pair.visualIntentEvents.at(-1).courtship=detail;
 return true;
}

export function observePerformanceCompleted(st,contract,now){
 if(contract.status!=='paid'||!st.chars[contract.payer]||!st.chars[contract.performer])return false;
 return observe(st,contract.payer,contract.performer,{id:'performance-completed:'+contract.id,kind:'performance_completed',actor:contract.performer,observedAt:now,source:'confirmed_whole_performance',summary:'Героиня полностью исполнила согласованное выступление перед тобой. Это профессиональная работа, не романтическое согласие.'});
}
