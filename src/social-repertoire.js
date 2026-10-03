import {styleAllowed} from './conversation-policy.mjs';
import {SOCIAL_CATALOG,socialAlias,socialPlan} from './social-playback.js';
const entries=new Map(SOCIAL_CATALOG.entries.map(e=>[e.id,e]));
// One chain is one variation, including its required native entry and exit clips.
// Duplicate native recordings in different packs count once, not as extra variety.
export const CONVERSATION_REPERTOIRE=SOCIAL_CATALOG.styles.map(style=>{
 const clips=style.entries.map(id=>entries.get(id));
 return {...style,identity:clips.map(e=>e?.animation||'missing').join('|'),available:clips.every(e=>e?.available&&e.animation&&e.range?.[0]===0&&e.nativeSpeed===1),clips};
});
export function conversationRepertoire(context,duration) {
 const profile=context.pose==='standing'?'stand':context.pose,seen=new Set(),out=[];
 for(const s of CONVERSATION_REPERTOIRE){
  if(!s.available||!styleAllowed(s.id,context.intent,context.relation,context.pose))continue;
  if((s.profile||'stand')!==(profile==='teletype-standing'?'stand':profile))continue;
  if(s.clips.some(e=>!Number.isFinite(duration(socialAlias(e.id)))||Math.abs(duration(socialAlias(e.id))-e.range[1])>1/30))continue;
  if(seen.has(s.identity))continue;
  const plan=socialPlan(s.id,s.id,0,duration,context);if(!plan)continue;
  seen.add(s.identity);out.push({id:s.id,title:s.title,identity:s.identity,plan});
 }
 return out;
}
