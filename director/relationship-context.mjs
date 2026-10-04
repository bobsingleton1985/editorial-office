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
// maxBytes is a target for the intermediate snapshot, not a Jev token limit.
// Only the verified v4 server can admit its final compact System One body.
export function finalContextGuardReady(status){
 const g=status?.jev_context_guard;
 return status?.model==='typesafe/jev-1.13'&&g?.version==='jev-context-v4'&&g.ready===true&&g.enforced===true
  &&g.mode==='estimated'&&g.strict===false&&g.exact_token_count===false
  &&g.measurement==='local_lexical_estimate_v1'&&g.safety_reserve_percent===20
  &&g.admission_context_limit===25600&&g.admission_request_limit===51200
  &&g.state_and_longest_question_limit===32000&&g.request_limit===64000&&g.target===24000&&g.counter_available===true;
}
export function fitRelationshipRequest(input,maxBytes=65000,serverStatus=null){
 const out=structuredClone(input),s=out.self;
 // Wallet rows already carry these exact numbers. Retain one factual source
 // and an explicit per-action lookup instead of repeating the prose in criteria.
 for(const a of out.available_actions||[]){
  const row=s.finances?.livelihood?.wallet?.spendingChoices?.find(x=>x.action===a.id);
  if(!row)continue;
  const suffix=` Собственный расход при исполнении/согласии: ${row.ownCostCents/100} USD; доступный остаток после него ${row.remainingCents/100} USD.${row.foodAndDueDebtGapAfterCents>0?' После этого на еду и ближайшие долги не хватит '+row.foodAndDueDebtGapAfterCents/100+' USD.':''}`;
  if(a.description?.endsWith(suffix))a.description=a.description.slice(0,-suffix.length)+' Финансы: self.finances.livelihood.wallet.spendingChoices.';
 }
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
  // Keep every choice and remaining fact for the final server compactor. A
  // byte target before compaction must not reject a request that can fit there.
  if(finalContextGuardReady(serverStatus))break;
  throw Error('relationship_request_core_exceeds_budget');
 }
 return out;
}
