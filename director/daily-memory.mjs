import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const MEMORY_LIMITS = Object.freeze({intervalMs:86400000, summaryBytes:4000, summaryRecords:12,
  recentBytes:4000, recentRecords:12, candidateBytes:16000, candidateRecords:64});
export const memoryBytes = value => Buffer.byteLength(JSON.stringify(value),'utf8');
const bindings = new WeakMap();
const noise = row => row && typeof row.action==='string' && Object.hasOwn(row,'fatigue_before')
  && Object.keys(row).every(k=>['action','at','fatigue_before','source'].includes(k));
const bounded = (rows, bytes, count) => {
  const result=[];
  for(let i=rows.length-1;i>=0;i--){
    if(result.length===count)break;
    if(memoryBytes([rows[i],...result])<=bytes)result.unshift(rows[i]);
  }
  return result;
};
function sample(rows){
  // Preserve the latest source of each semantic event family before filling
  // remaining space with recency. Repetitions cannot crowd out every other kind.
  const family=row=>String(row.event||'other')+(row.answer?'|'+row.answer:'');
  rows=[...rows].sort((a,b)=>a.memorySequence-b.memorySequence);
  const last=new Map(rows.map(row=>[family(row),row]));
  const diverse=bounded([...last.values()].sort((a,b)=>a.memorySequence-b.memorySequence),MEMORY_LIMITS.candidateBytes,MEMORY_LIMITS.candidateRecords);
  const ids=new Set(diverse.map(row=>row.memoryId));
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i];if(ids.has(row.memoryId))continue;
    if(diverse.length<MEMORY_LIMITS.candidateRecords&&memoryBytes([...diverse,row])<=MEMORY_LIMITS.candidateBytes){diverse.push(row);ids.add(row.memoryId);}
  }
  return diverse.sort((a,b)=>a.memorySequence-b.memorySequence);
}

// Immutable, separate archive. Archive failure propagates BEFORE memory eviction.
// Identical id retries are safe; different contents under an id are rejected.
export class MemoryArchive {
  constructor(directory, io=fs){this.directory=directory;this.io=io;}
  append(actor,row){
    if(!/^[a-z][a-z0-9_]{0,30}$/.test(actor)||!/^mem-[0-9a-f]{24}$/.test(row.memoryId)||!Number.isSafeInteger(row.memorySequence)||row.memorySequence<1)throw Error('memory_archive_invalid_id');
    const io=this.io,dir=this.directory+'/'+actor,path=dir+'/'+String(row.memorySequence).padStart(16,'0')+'-'+row.memoryId+'.json',body=JSON.stringify(row);
    io.mkdirSync(dir,{recursive:true});
    if(io.existsSync(path)){if(io.readFileSync(path,'utf8')!==body)throw Error('memory_archive_conflict');return;}
    io.writeFileSync(path+'.tmp',body,{mode:0o600});
    const fd=io.openSync(path+'.tmp','r');try{io.fsyncSync(fd);}finally{io.closeSync(fd);}
    io.renameSync(path+'.tmp',path);
    const dd=io.openSync(dir,'r');try{io.fsyncSync(dd);}finally{io.closeSync(dd);}
  }
  recover(actor,afterSequence){
    // Stream the directory; do not load the full lifetime archive into RAM.
    const dir=this.directory+'/'+actor,io=this.io;
    if(!io.existsSync(dir))return {rows:[],count:0,sequence:afterSequence};
    const stream=io.opendirSync(dir);let entry,rows=[],count=0,sequence=afterSequence;
    try{while((entry=stream.readSync())){
      if(!/^\d{16}-mem-[0-9a-f]{24}\.json$/.test(entry.name))continue;
      const ordinal=Number(entry.name.slice(0,16));
      if(ordinal<=afterSequence)continue;
      const row=JSON.parse(io.readFileSync(dir+'/'+entry.name,'utf8'));
      if(!Number.isSafeInteger(row.memorySequence)||row.memorySequence!==ordinal||row.memoryId!==entry.name.slice(17,-5))throw Error('memory_archive_invalid_record');
      count++;sequence=Math.max(sequence,row.memorySequence);rows=sample([...rows,row]);
    }}finally{stream.closeSync();}
    return {rows,count,sequence};
  }
}
const empty = now => ({version:1,createdAt:now,sequence:0,summary:[],candidates:[],
  outbox:[],archiveError:null,archived:0,omittedCandidates:0,lastAttemptAt:null,lastSuccessAt:null,status:'waiting'});
export function memoryArchiveReady(person){
  const binding=bindings.get(person),m=person.dailyMemory;if(!binding||!m)return true;
  m.outbox??=[];if(m.recoveryError){m.archiveError=m.recoveryError;return false;}
  while(m.outbox.length){
    try{binding.archive.append(binding.actor,m.outbox[0]);}
    catch{m.archiveError='memory_archive_unavailable';return false;}
    m.outbox.shift();m.archived++;
  }
  m.archiveError=null;return true;
}
export function bindMemory(person,actor,archive,now){
  if(person.dailyMemory?.version===1){
    bindings.set(person,{actor,archive});
    const m=person.dailyMemory;m.outbox??=[];
    if(m.status==='pending')m.status='interrupted';
    // Recover events durably archived after the last state checkpoint. Never
    // replay their physical/financial effects; only restore their memory facts.
    if(archive.recover)try{
      const recovered=archive.recover(actor,m.sequence);
      m.recoveryError=null;m.sequence=recovered.sequence;m.archived+=recovered.count;
      m.candidates=sample([...m.candidates,...recovered.rows]);
      person.memory=bounded([...(person.memory||[]),...recovered.rows],MEMORY_LIMITS.recentBytes,MEMORY_LIMITS.recentRecords);
    }catch{m.recoveryError='memory_archive_unavailable';}
    memoryArchiveReady(person);return;
  }
  // Stage migration so an archive failure leaves all original records intact.
  const stage={memory:[],dailyMemory:empty(now)};
  bindings.set(stage,{actor,archive});
  for(const event of person.memory||[])addMemory(stage,event,now);
  person.memory=stage.memory;person.dailyMemory=stage.dailyMemory;bindings.set(person,{actor,archive});
}
export function addMemory(person,event,now=Date.now()){
  if(noise(event))return false;
  const binding=bindings.get(person);
  // Standalone domain helpers retain their existing finite in-memory contract.
  // The live director binds every actor before any event producer runs.
  if(!binding){person.memory=bounded([...(person.memory||[]),structuredClone(event)],MEMORY_LIMITS.recentBytes,MEMORY_LIMITS.recentRecords);return true;}
  const m=person.dailyMemory,sequence=m.sequence+1,source=structuredClone(event);
  delete source.memoryId;delete source.memorySequence;delete source.memoryRecordedAt;
  const row={...source,memoryId:'mem-'+createHash('sha256').update(JSON.stringify([binding.actor,sequence,now,source])).digest('hex').slice(0,24),memorySequence:sequence,memoryRecordedAt:now};
  // Events are created AFTER domain effects (including money receipts). A disk
  // error must never throw into those transactions. The checkpoint outbox owns
  // the exact unarchived fact; model calls wait until it is durably flushed.
  m.outbox.push(row);m.sequence=sequence;memoryArchiveReady(person);
  const all=[...m.candidates,row];
  m.candidates=sample(all);
  m.omittedCandidates+=all.length-m.candidates.length;
  person.memory=bounded([...(person.memory||[]),row],MEMORY_LIMITS.recentBytes,MEMORY_LIMITS.recentRecords);
  return true;
}
export function memoryDue(person,now){
  const m=person.dailyMemory;
  return !!m?.candidates.length && now-(m.lastAttemptAt??m.createdAt)>=MEMORY_LIMITS.intervalMs;
}
export function memoryBatch(person){
  const m=person.dailyMemory;
  return {version:1,throughSequence:m.sequence,previous:structuredClone(m.summary),candidates:structuredClone(m.candidates)};
}
export function beginMemoryAttempt(person,now){person.dailyMemory.lastAttemptAt=now;person.dailyMemory.status='pending';}
export function validateMemorySelection(batch,result){
  const ids=result?.selected_ids;
  if(!Array.isArray(ids)||ids.length>MEMORY_LIMITS.summaryRecords||new Set(ids).size!==ids.length)throw Error('memory_invalid_selection');
  const sources=new Map([...batch.previous,...batch.candidates].map(row=>[row.memoryId,row]));
  if(ids.some(id=>typeof id!=='string'||!sources.has(id)))throw Error('memory_unknown_source');
  const selected=ids.map(id=>structuredClone(sources.get(id))).sort((a,b)=>a.memorySequence-b.memorySequence);
  if(memoryBytes(selected)>MEMORY_LIMITS.summaryBytes)throw Error('memory_summary_limit');
  return selected;
}
export function applyMemorySelection(person,batch,result,now){
  const selected=validateMemorySelection(batch,result),m=person.dailyMemory;
  m.summary=selected; // Replacement, never append old daily summaries.
  m.candidates=m.candidates.filter(row=>row.memorySequence>batch.throughSequence);
  m.lastSuccessAt=now;m.status='ok';
  // Recent events remain available independently of a daily selection.
  return selected;
}
export function memoryContext(person){
  // One chronologically ordered union avoids temporal inversion across blocks
  // and retains selected facts even when byte fitting leaves holes in recency.
  const rows=new Map([...(person.dailyMemory?.summary||[]),...(person.memory||[])].map(row=>[row.memoryId,row]));
  return {memory:structuredClone([...rows.values()].sort((a,b)=>a.memorySequence-b.memorySequence))};
}
export function memoryStatus(person){
  const m=person.dailyMemory;if(!m)return null;
  return {status:m.status,lastAttemptAt:m.lastAttemptAt,lastSuccessAt:m.lastSuccessAt,
    nextAttemptAt:(m.lastAttemptAt??m.createdAt)+MEMORY_LIMITS.intervalMs,archived:m.archived,
    omittedCandidates:m.omittedCandidates,archiveError:m.archiveError,pendingArchive:m.outbox?.length||0,
    summaryBytes:memoryBytes(m.summary),recentBytes:memoryBytes(person.memory||[])};
}
