const CONTEXT=/^(?:(?:jev|qwen)_context_|relationship_request_core_exceeds_budget$)/;
const SAFE=new Set(['request_interrupted','session_unavailable','session_expired','session_not_owned','action_not_available','pilot_call_limit','daily_limit','model_disabled','openrouter_http_429','invalid_owner_intent']);
export const requestKey=(actor,kind)=>actor+':'+kind;
const health=st=>st.modelRequests??={version:1,current:{},history:[]};
export function requestAllowed(st,actor,kind,now){const h=health(st),x=h.current[requestKey(actor,kind)];if(now<(h.providerRetryAt||0))return false;return !x||x.status==='ok'||x.status==='retry_requested'||x.status==='deferred'||x.status==='cancelled'||x.status==='error'&&!x.blocked&&now>=x.retryAt;}
export function requestStarted(st,actor,kind,id,now){const h=health(st),key=requestKey(actor,kind),old=h.current[key];h.current[key]={actor,kind,id,status:'pending',startedAt:now,error:old?.error??null,failedAt:old?.failedAt??null,failures:old?.failures||0};}
export function requestFailed(st,actor,kind,id,error,now){const h=health(st),key=requestKey(actor,kind),old=h.current[key];const raw=String(error?.message||error),code=CONTEXT.test(raw)&&/^[a-z0-9_]{1,90}$/.test(raw)||SAFE.has(raw)?raw:'request_failed';if(code==='openrouter_http_429')h.providerRetryAt=now+60000;const failures=(old?.failures||0)+1,blocked=CONTEXT.test(code)||['daily_limit','model_disabled','invalid_owner_intent'].includes(code);const item={actor,kind,id,status:'error',error:code,failedAt:now,failures,blocked,retryAt:blocked?null:code==='openrouter_http_429'?h.providerRetryAt:now+Math.min(60000,5000*2**Math.min(failures-1,4))};h.current[key]=item;h.history.push({...item});h.history=h.history.slice(-20);return item;}
export function requestSucceeded(st,actor,kind,id,now){const h=health(st),key=requestKey(actor,kind);h.current[key]={actor,kind,id,status:'ok',completedAt:now,failures:0};h.history.push({actor,kind,id,status:'ok',completedAt:now});h.history=h.history.slice(-20);}
export function retryModelRequest(st,actor,kind,id,now){const item=health(st).current[requestKey(actor,kind)];if(!item||item.id!==id||item.status!=='error')return false;item.status='retry_requested';item.blocked=false;item.retryAt=now;return true;}
// A process restart cannot complete an old in-flight request. Preserve the error
// visibly, keeping context failures blocked until a new explicit owner retry.
export function recoverInterruptedRequests(st,now){let changed=false;for(const item of Object.values(health(st).current))if(item.status==='pending'){requestFailed(st,item.actor,item.kind,item.id,new Error(item.error||'request_interrupted'),now);changed=true;}return changed;}

export function requestDeferred(st,actor,kind,id,now){const h=health(st);h.current[requestKey(actor,kind)]={actor,kind,id,status:'deferred',reason:'no_viewers',deferredAt:now,failures:0};}

// Explicit owner hangup cancels only a failed dialogue; retain its prior error in history.
export function cancelOwnerDialogueRequest(st,actor,now){const h=health(st),key=requestKey(actor,'dialogue'),old=h.current[key];if(old?.status!=='error')return false;const item={...old,status:'cancelled',cancelledAt:now,cancelledBy:'owner_hangup'};h.current[key]=item;h.history.push({...item});h.history=h.history.slice(-20);return true;}

// A fresh owner message can move past a malformed interpretation without
// repeating an old financial/task effect. Keep that failed turn and its error.
export function advanceFailedOwnerDialogue(st,actor,nextId,now){
 const h=health(st),key=requestKey(actor,'dialogue'),old=h.current[key],p=st.chars[actor];
 if(old?.status!=='error'||old.error!=='invalid_owner_intent')return false;
 const turn=p?.ownerDialogue?.find(t=>t.status==='waiting');
 if(!turn||turn.id===nextId)return false;
 if(turn.effect||turn.intentResolved){return retryModelRequest(st,actor,'dialogue',old.id,now);}
 Object.assign(turn,{status:'failed',failedAt:now,failure:'invalid_owner_intent',supersededBy:nextId});
 const item={...old,status:'cancelled',cancelledAt:now,cancelledBy:'owner_new_message'};
 h.current[key]=item;h.history.push({...item});h.history=h.history.slice(-20);return true;
}
