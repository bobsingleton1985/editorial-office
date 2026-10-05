import {MEMORY_LIMITS} from './daily-memory.mjs';
const CONTEXT=/^(?:(?:jev|qwen)_context_|relationship_request_core_exceeds_budget$)/;
const SAFE=new Set(['request_interrupted','session_unavailable','session_expired','session_not_owned','action_not_available','pilot_call_limit','daily_limit','model_disabled','openrouter_http_429','memory_invalid_selection','memory_unknown_source','memory_summary_limit','memory_revision_mismatch','memory_checkpoint_failed','memory_archive_unavailable']);
export const requestKey=(actor,kind)=>actor+':'+kind;
const health=st=>st.modelRequests??={version:1,current:{},history:[]};
export function requestAllowed(st,actor,kind,now){const h=health(st),x=h.current[requestKey(actor,kind)];if(now<(h.providerRetryAt||0))return false;return !x||x.status==='ok'||x.status==='retry_requested'||x.status==='deferred'||x.status==='cancelled'||x.status==='error'&&!x.blocked&&now>=x.retryAt;}
export function requestStarted(st,actor,kind,id,now){const h=health(st),key=requestKey(actor,kind),old=h.current[key];h.current[key]={actor,kind,id,status:'pending',startedAt:now,error:old?.error??null,failedAt:old?.failedAt??null,failures:old?.failures||0};}
export function requestFailed(st,actor,kind,id,error,now){
 const h=health(st),key=requestKey(actor,kind),old=h.current[key];
 const raw=String(error?.message||error),code=CONTEXT.test(raw)&&/^[a-z0-9_]{1,90}$/.test(raw)||SAFE.has(raw)?raw:'request_failed';
 if(code==='openrouter_http_429')h.providerRetryAt=now+60000;
 const failures=(old?.failures||0)+1;
 let blocked=CONTEXT.test(code)||['daily_limit','model_disabled'].includes(code);
 let retryAt=blocked?null:code==='openrouter_http_429'?h.providerRetryAt:now+Math.min(60000,5000*2**Math.min(failures-1,4));
 // Daily maintenance rechecks the final admission guard next day. Apply this
 // policy before recording history, including recovery of interrupted calls.
 if(kind==='memory'){
  blocked=false;const last=st.chars?.[actor]?.dailyMemory?.lastAttemptAt;
  retryAt=Math.max(now+5000,last==null?0:last+MEMORY_LIMITS.intervalMs);
 }
 const item={actor,kind,id,status:'error',error:code,failedAt:now,failures,blocked,retryAt};
 h.current[key]=item;h.history.push({...item});h.history=h.history.slice(-20);return item;
}
export function requestSucceeded(st,actor,kind,id,now){const h=health(st),key=requestKey(actor,kind);h.current[key]={actor,kind,id,status:'ok',completedAt:now,failures:0};h.history.push({actor,kind,id,status:'ok',completedAt:now});h.history=h.history.slice(-20);}
export function retryModelRequest(st,actor,kind,id,now){const item=health(st).current[requestKey(actor,kind)];if(!item||item.id!==id||item.status!=='error')return false;item.status='retry_requested';item.blocked=false;item.retryAt=now;return true;}
// A process restart cannot complete an old in-flight request. Preserve the error
// visibly. Physical/reflection context failures require an explicit owner retry;
// daily memory rechecks admission only at its next scheduled window.
export function recoverInterruptedRequests(st,now){let changed=false;for(const item of Object.values(health(st).current))if(item.status==='pending'){requestFailed(st,item.actor,item.kind,item.id,new Error(item.error||'request_interrupted'),now);changed=true;}return changed;}

export function requestDeferred(st,actor,kind,id,now){const h=health(st);h.current[requestKey(actor,kind)]={actor,kind,id,status:'deferred',reason:'no_viewers',deferredAt:now,failures:0};}

// Explicit owner hangup cancels only a failed dialogue; retain its prior error in history.
export function cancelOwnerDialogueRequest(st,actor,now){const h=health(st),key=requestKey(actor,'dialogue'),old=h.current[key];if(old?.status!=='error')return false;const item={...old,status:'cancelled',cancelledAt:now,cancelledBy:'owner_hangup'};h.current[key]=item;h.history.push({...item});h.history=h.history.slice(-20);return true;}
