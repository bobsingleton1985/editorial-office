// Bound a transport copy only; the canonical relationship history remains intact.
export function relationProjection(r,decisions=12){
 const out=structuredClone(r);
 out.projection={decisionsAvailable:r.dimensionDecisions?.length||0,observationsAvailable:r.observations?.length||0};
 out.dimensionDecisions=(out.dimensionDecisions||[]).slice(-decisions).map(e=>({...e,evidenceCount:e.evidence?.length||0,evidence:e.evidence?.slice(-3)}));
 out.observations=(out.observations||[]).slice(-24);
 for(const d of Object.values(out.dimensions||{}))if(Array.isArray(d.basis)){d.basisCount=d.basis.length;d.basis=d.basis.slice(-3);}
 if(out.courtship)out.courtship.history=out.courtship.history.slice(-16);
 return out;
}
export function fitRelationshipRequest(input,maxBytes=65000){
 const out=structuredClone(input),s=out.self;
 s.relationships=Object.fromEntries(Object.entries(s.relationships||{}).map(([id,r])=>[id,relationProjection(r,6)]));
 if(s.currentActivity?.relationship){
  s.currentActivity.relationship=relationProjection(s.currentActivity.relationship,6);
  const partner=s.currentActivity.partner;
  if(partner&&s.relationships[partner]&&JSON.stringify(s.currentActivity.relationship)===JSON.stringify(s.relationships[partner])){
   delete s.currentActivity.relationship;
   s.currentActivity.relationshipRef='self.relationships.'+partner;
  }
 }
 s.contextProjection={reason:'bounded_transport_history',maxStateBytes:maxBytes,omittedRecords:0};
 const pop=(a,keep=0)=>{if(a?.length>keep){a.shift();s.contextProjection.omittedRecords++;return true;}return false;};
 const relations=[...Object.values(s.relationships),...(s.currentActivity?.relationship?[s.currentActivity.relationship]:[])];
 while(new TextEncoder().encode(JSON.stringify(out)).length>maxBytes){
  // Prefer old supporting history over current personal memories and episodes.
  if(relations.some(r=>pop(r.dimensionDecisions,1))||pop(s.finances?.transactions,3)||relations.some(r=>pop(r.observations,3))
    ||relations.some(r=>Object.values(r.dimensions||{}).some(d=>pop(d.basis,1)))||relations.some(r=>pop(r.courtship?.history,3))
    ||relations.some(r=>pop(r.dimensionDecisions))||relations.some(r=>pop(r.observations,1))||pop(s.finances?.transactions,1)
    ||pop(s.memory,1)||pop(s.recentEpisodes,1))continue;
  throw Error('relationship_request_core_exceeds_budget'); // never discard choices or the reflection evidence under evaluation
 }
 return out;
}
