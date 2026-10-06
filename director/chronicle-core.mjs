// Owner history only. This module never writes to character state or Jev context.
import {createHash} from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const validAt = at => Number.isFinite(at) && at >= 946684800000 && at < 4102444800000;
const dateFormatter=new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export const dayOf = at => dateFormatter.format(new Date(at));
const text = value => typeof value === 'string' ? value.slice(0,500) : null;
const numeric = value => Number.isFinite(value) ? value : null;
const dimensions = ['professional','personal','sympathy','romance','jealousy'];
const explanation = e => e&&typeof e.text==='string'&&e.text.trim()&&e.text.length<=1000
  &&Number.isFinite(e.values?.sympathy)&&Number.isFinite(e.values?.romance)&&validAt(e.at)
  ?{text:e.text,values:{sympathy:e.values.sympathy,romance:e.values.romance},at:e.at}:null;
const members = (...ids) => [...new Set(ids.filter(id=>typeof id==='string'&&/^[a-z][a-z0-9_]{0,30}$/.test(id)))].sort();
const evidence = e => ({id:text(e.id),kind:text(e.kind),actor:text(e.actor),recipient:text(e.recipient),at:numeric(e.observedAt??e.at),title:text(e.title),summary:text(e.summary),source:text(e.source)});
export function extractChronicle(st, names, now) {
  const found = new Map(); let undatedCount=0;
  const add = (kind,key,at,people,facts,source) => {
    if(!validAt(at)){undatedCount++;return;}
    const id=digest([kind,key,at,people]);
    const event={id,kind,at,people,facts,source:text(source)||'canonical_director'};
    if(!found.has(id))found.set(id,event);
  };
  const forgiveness=(e,actor,partner,at)=>{
    const people=members(actor,partner),key=e.id?.replace(/:[a-z][a-z0-9_]{0,30}$/,'')||[people,e.cents];
    if(!validAt(at)){undatedCount++;return;}
    const id=digest(['debt_forgiven',key,at,people]);
    const event=found.get(id)||{id,kind:'debt_forgiven',at,people,source:'confirmed_debt_forgiveness',facts:{cents:null,evidence:[]}};
    if(Number.isFinite(e.cents))event.facts.cents=e.cents;
    event.facts.evidence.push(evidence({...e,actor,recipient:partner,at}));
    found.set(id,event);
  };
  for(const [actor,p] of Object.entries(st.chars||{})) {
    for(const [partner,r] of Object.entries(p.relationships||{})) {
      for(const e of r.courtship?.history||[]) {
        if(!['flirt','response'].includes(e.kind))continue;
        add(e.kind==='flirt'?'flirt':'flirt_response',e.id,e.at,members(e.actor,e.recipient),{
          flirtId:text(e.id),actor:text(e.actor),partner:text(e.recipient),answer:text(e.answer),replyTo:text(e.replyTo),statement:text(e.statement)
        },e.source);
      }
      for(const e of r.dimensionDecisions||[]) {
        if(e.before===e.after||!dimensions.includes(e.dimension))continue;
        add('relationship_changed',[actor,partner,e.dimension,e.before,e.after],e.at,members(actor,partner),{
          actor,partner,dimension:e.dimension,before:numeric(e.before),after:numeric(e.after),...(explanation(e.explanation)?{explanation:explanation(e.explanation)}:{}),evidence:(e.evidence||[]).map(evidence)
        },e.source);
      }
      for(const e of r.observations||[]) {
        if(e.kind==='work_completed')add('work_completed',e.taskId||e.id,e.observedAt,members(e.actor),{actor:text(e.actor),task:text(e.taskId),title:text(e.title)},e.source);
        if(e.kind==='directed_objection')add('objection',e.id,e.observedAt,members(e.actor,actor),{actor:text(e.actor),partner:actor},e.source);
        if(e.kind==='loan_forgiven')forgiveness(e,actor,e.actor,e.observedAt);
        if(e.kind==='loan_overdue')add('money_'+e.kind,e.id,e.observedAt,members(e.actor,actor),{actor:text(e.actor),partner:actor},e.source);
      }
    }
    for(const e of p.memory||[]) {
      if(e.event==='conversation_finished'||e.event==='conversation_cancelled') {
        // One episode for the room, with each participant's actual completion reason.
        const people=members(actor,e.partner),at=e.endedAt??e.at,key=e.conversationId;
        if(!validAt(at)){undatedCount++;continue;}
        const id=digest(['conversation',key,at,people]);
        const event=found.get(id)||{id,kind:e.event==='conversation_finished'?'conversation':'conversation_cancelled',at,people,source:text(e.source),facts:{conversationId:text(key),startedAt:numeric(e.startedAt),participatingSeconds:numeric(e.participatingSeconds),simulatedParticipatingSeconds:numeric(e.simulatedParticipatingSeconds),initiator:text(e.initiator),reasons:{}}};
        event.facts.reasons[actor]={reason:text(e.reason),source:text(e.source)};found.set(id,event);
      }
      if(e.event==='social_invitation')add('invitation_answer',[actor,e.partner,e.answer],e.at,members(actor,e.partner),{actor,partner:text(e.partner),answer:text(e.answer)},e.source);
      if(e.event==='debt_forgiven')forgiveness({...e,kind:e.event},actor,e.partner,e.at);
      if(e.event==='work_finished'&&!validAt(e.at))undatedCount++;
    }
  }
  const econ=st.economy||{};
  for(const tx of econ.ledger||[]) {
    if(!['bonus','gift','loan','repayment','work','performance','treat_purchase','drink_service'].includes(tx.kind))continue;
    add('money_'+tx.kind,tx.id,tx.at,members(tx.from,tx.to,tx.beneficiary),{from:text(tx.from),to:text(tx.to),beneficiary:text(tx.beneficiary),cents:numeric(tx.cents),title:text(tx.title),task:text(tx.task)},'money_ledger');
  }
  for(const d of econ.debts||[])for(const h of d.history||[]) {
    if(!['extension','forgiven','repayment'].includes(h.event))continue;
    add('debt_'+h.event,[d.id,h.event],h.at,members(d.lender,d.borrower),{cents:numeric(h.cents),before:numeric(h.before),after:numeric(h.after),dueAt:numeric(d.dueAt)},'debt_ledger');
  }
  for(const o of econ.offers||[])if(o.answeredAt)add('money_offer_answer',o.id,o.answeredAt,members(o.from,o.to),{from:text(o.from),to:text(o.to),offerKind:text(o.kind),answer:text(o.status),cents:numeric(o.cents)},'independent_money_reply');
  for(const c of econ.performances||[]) {
    const people=members(c.performer,c.payer);
    add('performance_offered',c.id,c.at,people,{actor:text(c.from),partner:text(c.to),cents:numeric(c.cents)},'performance_contract');
    if(c.acceptedAt)add('performance_agreed',c.id,c.acceptedAt,people,{cents:numeric(c.cents)},'performance_contract');
    if(c.closedAt)add(c.status==='paid'?'performance_completed':'performance_cancelled',c.id,c.closedAt,people,{cents:numeric(c.status==='paid'?c.cents:0),durationSeconds:c.status==='paid'?numeric(c.duration):null,reason:text(c.reason)},'confirmed_performance_contract');
  }
  const relations={};
  for(const [actor,p]of Object.entries(st.chars||{})) {
    relations[actor]={};
    for(const [partner,r]of Object.entries(p.relationships||{}))relations[actor][partner]={
      dimensions:Object.fromEntries(dimensions.map(key=>{const d=r.dimensions?.[key];return [key,d?{value:numeric(d.value),revision:numeric(d.revision),updatedAt:numeric(d.updatedAt),assessedAt:numeric(d.assessedAt),migratedFrom:text(d.migratedFrom),...(explanation(d.explanation)?{explanation:explanation(d.explanation)}:{}),basis:Array.isArray(d.basis)?d.basis.map(evidence):d.basis?[evidence(d.basis)]:[]}:null];})),
      boundaries:Object.fromEntries(Object.entries(r.courtship?.boundaries||{}).map(([id,b])=>[id,{answer:text(b.answer),at:numeric(b.at)}]))
    };
  }
  const current={names:Object.fromEntries(Object.keys(st.chars||{}).map(id=>[id,text(names[id]||id)])),relations,
    tasks:(st.tasks||[]).map(t=>({id:text(t.id),title:text(t.title),actor:text(t.by),doneMinutes:numeric(t.done_min),requiredMinutes:numeric(t.need_min)})),
    debts:(econ.debts||[]).filter(d=>d.remaining>0).map(d=>({id:text(d.id),lender:text(d.lender),borrower:text(d.borrower),remaining:numeric(d.remaining),dueAt:numeric(d.dueAt)})),
    offers:(econ.offers||[]).filter(o=>o.status==='pending').map(o=>({id:text(o.id),kind:text(o.kind),from:text(o.from),to:text(o.to),cents:numeric(o.cents)})),
    performances:(econ.performances||[]).filter(c=>['offered','reserved','running'].includes(c.status)).map(c=>({id:text(c.id),performer:text(c.performer),payer:text(c.payer),status:text(c.status)})),
    conversations:Object.values(st.social?.pairs||{}).map(p=>({id:text(p.id),people:members(...p.members),phase:text(p.phase),participatingSeconds:numeric(p.seconds)})),
    undatedCount};
  return {events:[...found.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)),current,observedAt:now};
}

// Only fresh matching executor observations establish a dance; a decision is insufficient.
export class DanceObserver {
  active=new Map();
  constructor(events=[],checkpoint=[]) {
    for(const e of events){const f=e.facts||{},id=f.actor;if(e.kind==='dance_started'&&Number.isInteger(f.actorSeq))this.active.set(id,{seq:f.actorSeq,activity:f.activity,startedAt:f.startedAt,lastAt:f.startedAt,seconds:0,sceneSeconds:0});if(e.kind==='dance_finished'&&this.active.get(id)?.startedAt===f.startedAt)this.active.delete(id);}
    for(const [id,saved]of checkpoint)if(this.active.get(id)?.startedAt===saved.startedAt&&this.active.get(id)?.seq===saved.seq)this.active.set(id,saved);
  }
  snapshot(){return structuredClone([...this.active]);}
  observe(st,caps,now,fast=1) {
    const out=[];
    for(const [id,p]of Object.entries(st.chars||{})) {
      const a=caps?.actors?.[id],old=this.active.get(id);
      if(old&&(old.seq!==p.seq||old.activity!==p.activity)) {
        const at=validAt(p.entry?.at)&&p.entry.at>=old.startedAt&&p.entry.at<=now?p.entry.at:now;
        out.push(this.finish(id,old,at,'command_changed'));this.active.delete(id);
      }
      if(!validAt(caps?.at)||caps.at>now||now-caps.at>=3500||!a?.loaded||a.seq!==p.seq||a.activity!==p.activity)continue;
      if(!/^(jazz|dance|heroine_dance[12])$/.test(p.activity))continue;
      let live=this.active.get(id);
      if(a.executing===true&&!live){live={seq:p.seq,activity:p.activity,startedAt:caps.at,lastAt:caps.at,seconds:0,sceneSeconds:0};this.active.set(id,live);out.push(this.event(id,live,caps.at,'dance_started',{}));}
      if(!live)continue;
      if(a.executing===true&&caps.at>live.lastAt){if(caps.at-live.lastAt<3500){const seconds=Math.min(2000,caps.at-live.lastAt)/1000;live.seconds+=seconds;live.sceneSeconds+=seconds*fast;}live.lastAt=caps.at;}
      if(a.executionEnd?.seq===p.seq&&a.executionEnd.outcome==='completed'){out.push(this.finish(id,live,caps.at,'executor_completed'));this.active.delete(id);}
    }
    return out;
  }
  finish(id,live,at,reason){return this.event(id,live,at,'dance_finished',{reason,observedSeconds:live.seconds,observedSceneSeconds:live.sceneSeconds});}
  event(id,live,at,kind,facts){return {id:digest([kind,id,live.seq,live.startedAt]),kind,at,people:[id],source:'matching_executor_observations',facts:{actor:id,actorSeq:live.seq,activity:live.activity,startedAt:live.startedAt,episodeId:digest([id,live.seq,live.startedAt]),...facts}};}
}
