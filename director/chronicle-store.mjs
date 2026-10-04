import fs from 'node:fs';
import {dayStory} from './chronicle-story.mjs';
import path from 'node:path';
import {digest,validAt,dayOf} from './chronicle-core.mjs';
const recordTypes=new Set(['event','state','coverage']);
export function validateRecord(r) {
  if(!r||!recordTypes.has(r.type)||!validAt(r.at)||typeof r.id!=='string'||r.id!==digest([r.type,r.at,r.data]))throw Error('invalid_chronicle_record');
  if(Buffer.byteLength(JSON.stringify(r))>160000)throw Error('chronicle_record_too_large');
  if(r.type==='event'&&(!r.data||!validAt(r.data.at)||r.at!==r.data.at||!Array.isArray(r.data.people)||typeof r.data.kind!=='string'))throw Error('invalid_chronicle_event');
  if(r.type==='state'&&(!r.data?.names||!r.data.relations||!Array.isArray(r.data.tasks)))throw Error('invalid_chronicle_state');
  if(r.type==='coverage'&&(r.data?.source!=='canonical_director'||!validAt(r.data.from)))throw Error('invalid_chronicle_coverage');
  // This endpoint takes only our explicit safe projection, never arbitrary source state.
  const forbidden=/(?:api.?key|authorization|token|lease|password|secret|requestPayload)/i;
  const visit=x=>{if(x&&typeof x==='object')for(const [k,v]of Object.entries(x)){if(forbidden.test(k))throw Error('secret_field_in_chronicle');visit(v);}};visit(r.data);
  return r;
}
export class ChronicleStore {
  records=[]; ids=new Set(); eventIds=new Set(); lastStateHash=null; lastStateAt=0; lastRelationsHash=null; lastCoverage=0; startedAt=null;
  constructor(file) {
    this.file=file;
    if(file&&fs.existsSync(file)) {
      const body=fs.readFileSync(file,'utf8');
      // A torn final line is truncated before further append. Interior corruption fails closed.
      const complete=body.lastIndexOf('\n')+1;
      if(complete<body.length)fs.truncateSync(file,Buffer.byteLength(body.slice(0,complete)));
      for(const line of body.slice(0,complete).split('\n').filter(Boolean))this.restore(validateRecord(JSON.parse(line)));
    }
  }
  restore(r){if(this.ids.has(r.id))return;this.records.push(r);this.ids.add(r.id);if(r.type==='event')this.eventIds.add(r.data.id);if(r.type==='state'){this.lastStateHash=digest(r.data);this.lastRelationsHash=digest(r.data.relations);this.lastStateAt=r.at;}if(r.type==='coverage'){this.startedAt??=r.data.from;this.lastCoverage=Math.max(this.lastCoverage,r.at);}}
  append(records) {
    if(this.writeError)throw Error('chronicle_storage_unavailable');
    const fresh=[],seen=new Set(this.ids);
    for(const r of records){validateRecord(r);if(!seen.has(r.id)){fresh.push(r);seen.add(r.id);}}
    if(this.file&&fresh.length)try{fs.mkdirSync(path.dirname(this.file),{recursive:true});const fd=fs.openSync(this.file,'a',0o600);try{fs.writeFileSync(fd,fresh.map(r=>JSON.stringify(r)+'\n').join(''));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch(e){this.writeError=e.code||'write_failed';throw Error('chronicle_storage_unavailable');}
    fresh.forEach(r=>this.restore(r));return fresh.length;
  }
  capture({events,current,observedAt:at}) {
    if(!validAt(at))throw Error('invalid_capture_time');
    const pending=[];
    const record=(type,time,data)=>{pending.push({id:digest([type,time,data]),type,at:time,data});};
    for(const e of events)if(!this.eventIds.has(e.id))record('event',e.at,e);
    if(current&&digest(current)!==this.lastStateHash&&(!this.lastStateAt||at-this.lastStateAt>=30000||digest(current.relations)!==this.lastRelationsHash))record('state',at,current);
    if(!this.lastCoverage||at-this.lastCoverage>=60000)record('coverage',at,{from:this.startedAt??at,source:'canonical_director'});
    return this.append(pending);
  }
  batch(cursor=0,n=30){return {cursor:Math.min(this.records.length,cursor+n),records:this.records.slice(cursor,cursor+n)};}
  query({date,category='all',actor='',partner='',before=null,limit=100}={}) {
    const now=Date.now();date??=dayOf(now);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dayOf(Date.parse(date+'T12:00:00+03:00'))!==date)throw Error('invalid_date');
    if(!['all','work','social'].includes(category))throw Error('invalid_category');
    const eventRecords=this.records.filter(r=>r.type==='event');
    const work=k=>k.startsWith('work_')||k.startsWith('money_')||k.startsWith('debt_');
    const selected=eventRecords.map(r=>r.data).filter(e=>dayOf(e.at)===date&&(!actor||e.people.includes(actor))&&(!partner||e.people.includes(partner))&&(category==='all'||(category==='work'?work(e.kind):!work(e.kind)))).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
    const state=this.records.filter(r=>r.type==='state'&&dayOf(r.at)<=date).sort((a,b)=>b.at-a.at)[0]||null;
    const coverage=this.records.filter(r=>r.type==='coverage'&&dayOf(r.at)===date).map(r=>r.at).sort((a,b)=>a-b);
    const counts={};selected.forEach(e=>counts[e.kind]=(counts[e.kind]||0)+1);
    const start=before?selected.findIndex(e=>e.id===before)+1:0;
    if(before&&!start)throw Error('invalid_cursor');
    const page=selected.slice(start,start+Math.min(200,Math.max(1,limit)));
    const priority={flirt_response:0,relationship_changed:1,flirt:2,dance_finished:3,performance_completed:3,work_completed:4};
    const highlights=[...selected].sort((a,b)=>(priority[a.kind]??5)-(priority[b.kind]??5)||b.at-a.at).slice(0,3);
    const names=this.records.findLast(r=>r.type==='state')?.data.names??{};
    return {story:dayStory(selected,state?.data,{names,actor,partner,category,date,stateDay:state?dayOf(state.at):null}),date,timeZone:'Europe/Moscow',now,names,events:page,highlights,counts,total:selected.length,next:start+page.length<selected.length?page.at(-1).id:null,
      state:state?.data??null,stateAt:state?.at??null,stateDay:state?dayOf(state.at):null,
      coverage:{status:coverage.length?'partial':'no_data',first:coverage[0]??null,last:coverage.at(-1)??null,gaps:coverage.slice(1).filter((t,i)=>t-coverage[i]>90000).length,archiveStartedAt:this.startedAt,storageError:Boolean(this.writeError)},
      dates:[...new Set(eventRecords.map(r=>dayOf(r.at)))].sort().reverse()};
  }
}
