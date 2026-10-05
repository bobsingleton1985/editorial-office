import {HER_SOCIAL_CATALOG} from './heroine-social-catalog.mjs';
// Shared semantic admission policy. A clip never creates a relationship or intent.
export const CONVERSATION_POLICY_VERSION='relations-v3-neutral-flirt-initiation';
export const INTENT_TEXT={flirt:'выразить собственный интерес ненавязчивым флиртом',calm:'спокойно поговорить',friendly:'обратиться доброжелательно',tense:'обозначить своё напряжение',object:'попросить собеседника говорить спокойнее',confront:'открыто возразить на выраженное возражение собеседника'};
export const RELATION_TEXT={neutral:'нейтральное',warm:'доброжелательное',guarded:'настороженное'};
const calm=['gestures-standing__IDLE-082','gestures-standing__IDLE-084','gestures-standing__IDLE-085','gestures-standing__IDLE-086','mixamo-gap__mxg_thoughtful_nod','mixamo-gap__mxg_thoughtful_shake','mixamo-gap__mxg_thinking','mixamo-gap__mxg_shrugging','arms_crossed'];
const friendly=['gestures-standing__IDLE-081','gestures-standing__IDLE-083','gestures-standing__IDLE-087'];
const tense=['mixamo-gap__mxg_annoyed_shake','mixamo-gap__mxg_look_away','mixamo-gap__mxg_whatever','hands_hips'];
const confront=['mixamo-gap__mxg_arguing','mixamo-gap__mxg_angry_gesture','gestures-standing__IDLE-058','gestures-standing__IDLE-061','gestures-standing__IDLE-064','emotions-loud__IDLE-058','emotions-loud__IDLE-061','emotions-loud__IDLE-064','emotions-loud__IDLE-070','emotions-loud__IDLE-071'];
const heroineStyles=new Map(HER_SOCIAL_CATALOG.styles.filter(s=>s.entries.every(id=>HER_SOCIAL_CATALOG.entries.some(e=>e.id===id&&e.available))).map(s=>[s.id,s]));
export function styleAllowed(style,intent='calm',relation='neutral',pose='standing',context={}){
 if(typeof style!=='string'||!INTENT_TEXT[intent])return false;
 if(intent==='flirt'&&(context.flirtAllowed===false||!['neutral','warm'].includes(relation)))return false;
 if(style.startsWith('heroine-native__')){
  const s=heroineStyles.get(style),profile=pose==='standing'?'stand':pose;
  return !!s&&(!context.actorKind||context.actorKind==='heroine-her')&&s.profile===profile&&s.allowedIntents.includes(intent)&&(!s.relation||s.relation===relation);
 }
 if(context.actorKind==='heroine-her')return false;
 // A quiet native response may accompany one's own declared flirt, but never
 // implies that the partner reciprocates. Expressive MOTUS styles keep their rules.
 if(intent==='flirt')return pose==='standing'&&(style==='neutral'||calm.includes(style));
 if(pose==='teletype-standing')return intent==='calm'&&['gestures-standing__IDLE-082','gestures-standing__IDLE-084'].includes(style);
 if(pose!=='standing')return intent==='calm'&&((pose==='desk-front'&&/^desk-front__SEAT-(146|147)$/.test(style))||(pose==='bench-left'&&/^bench-left__SEAT-(024|025)$/.test(style))||(pose==='bench-right'&&/^bench-right__SEAT-(029|030)$/.test(style))||(pose==='bench-front'&&/^bench-front__SEAT-(018|020|021)$/.test(style))); 
 if(intent==='object')intent='tense';
 if(style==='neutral'||calm.includes(style))return true;
 if(friendly.includes(style))return intent==='friendly';
 if(['clap_a','clap_b'].includes(style))return intent==='friendly'&&relation==='warm';
 if(tense.includes(style))return intent==='tense'||intent==='confront';
 return confront.includes(style)&&intent==='confront';
}
export function intentOptions(relation,fatigue,signals=[],context={}){
 const basis=[];
 if(fatigue>=65)basis.push({kind:'own_fatigue',value:fatigue});
 if(relation?.stance==='guarded'&&relation.basis)basis.push({kind:'own_relationship',revision:relation.revision,evidence:relation.basis});
 const recent=signals.filter(x=>x.kind==='directed_objection');
 const tenseSignal=signals.filter(x=>x.kind==='self_tension').at(-1);
 if(recent.length)basis.push({kind:'received_intent',evidence:recent.at(-1)});
 return [{id:'calm',basis:{kind:'own_choice'}},{id:'friendly',basis:{kind:'own_choice'}},...(context.flirtAllowed===true&&['neutral','warm'].includes(relation?.stance)?[{id:'flirt',basis:{kind:'own_choice'}}]:[]),...(basis.length?[{id:'tense',basis:basis[0]}]:[]),...(tenseSignal?[{id:'object',basis:{kind:'received_manner',evidence:tenseSignal}}]:[]),...(recent.length?[{id:'confront',basis:{kind:'received_intent',evidence:recent.at(-1)}}]:[])];
}
export function visualIntentAt(social,actor,time){
 const events=(social.visual?.intentEvents||[]).filter(e=>e.actor===actor&&Number.isFinite(e.at)&&e.at+3000<=time&&INTENT_TEXT[e.intent]);
 const e=events.sort((a,b)=>a.at-b.at||(a.revision||0)-(b.revision||0)).at(-1);return {intent:e?.intent||'calm',relation:e?.relation||'neutral',basis:e?.basis||null};
}
