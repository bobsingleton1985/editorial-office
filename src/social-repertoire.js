import {styleAllowed} from './conversation-policy.mjs';
import {SOCIAL_CATALOG,socialCatalogFor,socialAlias,socialPlan} from './social-playback.js';
// One chain is one variation, including its required native entry and exit clips.
// Duplicate native recordings in different packs count once, not as extra variety.
function repertoire(catalog) {
 const entries=new Map(catalog.entries.map(e=>[e.id,e]));
 return catalog.styles.map(style=>{
  const clips=style.entries.map(id=>entries.get(id));
  return {...style,identity:clips.map(e=>e?.sourceIdentity||e?.animation||'missing').join('|'),available:clips.every(e=>e?.available&&e.animation&&e.range?.[0]===0&&e.nativeSpeed===1),clips};
 });
}
export const CONVERSATION_REPERTOIRE=repertoire(SOCIAL_CATALOG);
const banks=new Map([[SOCIAL_CATALOG,CONVERSATION_REPERTOIRE]]);
export function conversationRepertoire(context,duration) {
 const catalog=socialCatalogFor(context.actorKind),profile=context.pose==='standing'?'stand':context.pose,seen=new Set(),out=[];
 if(!banks.has(catalog))banks.set(catalog,repertoire(catalog));
 for(const s of banks.get(catalog)){
  if(!s.available||!styleAllowed(s.id,context.intent,context.relation,context.pose,context))continue;
  if((s.profile||'stand')!==(profile==='teletype-standing'?'stand':profile))continue;
  if(s.clips.some(e=>!Number.isFinite(duration(socialAlias(e.id)))||Math.abs(duration(socialAlias(e.id))-e.range[1])>1/30))continue;
  if(seen.has(s.identity))continue;
  const plan=socialPlan(s.id,s.id,0,duration,context);if(!plan)continue;
  seen.add(s.identity);out.push({id:s.id,title:s.title,identity:s.identity,plan});
 }
 return out;
}
