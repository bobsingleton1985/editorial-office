// Pure candidate: goals use the existing {seat}/{spot} executor contract.
// This module proposes/revalidates assignments. It never moves, reserves or consents for actors.
export const CONVERSATION_PLACES = Object.freeze({
 diningChair:{x:-.7014603836686213,z:.23440707881994335,th:.04388},
 deskA:{seat:{x:-4.181118,z:-2.834009304347826,th:.04388},visitor:{id:'conversationDeskA',x:-3.8,z:-.823391304347826,th:-2.954262}},
 deskB:{seat:{x:.418882,z:-3.738009304347826,th:.04388},visitor:{id:'conversationDeskB',x:.4,z:-1.727391304347826,th:3.132202}},
 deskC:{seat:{x:3.918882,z:-3.734009304347826,th:.04388},visitor:{id:'conversationDeskC',x:3.5,z:-1.723391304347826,th:2.936196}},
 benchS:{x:-1.5358049689440993,z:3.126,th:1.6146763267948965},
 benchM:{x:-1.5358049689440993,z:2.10,th:1.6146763267948965},
 benchN:{x:-1.5358049689440993,z:1.074,th:1.6146763267948965},
 window:{x:-4.55,z:2.5},window2:{x:-4.55,z:1.6},
 tv2:{x:.577,z:2.039},tv3:{x:3.307,z:3.299},tv4:{x:.63,z:3.719},tv5:{x:1.995,z:4.349},
 teletypeRead:{x:4.55,z:.5},conversationTeletypePartner:{x:4.1,z:2.1}
});
const benchIds=['benchS','benchM','benchN'];
const standPairs=[['window','window2'],['tv2','tv4'],['tv3','tv5'],['tv4','tv5']];
const benchPairs=[['benchS','benchM'],['benchM','benchS'],['benchM','benchN'],['benchN','benchM'],['benchS','benchN'],['benchN','benchS']];
const desk=p=>/^desk[ABC]$/.test(p||''), bench=p=>benchIds.includes(p);
const currentSeat=a=>a?.mode==='seated'&&typeof a.seat==='string'?a.seat:null;
const targetOf=a=>a?.goal?.seat||a?.goal?.spot||a?.place||currentSeat(a);
const visitorOf=id=>Object.values(CONVERSATION_PLACES).find(p=>p.visitor?.id===id)?.visitor;
const poseOf=id=>CONVERSATION_PLACES[id]?.seat||CONVERSATION_PLACES[id]||visitorOf(id);
const supported=(caps,actor,profile)=>Array.isArray(caps?.[actor]?.profiles)&&caps[actor].profiles.includes(profile);
function occupancy(input){
 const out=[];
 for(const [owner,a]of Object.entries(input.actors||{}))for(const place of new Set([currentSeat(a),a.place,targetOf(a)].filter(Boolean)))out.push({owner,place});
 for(const v of [...(input.occupied||[]),...(input.reservations||[])])out.push(typeof v==='string'?{place:v,owner:null}:v);
 return out;
}
function freePlace(place,members,occupied){
 return !occupied.some(v=>!members.includes(v.owner)&&(v.place===place||place==='tv5'&&v.place==='bar'||place==='bar'&&v.place==='tv5'));
}
export function benchPassageTags(seat,occupiedSeats=[]){
 const blocked=new Set(occupiedSeats);
 if(seat==='benchS')return ['R01'];
 if(seat==='benchN')return ['L01'];
 if(seat!=='benchM')return [];
 // The complete native root sweep, not only the entry/exit endpoint, crosses the nearer neighbour.
 return [...(!blocked.has('benchN')?['L02']:[]),...(!blocked.has('benchS')?['R02']:[])];
}
function assignment(actor,place,profile,side='front'){
 const isDesk=desk(place),isChair=place==='diningChair',isBench=bench(place),kind=isDesk?'desk':isChair?'chair':isBench?'bench':'stand';
 return {actor,place,goal:kind==='stand'?{spot:place}:{seat:place},posture:kind,
  contactProfile:isDesk||isChair?'sit-chair-table':isBench?'sit-booth-with-chair-conversation':'standing-floor',
  playbackProfile:profile,side,pose:{...poseOf(place)},entryTags:isChair?['L02a','R02a']:[],exitTags:isChair?['L02a','R02a']:[],mustKeepSeatFrame:kind!=='stand'};
}
function commitProposal(input,members,kind,assignments,id,occupied){
 const reasons=[];
 if(kind==='dining'&&Object.values(assignments).some(a=>a.place==='benchM')&&occupied.some(v=>v.place==='benchN'&&!members.includes(v.owner)))reasons.push({code:'dining-near-neighbour-interposes',place:'benchN'});
 for(const a of Object.values(assignments))if(!freePlace(a.place,members,occupied))reasons.push({code:'occupied',actor:a.actor,place:a.place});
 const assignedPlaces=Object.values(assignments).map(a=>a.place);
 if(assignedPlaces.includes('benchS')&&assignedPlaces.includes('benchN')&&occupied.some(v=>v.place==='benchM'&&!members.includes(v.owner)))reasons.push({code:'bench-middle-interposes',place:'benchM'});
 const takenSeats=[...occupied.map(v=>v.place).filter(bench),...Object.values(assignments).map(a=>a.place).filter(bench)];
 for(const a of Object.values(assignments)){
  if(!['idle','seated'].includes(input.actors[a.actor]?.mode))reasons.push({code:'actor-not-stationary',actor:a.actor});
  if(a.posture==='bench'){
   a.entryTags=a.exitTags=benchPassageTags(a.place,takenSeats);
   if(!a.entryTags.length)reasons.push({code:'bench-route-blocked',actor:a.actor,place:a.place});
  }
  a.preserveSeated=currentSeat(input.actors[a.actor])===a.place;
  a.changesPostureOrPlace=!a.preserveSeated&&(currentSeat(input.actors[a.actor])!==null||targetOf(input.actors[a.actor])!==a.place);
  if(!supported(input.capabilities,a.actor,a.playbackProfile))reasons.push({code:'profile-unavailable',actor:a.actor,profile:a.playbackProfile});
 }
 const preservedPlaces=Object.values(assignments).filter(a=>a.place===targetOf(input.actors[a.actor])).length;
 const estimatedTravel=Object.values(assignments).reduce((sum,a)=>{const actor=input.actors[a.actor],from=Number.isFinite(actor.x)&&Number.isFinite(actor.z)?actor:poseOf(currentSeat(actor)||actor.place);return sum+(from?Math.hypot(a.pose.x-from.x,a.pose.z-from.z):0);},0);
 return {id,kind,members:[...members],assignments,actorRevisions:Object.fromEntries(members.map(id=>[id,input.actors[id].seq??null])),preference:{preservedPlaces,estimatedTravel},
  supported:reasons.length===0,reasons,requiresIndependentConsent:true,
  invariants:['revalidate occupancy and executor route before accept','reserve individual goals through existing authority','count only mutual rendered participation','keep native ranges and required start/stop','a blocked exit does not authorize the partner to stand'],
  geometryEvidence:'project-handoffs/conversation-places-20261003/geometry-contract.json'};
}
/**
 * Input actors[id]: {seq,place,goal?,mode,seat}; mode/seat must be fresh executor facts.
 * occupied/reservations: [{place,owner?}] or place IDs; third-party reservations block.
 * capabilities[id].profiles: explicit executable profiles, including living compatible listener.
 * intent: auto | desk | bench | standing | teletype. auto preserves an actual seated anchor.
 * Result includes unavailable proposals with reasons for diagnostics; only supported=true may be offered.
 */
export function conversationPlaceProposals(input){
 const members=input.members||[],actors=input.actors||{};
 if(members.length!==2||members[0]===members[1]||members.some(id=>!actors[id]))return {intent:input.intent||'auto',proposals:[],unsupported:[{code:'invalid-pair'}]};
 const occupied=occupancy(input),seats=members.map(id=>currentSeat(actors[id]));
 let intent=input.intent||'auto';
 if(intent==='auto')intent=seats.includes('diningChair')?'dining':seats.some(desk)?'desk':seats.some(bench)?'bench':members.some(id=>['teletype','teletypeRead','conversationTeletypePartner'].includes(actors[id].place))?'teletype':'standing';
 const proposals=[],unsupported=[];
 if(intent==='dining'){
  for(const host of members.filter(id=>currentSeat(actors[id])==='diningChair')){
   const guest=members.find(id=>id!==host),current=currentSeat(actors[guest]);
   for(const place of ['benchN','benchM'].filter(p=>!bench(current)||p===current)){
    const a=assignment(host,'diningChair','desk-front'),b=assignment(guest,place,'bench-left','left');
    proposals.push(commitProposal(input,members,'dining',{[host]:a,[guest]:b},`dining:${host}:${guest}:${place}`,occupied));
   }
  }
 }else if(intent==='teletype'){
  for(const places of [['teletypeRead','conversationTeletypePartner'],['conversationTeletypePartner','teletypeRead']]){
   const assignments={};for(let i=0;i<2;i++){
    const own=assignment(members[i],places[i],'teletype-standing'),other=poseOf(places[1-i]);own.pose.th=Math.atan2(other.x-own.pose.x,other.z-own.pose.z);assignments[members[i]]=own;
   }
   const p=commitProposal(input,members,'teletype',assignments,`teletype:${members[0]}:${places[0]}:${members[1]}:${places[1]}`,occupied);
   p.preconditions=['read_wire must finish voluntarily before conversational turn and participation'];
   p.gestureConstraint={wideGestureSweepsVerified:false,requireLocationCompatibleSubset:true,minimumStaticClearance:{teletypeRead:.623939,conversationTeletypePartner:.581378},note:'Navigation radius .49 does not certify full arm gesture sweep; validate/filter existing styles for this place.'};
   for(const id of members)if(actors[id].activity==='read_wire'){p.reasons.push({code:'finish-reading-first',actor:id});p.supported=false;}
   proposals.push(p);
  }
 }else if(intent==='desk'){
  const hosts=members.filter(id=>desk(currentSeat(actors[id])));
  if(!hosts.length)unsupported.push({code:'no-actual-seated-desk-anchor'});
  for(const host of hosts){
   const guest=members.find(id=>id!==host),seat=currentSeat(actors[host]),visitor=CONVERSATION_PLACES[seat].visitor;
   const a=assignment(host,seat,'desk-front'),b=assignment(guest,visitor.id,'stand');
   b.pose.th=Math.atan2(a.pose.x-b.pose.x,a.pose.z-b.pose.z);
   proposals.push(commitProposal(input,members,'desk',{[host]:a,[guest]:b},`desk:${host}:${seat}:${guest}`,occupied));
  }
 }else if(intent==='bench'){
  // Preserve every participant already seated on this bench. Do not relocate them to manufacture a pair.
  const choices=benchPairs.filter(pair=>members.every((id,i)=>!bench(currentSeat(actors[id]))||currentSeat(actors[id])===pair[i]));
  if(!choices.length)unsupported.push({code:'no-compatible-bench-pair'});
  for(const pair of choices){
   const assignments={};for(let i=0;i<2;i++){
    const own=pair[i],other=pair[1-i],side=CONVERSATION_PLACES[other].z<CONVERSATION_PLACES[own].z?'left':'right';
    assignments[members[i]]=assignment(members[i],own,'bench-'+side,side);
   }
   proposals.push(commitProposal(input,members,'bench',assignments,`bench:${members[0]}:${pair[0]}:${members[1]}:${pair[1]}`,occupied));
  }
 }else if(intent==='standing'){
  for(const pair of standPairs)for(const places of [pair,[...pair].reverse()]){
   const assignments={};for(let i=0;i<2;i++){
    const own=assignment(members[i],places[i],'stand'),other=poseOf(places[1-i]);own.pose.th=Math.atan2(other.x-own.pose.x,other.z-own.pose.z);assignments[members[i]]=own;
   }
   proposals.push(commitProposal(input,members,'standing',assignments,`standing:${members[0]}:${places[0]}:${members[1]}:${places[1]}`,occupied));
  }
 }else unsupported.push({code:'unsupported-intent',intent});
 proposals.sort((a,b)=>Number(b.supported)-Number(a.supported)||b.preference.preservedPlaces-a.preference.preservedPlaces||a.preference.estimatedTravel-b.preference.estimatedTravel||a.id.localeCompare(b.id));
 return {intent,proposals,unsupported};
}
export function revalidateConversationPlace(proposal,input){
 for(const id of proposal.members||[])if((input.actors?.[id]?.seq??null)!==proposal.actorRevisions?.[id])return {ok:false,reasons:[{code:'actor-revision-changed',actor:id}]};
 const next=conversationPlaceProposals({...input,members:proposal.members,intent:proposal.kind==='standing'?'standing':proposal.kind}).proposals.find(p=>p.id===proposal.id);
 return next?{ok:next.supported,proposal:next,reasons:next.reasons}:{ok:false,reasons:[{code:'assignment-no-longer-valid'}]};
}
