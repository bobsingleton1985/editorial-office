// Privacy is attached to a turn at receipt; changing the bot menu never republishes it.
export const privateTurn=t=>t?.confidential===true||(t?.source==='phone'&&t?.confidential!==false);
const detailKeys=new Set(['text','reply','reaction','reason','explanation','choiceReason','statement','summary','title','brief','basis','evidence','observations','dimensionDecisions','note','sourceNote','description','instruction','quote','owner','owner_message']);
export function removePrivateDetails(value){
 if(Array.isArray(value))return value.map(removePrivateDetails);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>!detailKeys.has(k)).map(([k,v])=>[k,removePrivateDetails(v)]));
}
export function protectPublicActor(p){
 if(!p)return p;
 const out=p.privateContext?removePrivateDetails(p):structuredClone(p);
 // Public replies were generated from a separate public-only context.
 out.ownerDialogue=(p.ownerDialogue||[]).filter(t=>!privateTurn(t)).map(t=>structuredClone(t));
 out.ownerTasks=(p.ownerTasks||[]).filter(t=>!t.confidential).map(t=>structuredClone(t));
 out.ownerCommands=(p.ownerCommands||[]).filter(t=>!t.confidential).map(t=>structuredClone(t));
 if(p.privateContext){out.reflection=null;out.label=p.label;out.state={...out.state,task:p.state?.task?{...out.state?.task,title:p.state.task.confidential!==false?'Конфиденциальное поручение':p.state.task.title}:null};}
 return out;
}
export function protectPublicWorld(world){
 const out=structuredClone(world);
 for(const [id,p]of Object.entries(out.chars||{}))out.chars[id]=protectPublicActor(p);
 if(out.editor)out.editor=protectPublicActor(out.editor);
 return out;
}
export function migratePhonePrivacy(st){
 // Legacy phone turns have no owner-selected publication permission.
 for(const p of Object.values(st.chars||{})){
  for(const t of p.ownerDialogue||[])if(privateTurn(t))t.confidential=true;
  for(const m of p.memory||[])if(['phone_call','owner_dialogue_reply'].includes(m.event)&&m.confidential!==false)m.confidential=true;
  if(p.pendingOwnerCall&&p.pendingOwnerCall.confidential!==false)p.pendingOwnerCall.confidential=true;
  p.privateContext=!!p.privateContext||!!p.ownerDialogue?.some(privateTurn)||!!p.pendingOwnerCall?.confidential;
 }
 const privateIds=new Set(Object.values(st.chars||{}).flatMap(p=>(p.ownerDialogue||[]).filter(privateTurn).map(t=>t.id)));
 for(const t of st.tasks||[])if(privateIds.has(t.ownerDialogueId))t.confidential=true;
 for(const r of Object.values(st.ownerDialogueEffects||{}))if(privateIds.has(r.id))r.confidential=true;
 const privateTaskIds=new Set([...(st.tasks||[]).filter(t=>t.confidential).map(t=>t.id),...Object.values(st.ownerDialogueEffects||{}).filter(r=>r.confidential&&r.taskId).map(r=>r.taskId)]);
 const cleanTaskEvidence=value=>{
  if(!value||typeof value!=='object')return;
  if(privateTaskIds.has(value.taskId)||privateTaskIds.has(value.task)){
   if(Object.hasOwn(value,'title'))value.title='Конфиденциальное поручение';
   if(Object.hasOwn(value,'summary'))value.summary='Наблюдалось завершение конфиденциального поручения.';
  }
  for(const child of Object.values(value))cleanTaskEvidence(child);
 };
 for(const p of Object.values(st.chars||{})){
  for(const m of p.memory||[])if(privateTaskIds.has(m.task)||privateTaskIds.has(m.taskId)||[...privateIds].some(id=>m.id==='owner-request:'+id))m.confidential=true;
  cleanTaskEvidence(p.relationships);
  for(const m of p.memory||[])if(!m.confidential)cleanTaskEvidence(m);
 }
 if(st.ownerMsg&&st.ownerMsg.confidential!==false)delete st.ownerMsg;
 return st;
}
export function publicRequestContext(snapshot){
 const s=snapshot.self;
 s.memory=(s.memory||[]).filter(m=>!m.confidential);
 s.ownerTasks=(s.ownerTasks||[]).filter(t=>!t.confidential);
 s.ownerRequests=(s.ownerRequests||[]).filter(t=>!t.confidential);
 if(s.task?.confidential)s.task={id:s.task.id,kind:s.task.kind,progress_minutes:s.task.progress_minutes,needs_minutes:s.task.needs_minutes,title:'Конфиденциальное поручение'};
 for(const k of ['relationships','courtship','finances','currentActivity','recentEpisodes','flirt'])if(s[k])s[k]=removePrivateDetails(s[k]);
 return snapshot;
}
export function privateChronicleState(st){
 const out=structuredClone(st);
 out.tasks=(out.tasks||[]).filter(t=>!t.confidential);
 for(const p of Object.values(out.chars||{}))if(p.privateContext){p.memory=(p.memory||[]).filter(m=>!m.confidential);p.relationships=removePrivateDetails(p.relationships);}
 for(const t of out.economy?.ledger||[])if(t.task?.startsWith('owner-task-'))delete t.title;
 return out;
}
