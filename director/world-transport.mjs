// Browser transport only. Never use this projection as canonical memory or Jev context.
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
// The authenticated /director/world relay endpoint admits 1 MiB (not the 64 KiB generic body limit).
// Keep a 50% transport margin; this is unrelated to the Jev context/token budget.
export const WORLD_TRANSPORT_BUDGET_BYTES=512*1024;
export function projectWorld(input,maxBytes=WORLD_TRANSPORT_BUDGET_BYTES){
 const out=structuredClone(input),relations=[];
 for(const p of Object.values(out.chars||{})){
  // Jev-only explanatory text and duplicated relationship detail are not read by the viewer.
  if(p.social)delete p.social.relationship;
  if(p.finances?.livelihood)for(const k of ['explanation','planning','romanceIndependent','availableEarningSteps','activeEarning'])delete p.finances.livelihood[k];
  for(const r of Object.values(p.relationships||{})){
   r.projection={...r.projection,transport:'browser',decisionsAvailable:r.projection?.decisionsAvailable??r.dimensionDecisions?.length??0};
   delete r.observations;delete r.basis;
   for(const d of Object.values(r.dimensions||{}))delete d.basis;
   relations.push(r);
  }
 }
 // Legacy pre-multi-character pages only require the physical actor/state, not modern panels.
 if(out.editor){out.editor={...out.editor};for(const k of ['relationships','finances','social','memory','reflection'])delete out.editor[k];}
 while(bytes(out)>maxBytes){
  // Fairly shrink the oldest visible history, retaining current values and all financial obligations.
  const r=relations.filter(r=>(r.dimensionDecisions?.length||0)>1).sort((a,b)=>b.dimensionDecisions.length-a.dimensionDecisions.length)[0];
  if(r){r.dimensionDecisions.shift();continue;}
  throw Error('world_transport_core_exceeds_budget');
 }
 return out;
}
