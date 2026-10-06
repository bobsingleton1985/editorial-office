// Request projection only. Canonical tasks, receipts and dialogue are unchanged.
import {privateTurn} from './phone-privacy.mjs';

export const OBLIGATION_RECENT_MS=24*60*60*1000;
export const OBLIGATION_OPTIONAL_ROWS=6, OBLIGATION_OPTIONAL_BYTES=6000;
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const stamp=v=>Number.isFinite(v)?v:typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)?Date.parse(v):NaN;
const recent=(at,now)=>!Number.isFinite(stamp(at))||stamp(at)>=now-OBLIGATION_RECENT_MS;
const due=(at,now)=>at!=null&&(!Number.isFinite(stamp(at))||stamp(at)>=now-OBLIGATION_RECENT_MS&&stamp(at)<=now+OBLIGATION_RECENT_MS);
const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const phrase=(text,value)=>{const a=normalize(text),b=normalize(value);return b.length>=8&&(' '+a+' ').includes(' '+b+' ');};
const idMention=(text,id)=>typeof id==='string'&&id.length>0&&String(text).split(/[^\p{L}\p{N}_-]+/u).includes(id);
const visit=(v,refs)=>{if(typeof v==='string')refs.add(v);else if(v&&typeof v==='object')for(const x of Object.values(v))visit(x,refs);};
const knownTurn=t=>['answered','closed','cancelled','failed'].includes(t?.status);
const pendingEffect=e=>e?.type==='request'&&['requested','chosen'].includes(e.status)||e?.type==='task'&&e.status==='assigned';
const unfinished=t=>knownTurn(t)&&pendingEffect(t.effect)&&(!t.intent||['action','task'].includes(t.intent.kind));
const identity=row=>[row?.id,row?.taskId,row?.effect?.id,row?.effect?.taskId,row?.ownerDialogueId].filter(x=>typeof x==='string');
const taskRow=t=>({id:t.id,confidential:t.confidential===true,title:t.title,brief:t.brief,progressMinutes:t.done_min,requiredMinutes:t.need_min,deadlineAt:t.deadlineAt,rewardCents:t.ownerRewardCents,status:'assigned',completion:'Only witnessed work and work_finished complete this assignment.'});
const moneyTask=row=>({...Object.fromEntries(Object.entries(row).filter(([key])=>!['title','brief','completion'].includes(key))),completion:'Unfinished; detailed brief omitted. Reward is conditional, not spendable money.'});
const requestRow=r=>({id:r.id,confidential:r.confidential===true,action:r.action,description:r.description,at:r.at,status:r.status,note:'Recorded owner request; choice does not confirm execution.'});

export function ownerObligationProjection(snapshot,st,actor,now,{publicOnly=false}={}){
 const out=structuredClone(snapshot),s=out.self,p=st.chars?.[actor];
 if(!s||!p)return out;
 // Only actual execution and literal current-conversation sources revive an
 // old request. Availability of the same generic action is not participation.
 const active=new Set();
 for(const value of [s.task,s.currentActivity,s.reflection,s.ownerDialogue,s.ownerInterpretation,p.pendingOwnerCall])visit(value,active);
 const contexts=[s.ownerDialogue,s.ownerInterpretation].filter(Boolean);
 const representedIds=new Set(contexts.flatMap(c=>[c.message?.id,c.continuity?.firstMessage?.id,...(c.history||[]).map(t=>t.id),...(c.continuity?.earlierExchanges||[]).map(t=>t.id)]).filter(Boolean));
 const messages=contexts.flatMap(c=>[c.message?.text,c.continuity?.firstMessage?.text,...(c.history||[]).map(t=>t.owner),...(c.continuity?.earlierExchanges||[]).map(t=>t.owner)]).filter(v=>typeof v==='string');
 const turns=(p.ownerDialogue||[]).filter(t=>!publicOnly||!privateTurn(t));
 const tasks=(st.tasks||[]).filter(t=>t.by===actor&&t.ownerDialogueId&&(!publicOnly||!t.confidential));
 const requests=Object.values(st.ownerDialogueEffects||{}).filter(r=>r.actor===actor&&r.type==='request'&&r.status==='requested'&&(!publicOnly||!r.confidential));
 const taskByTurn=new Map(tasks.map(t=>[t.ownerDialogueId,t.id]));
 const group=row=>row.effect?.taskId??row.taskId??taskByTurn.get(row.ownerDialogueId??row.id)??row.id;
 const descriptors=new Map();
 for(const row of [...tasks,...requests,...turns])for(const value of [row.title,row.brief,row.description,row.text,row.intent?.instruction]){
  if(!messages.some(text=>phrase(text,value)))continue;
  const key=normalize(value),groups=descriptors.get(key)||new Set();groups.add(group(row));descriptors.set(key,groups);
 }
 const namedGroups=new Set([...descriptors.values()].filter(groups=>groups.size===1).flatMap(groups=>[...groups]));
 const ambiguous=[...descriptors.values()].some(groups=>groups.size>1);
 const mentioned=row=>identity(row).some(id=>messages.some(text=>idMention(text,id)))||namedGroups.has(group(row));
 const referenced=row=>identity(row).some(id=>active.has(id));
 const executing=t=>{
  const intent=t.intent,target=st.chars?.[intent?.target];
  return intent?.kind==='action'&&t.effect?.status==='requested'&&target&&target.seq===(intent.dispatchActorSeq??intent.actorSeq)
   ||intent?.kind==='action'&&t.effect?.status==='chosen'&&target?.entry?.action===t.effect.action&&Number.isFinite(intent.dispatchedAt)&&Math.abs(target.entry.at-intent.dispatchedAt)<=2000
   ||t.afterReplyHangup==='pending';
 };
 const protectedIds=new Set(turns.filter(t=>referenced(t)||mentioned(t)||executing(t)).flatMap(identity));
 const required=row=>referenced(row)||mentioned(row)||identity(row).some(id=>protectedIds.has(id));
 // Optional recent queue items share one count/byte budget. Current work,
 // near deadlines, explicit references and unknown dates are mandatory.
 const rows=[...tasks.map(t=>({kind:'task',source:t,row:{...taskRow(t),overdue:t.deadlineAt!=null&&now>t.deadlineAt},at:t.arrived,hard:required(t)||due(t.deadlineAt,now)||!Number.isFinite(stamp(t.arrived))})),
  ...requests.map(r=>({kind:'request',source:r,row:requestRow(r),at:r.at,hard:required(r)||!Number.isFinite(stamp(r.at))}))];
 const chosen=new Set(rows.filter(x=>x.hard));let optional=[];
 const newest=rows.filter(x=>!x.hard&&recent(x.at,now)).sort((a,b)=>stamp(b.at)-stamp(a.at));
 for(const x of newest){if(optional.length>=OBLIGATION_OPTIONAL_ROWS||bytes([...optional.map(y=>y.row),x.row])>OBLIGATION_OPTIONAL_BYTES)break;chosen.add(x);optional.push(x);}
 // Money promised for unfinished work remains a concise factual condition
 // even when its old brief is absent. No reward/completion is manufactured.
 s.ownerTasks=rows.filter(x=>x.kind==='task').flatMap(x=>chosen.has(x)?[x.row]:x.source.ownerRewardCents!==0&&x.source.ownerRewardCents!=null?[moneyTask(x.row)]:[]);
 s.ownerRequests=rows.filter(x=>x.kind==='request'&&chosen.has(x)).map(x=>x.row);
 const selectedIds=new Set([...chosen].flatMap(x=>identity(x.source)));
 const dormant=t=>unfinished(t)&&!recent(t.effect?.at??t.at,now)&&!due(t.effect?.deadlineAt,now)&&!required(t)&&!identity(t).some(id=>selectedIds.has(id));
 // Select from canonical history so an explicit old reference can recover its
 // original source even when it lies outside the usual last-twelve window.
 const existing=new Set((s.ownerDialogueHistory||[]).map(t=>t.id));
 const history=turns.filter(t=>!representedIds.has(t.id)&&!dormant(t)&&(existing.has(t.id)||required(t)||identity(t).some(id=>selectedIds.has(id))));
 if(history.length||s.ownerDialogueHistory)s.ownerDialogueHistory=structuredClone(history);
 const revived=history.filter(t=>required(t)||identity(t).some(id=>selectedIds.has(id))).map(t=>t.id);
 if(revived.length)s.ownerObligationProjection={version:'owner-obligation-projection-v1',sourceIds:revived};
 const omitted=rows.some(x=>!chosen.has(x))||turns.some(t=>existing.has(t.id)&&dormant(t));
 if(omitted)(out.limits??=[]).push('Old unmentioned unfinished owner requests may be omitted. Omission does not mean completion, cancellation or debt settlement; clarify an ambiguous old reference. Current facts and conditional money remain authoritative.');
 if(ambiguous)(out.limits??=[]).push('The literal old reference matches multiple archived records. Ask which record is meant; do not invent a specific match or completed result.');
 return out;
}
