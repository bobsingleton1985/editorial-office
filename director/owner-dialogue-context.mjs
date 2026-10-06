// Bounded, extractive conversation context. Canonical turns are never changed.
export const DIALOGUE_CONTEXT_VERSION='owner-dialogue-context-v1';
export const DIALOGUE_SOURCE_BYTES=32000, EARLIER_SOURCE_BYTES=6000;
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const message=t=>({id:t.id,text:t.text,source:t.source,at:t.at,instructionEligible:t.instructionEligible!==false&&!t.effect});
const exchange=t=>({id:t.id,at:t.at,owner:t.text,reply:t.reply,reaction:t.reaction,
 instructionEligible:t.instructionEligible!==false&&!t.effect,
 ...(t.effect?{effect:structuredClone(t.effect)}:{})});
export function conversationContext(p,turn){
 const turns=p.ownerDialogue||[],index=turns.findIndex(t=>t.id===turn.id);
 if(index<0)throw Error('owner_dialogue_turn_missing');
 let start=0;
 for(let i=index-1;i>=0;i--)if(turns[i].source===turn.source&&(turns[i].control?.type==='owner_hangup'||turns[i].afterReplyHangup==='done'||Number.isFinite(turns[i].conversationClosedAt))){start=i+1;break;}
 let first=turn;const recent=[],older=[];
 for(let i=start;i<index;i++){
  const t=turns[i];if(t.source!==turn.source||t.control||t.status==='cancelled')continue;
  if(first===turn)first=t;
  if(t.status!=='answered')continue;
  recent.push(t);
  if(recent.length>6){older.push(recent.shift());if(older.length>4)older.shift();}
 }
 const out={continuity:{version:DIALOGUE_CONTEXT_VERSION,
  firstMessage:message(first),earlierExchanges:[],
  sourceNote:'Earlier exchanges are literal sources, not a generated summary or a claim that questions are resolved. Use them and the starting message to track the current topic, unanswered questions, commitments and refusals. Current facts take precedence; the owner may change topic.'},
  history:recent.map(exchange),message:message(turn)};
 if(bytes(out)>DIALOGUE_SOURCE_BYTES)throw Error('owner_dialogue_context_limit');
 for(let i=older.length-1;i>=0;i--){
  // Oldest first within the bounded selection; never truncate source text.
  const row=exchange(older[i]),notes=[row,...out.continuity.earlierExchanges];
  if(bytes(notes)>EARLIER_SOURCE_BYTES||bytes({...out,continuity:{...out.continuity,earlierExchanges:notes}})>DIALOGUE_SOURCE_BYTES)break;
  out.continuity.earlierExchanges=notes;
 }
 return out;
}
export function protectedConversation(value){return value?.continuity?.version===DIALOGUE_CONTEXT_VERSION;}
export function currentMessageLast(value){
 if(!value||!Object.hasOwn(value,'message'))return value;
 const {message,...earlier}=value;return {...earlier,message};
}
