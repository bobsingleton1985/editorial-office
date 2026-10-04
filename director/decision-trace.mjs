// Local diagnostic side channel. Never sent to Jev or the public relay.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const dir=process.env.JEV_TRACE_DIR;
export const newTraceId=()=>randomUUID();
const forbidden=/^(authorization|api[_-]?key|key|token|.*[_-]token|session_id|lease|serviceLease|pairing.*)$/i;
const reflectionDimensions=new Set(['professional','personal','sympathy','romance','jealousy']);
const reflectionPaths=new Set(['snapshot.self.reflection','wireSnapshot.self.reflection']);
function check(value,where=[]){
  if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){
    const semanticDimension=k==='key'&&reflectionPaths.has(where.join('.'))&&reflectionDimensions.has(v);
    if(forbidden.test(k)&&!semanticDimension)throw Error('secret_field');check(v,[...where,k]);
  }
}
export function trace(traceId,event,fields={}){
  if(!dir)return;
  try{
    check(fields);
    // Serialize now: callers may subsequently mutate their world.
    const row=JSON.stringify({schema:'jev-trace-v1',source:'director',traceId,event,recordedAt:new Date().toISOString(),...fields});
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.appendFileSync(path.join(dir,'director.jsonl'),row+'\n',{mode:0o600});
  }catch{console.error('Jev diagnostics: director trace not saved');}
}
export function decisionKind(action){
  const verb=action.split(/[@:]/)[0];
  if(verb==='courtship_reply')return 'courtship_response';
  if(verb==='relationship_reflect')return 'relationship_reflection';
  if(verb.startsWith('money_')&&!['money_performance_start','money_performance_watch'].includes(verb))return 'economic_decision';
  if(['accept','decline','defer'].includes(verb))return 'invitation_response';
  if(verb.startsWith('invite_')||['invite','social_invite','social_join'].includes(verb))return 'invitation';
  if(['relationship_appraise','social_relation'].includes(verb))return 'relationship_appraisal';
  if(verb==='social_intent')return 'conversation_intent';
  if(verb==='social_style')return 'gesture';
  if(verb==='social_leave')return 'conversation_departure';
  return 'physical_action';
}
export function offeredKinds(actions){return [...new Set(actions.map(a=>decisionKind(a.id)))];}
export function mappedDecision(d,choices){
  return {...d,action:choices.get(d.action),
    ...(d.probabilities?{probabilities:Object.fromEntries(Object.entries(d.probabilities).map(([id,p])=>[choices.get(id),p])),
      top_three:d.top_three?.map(a=>({...a,action:choices.get(a.action)}))}:{})};
}
