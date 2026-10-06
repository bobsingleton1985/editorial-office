import {privateTurn} from './phone-privacy.mjs';
// Bounded, extractive conversation context. Canonical turns are never changed.
export const DIALOGUE_CONTEXT_VERSION='owner-dialogue-context-v1';
export const DIALOGUE_SOURCE_BYTES=32000, EARLIER_SOURCE_BYTES=6000;
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const message=t=>({id:t.id,text:t.text,source:t.source,confidential:privateTurn(t),at:t.at,instructionEligible:t.instructionEligible!==false&&!t.effect});
const exchange=t=>({id:t.id,at:t.at,owner:t.text,reply:t.reply,reaction:t.reaction,
 instructionEligible:t.instructionEligible!==false&&!t.effect,
 ...(t.intent?.kind==='action'?{activityRequest:{instruction:t.intent.instruction,target:t.intent.target,disposition:t.intent.disposition??null,choiceReason:t.intent.choiceReason??null}}:{}),
 ...(t.effect?{effect:structuredClone(t.effect)}:{})});
export function conversationContext(p,turn){
 const turns=(p.ownerDialogue||[]).filter(t=>privateTurn(t)===privateTurn(turn)),index=turns.findIndex(t=>t.id===turn.id);
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
  sourceNote:'Literal exchanges record what was said, not verified biography, schedules or completed actions. Resolve omitted verbs, pronouns, corrections and comparisons from the preceding owner question AND your reply, not just the newest noun. An elliptical follow-up normally continues that subject; an explicit new question may change it. Address the substantive question still awaiting an answer. First answer the proposition under discussion (yes, no or unknown when appropriate), before expressing emotion. Courtesy and emotion accompany the substantive answer, never replace it. Do not substitute reassurance, flattery or an unrelated report about a named colleague. A correction must identify the erroneous claim; a general apology is insufficient. Never invent a motive for your previous error. If your earlier reply invented a fact, correct that claim while staying on the subject; if the referent remains ambiguous, ask one natural clarification. Track commitments and refusals from these literal sources and the starting message. Supplied current facts and confirmed effects take precedence over earlier claims; the owner may change topic.'},
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
 const {message,history,...earlier}=value;return {...earlier,...(history!==undefined?{history}:{}),message};
}
// Keep literal local conversational evidence inside the actual choice question,
// after the large room state. Never truncate sources to fit the HTTP criterion.
export function ownerReplyOption(dialogue){
 const general='Answer self.ownerDialogue.message using continuity and history as one conversation. Resolve omitted meaning from the preceding question AND reply. First answer the proposition (yes/no/unknown as appropriate); emotion and courtesy must not replace substance. Correct the specific unsupported claim, without inventing motives for your error. Do not switch to colleague status or generic flattery. Follow pinned rules and confirmed effects. Words only; no physical action.';
 const prefix='Words only. Resolve the current message from the preceding question AND reply; answer its subject before emotion. Correct unsupported claims. Missing evidence is UNKNOWN, not a new positive or negative fact. Invent no personal events. Pinned rules and effects apply. Literal dialogue data: ';
 const last=dialogue.history?.at(-1);
 const local={...(last?{previous:{owner:last.owner,reply:last.reply}}:{}),message:dialogue.message.text};
 const focused=prefix+JSON.stringify(local);
 if(focused.length<=500)return {id:'owner_reply',description:focused};
 const current=prefix+JSON.stringify({message:dialogue.message.text});
 return {id:'owner_reply',description:current.length<=500?current:general};
}
