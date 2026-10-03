// No random/time state: late viewers rebuild the same choices from the pair timeline.
// Candidates have already passed semantic, posture and asset-availability admission.
export function variantHash(value) {
 let h=2166136261;
 for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
 h=Math.imul(h^(h>>>16),0x85ebca6b)>>>0;
 return (h^(h>>>13))>>>0;
}
export function chooseConversationVariant(candidates,history,key,actor) {
 const unique=[...new Map(candidates.map(x=>[x.identity,x])).values()];
 if(!unique.length)return null;
 const last=history.at(-1),own=history.filter(x=>x.actor===actor),ownLast=own.at(-1);
 let pool=unique;
 const different=pool.filter(x=>x.identity!==last?.identity);
 if(different.length)pool=different;
 const ownDifferent=pool.filter(x=>x.identity!==ownLast?.identity);
 if(ownDifferent.length)pool=ownDifferent;
 const counts=xs=>{const out=new Map();for(const x of xs)out.set(x.identity,(out.get(x.identity)||0)+1);return out;};
 const ownUses=counts(own),pairUses=counts(history);
 return pool.map(x=>({x,uses:ownUses.get(x.identity)||0,pairUses:pairUses.get(x.identity)||0,tie:variantHash(key+'|'+x.identity)}))
  .sort((a,b)=>a.uses-b.uses||a.pairUses-b.pairUses||a.tie-b.tie||a.x.id.localeCompare(b.x.id))[0].x;
}
