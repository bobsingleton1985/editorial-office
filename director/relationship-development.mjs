// Feelings are private appraisals. Public courtship records contain confirmed signals only.
export const DIMENSIONS={
 professional:{name:'Уважение как к профессионалу',min:-2,max:2,labels:['не доверяет мастерству','сомневается','ещё не сформировано','уважает','высоко ценит']},
 personal:{name:'Уважение как к человеку',min:-2,max:2,labels:['утратил уважение','разочарован','ещё присматривается','уважает','глубоко уважает']},
 sympathy:{name:'Симпатия',min:-2,max:2,labels:['избегает общества','общается неохотно','нейтральная','охотно проводит время','очень привязан']},
 romance:{name:'Влюблённость',min:0,max:3,labels:['отсутствует','романтический интерес','влюблён','сильная влюблённость']},
 jealousy:{name:'Ревность',min:0,max:3,labels:['отсутствует','беспокоится','ревнует','сильно ревнует']},
};
export const dimensionLabel=(key,value)=>DIMENSIONS[key]?.labels[value-DIMENSIONS[key].min]||'нет данных';
const eligible={professional:['work_completed','performance_completed'],personal:['gift_accepted','loan_repaid','loan_forgiven','loan_overdue','directed_objection'],sympathy:['conversation_experienced','friendly_address','flirt_address','courtship_response','directed_objection','gift_accepted','loan_repaid','loan_forgiven'],romance:['conversation_experienced','friendly_address','flirt_address','courtship_response'],jealousy:['attention_to_other','conversation_experienced','courtship_response']};
export function ensureDevelopment(r){
 if(!r.dimensions){
  r.dimensions=Object.fromEntries(Object.keys(DIMENSIONS).map(k=>[k,{value:0,revision:0,basis:null,updatedAt:null}]));
  // Preserve existing explicit appraisals as a labelled compatibility seed, never invent romance.
  if(r.revision>0&&r.basis&&r.stance!=='neutral'){const d=r.dimensions.sympathy;d.value=r.stance==='warm'?1:-1;d.basis=structuredClone(r.basis);d.updatedAt=r.updatedAt;d.migratedFrom='legacy_stance';}
 }
 r.dimensionDecisions??=[];r.courtship??={history:[],boundaries:{},flirts:{},responses:{}};
 return r;
}
const pending=(r,key)=>r.observations.filter(e=>eligible[key].includes(e.kind)&&!(e.dimensionAppraisals||[]).includes(key));
export function reflectionJob(st,id){
 const jobs=[];
 for(const [partner,r]of Object.entries(st.chars[id].relationships||{})){
  ensureDevelopment(r);
  for(const key of Object.keys(DIMENSIONS)){
   const events=pending(r,key).slice(0,8);if(!events.length)continue;
   jobs.push({actor:id,partner,key,revision:r.dimensions[key].revision,events:structuredClone(events),lastAt:r.dimensions[key].assessedAt||0});
  }
 }
 return jobs.sort((a,b)=>a.lastAt-b.lastAt||(a.events[0].observedAt||0)-(b.events[0].observedAt||0))[0]||null;
}
export function reflectionActions(st,job,names={}){
 const r=ensureDevelopment(st.chars[job.actor].relationships[job.partner]),d=r.dimensions[job.key],spec=DIMENSIONS[job.key];
 const negative=job.events.some(e=>['directed_objection','loan_overdue'].includes(e.kind));
 const canIncrease=job.key==='jealousy'?d.value<3&&r.dimensions.romance.value>0&&job.events.some(e=>e.kind==='attention_to_other'):!negative;
 return [-1,0,1].filter(delta=>(delta<=0||canIncrease)&&d.value+delta>=spec.min&&d.value+delta<=spec.max).map(delta=>({id:`relationship_reflect@${job.partner}:${job.key}:${d.value+delta}`,description:`${spec.name} к ${names[job.partner]||job.partner}: ${delta===0?'сохранить нынешнюю оценку':dimensionLabel(job.key,d.value+delta)}. Осмысли перечисленные реальные события с учётом характера и прошлого опыта. Это собственная оценка; взаимность и чужие мысли неизвестны. Занятие продолжается.`}));
}
export function applyReflection(st,job,action,now,source,confidence=null){
 if(!['jev','qwen'].includes(source))return false;
 const r=st.chars[job.actor]?.relationships?.[job.partner];if(!r)return false;ensureDevelopment(r);
 const d=r.dimensions[job.key];if(d.revision!==job.revision||!reflectionActions(st,job).some(a=>a.id===action))return false;
 if(job.events.some(e=>!pending(r,job.key).some(x=>x.id===e.id)))return false;
 const before=d.value,after=+action.split(':').at(-1),ids=job.events.map(e=>e.id);
 d.value=after;d.revision++;d.assessedAt=now;
 if(before!==after){d.basis=structuredClone(job.events);d.updatedAt=now;}
 for(const e of r.observations)if(ids.includes(e.id)){e.dimensionAppraisals??=[];e.dimensionAppraisals.push(job.key);}
 const record={event:'relationship_reflected',partner:job.partner,dimension:job.key,before,after,at:now,source,confidence,evidence:structuredClone(job.events),summary:`${DIMENSIONS[job.key].name}: ${dimensionLabel(job.key,after)}. ${before===after?'После осмысления оценка сохранена.':'Оценка изменилась.'}`};
 r.dimensionDecisions.push(record);r.dimensionDecisions=r.dimensionDecisions.slice(-40);r.revision++;
 // Only sympathy supplies the legacy animation stance. Other feelings stay independent.
 r.stance=r.dimensions.sympathy.value>0?'warm':r.dimensions.sympathy.value<0?'guarded':'neutral';
 st.chars[job.actor].memory.push(structuredClone(record));st.chars[job.actor].memory=st.chars[job.actor].memory.slice(-12);
 return true;
}
export function nextReflection(st,now,eligible=()=>true){
 st.reflection??={lastAttemptAt:0,actorAttempts:{},last:null};
 if(now-Math.max(st.reflection.lastAttemptAt,st.reflection.lastCompletedAt||0)<12000)return null;
 const actors=Object.keys(st.chars).filter(id=>eligible(id)&&!st.chars[id].sleep&&!st.chars[id].sleepPending).sort((a,b)=>(st.reflection.actorAttempts[a]||0)-(st.reflection.actorAttempts[b]||0));
 return actors.map(id=>reflectionJob(st,id)).find(Boolean)||null;
}
export function recordObservation(r,event){
 ensureDevelopment(r);if(r.observations.some(e=>e.id===event.id))return false;
 r.observations.push(structuredClone(event));r.observations=r.observations.slice(-48);return true;
}
export function flirtPermitted(r,partner){ensureDevelopment(r);return !r.courtship.boundaries[partner];}
export function courtshipOptions(r,actor,partner){
 ensureDevelopment(r);const e=r.courtship.flirts[partner];
 if(!e||r.courtship.responses[e.id])return [];
 return ['reciprocate','friendly','later','decline'].map(answer=>({answer,replyTo:e.id,intent:answer==='reciprocate'?'flirt':'calm',statement:{reciprocate:'Ответить взаимным флиртом: мне тоже интересно сблизиться.',friendly:'Ответить доброжелательно, обозначив только дружеское общение.',later:'Обозначить: сейчас не готов к ухаживанию; сам сообщу, если передумаю.',decline:'Обозначить: романтического сближения не хочу; не повторять попытки без моей новой инициативы.'}[answer]}));
}
export function confirmCourtship(st,actor,partner,event,at){
 const isFlirt=event.intent==='flirt',reply=event.courtship;
 if(!isFlirt&&!reply)return;
 const signal={id:event.id,actor,recipient:partner,at,kind:reply?'response':'flirt',answer:reply?.answer||null,replyTo:reply?.replyTo||null,statement:reply?.statement||'Выразил собственный романтический интерес.',source:'confirmed_addressed_expression'};
 for(const [id,other]of [[actor,partner],[partner,actor]]){
  const r=ensureDevelopment(st.chars[id].relationships[other]),c=r.courtship;
  if(c.history.some(e=>e.id===signal.id))continue;
  c.history.push(structuredClone(signal));c.history=c.history.slice(-32);
  if(reply){c.responses[reply.replyTo]={id:signal.id,answer:reply.answer,at};c.responses=Object.fromEntries(Object.entries(c.responses).slice(-64));}
  if(reply&&['decline','later','friendly'].includes(reply.answer)){c.boundaries[actor]={id:signal.id,answer:reply.answer,at};c.flirts={};}
  if(isFlirt){delete c.boundaries[actor];c.flirts[actor]=structuredClone(signal);}
 }
 if(reply)recordObservation(st.chars[partner].relationships[actor],{id:event.id+':response',kind:'courtship_response',actor,answer:reply.answer,observedAt:at,source:signal.source,summary:reply.statement});
 // The room observes an expressed signal, not attraction or relationship status.
 if(isFlirt)for(const id of Object.keys(st.chars))if(id!==actor&&id!==partner)recordObservation(st.chars[id].relationships[actor],{id:event.id+':attention:'+id,kind:'attention_to_other',actor,recipient:partner,observedAt:at,source:'shared_room_confirmed_address',summary:`${actor} выразил флирт в адрес ${partner}. Их чувства неизвестны.`});
}
export function courtshipStatus(r,actor,partner){
 ensureDevelopment(r);const c=r.courtship;
 if(c.boundaries[partner])return 'Собеседник обозначил границу; новая попытка ждёт его инициативы.';
 if(c.boundaries[actor])return 'Ты обозначил границу романтического сближения.';
 if(c.flirts[actor]&&c.flirts[partner])return 'Флирт был выражен с обеих сторон; отношения парой не объявлены.';
 if(c.flirts[actor]||c.flirts[partner])return 'Флирт пока выражен только одной стороной.';
 return 'Романтических обращений пока не было.';
}
