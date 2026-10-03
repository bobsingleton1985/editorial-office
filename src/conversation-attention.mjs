// Renderer-only projection. The existing social-turns executor owns the timeline.
export function resolveConversationAttention(chars, people, id, time) {
  const social=chars?.[id]?.social, partnerId=social?.partner;
  const partner=chars?.[partnerId]?.social, turn=social?.turn, otherTurn=partner?.turn;
  if(typeof social?.id!=='string' || !social.id || typeof partnerId!=='string' || partnerId===id ||
     partner?.id!==social.id || partner.partner!==id || !people?.[id]?.ed || !people?.[partnerId]?.ed ||
     !turn || !otherTurn || !Number.isFinite(time) || !Number.isFinite(turn.at) || turn.at>time ||
     !Number.isInteger(turn.revision) || turn.revision<0 ||
     otherTurn.speaker!==turn.speaker || otherTurn.at!==turn.at || otherTurn.revision!==turn.revision ||
     turn.source!=='visual_choreography' || otherTurn.source!==turn.source ||
     ![id,partnerId].includes(turn.speaker))return null;
  const speaker=turn.speaker,listener=id===speaker?partnerId:id;
  // On the real executor, reject a stale façade while an actor wraps/exits a turn.
  const a=people[id].ed.conversationStatus,b=people[partnerId].ed.conversationStatus;
  if(a || b) {
    const left=a?.call(people[id].ed),right=b?.call(people[partnerId].ed);
    if(!left || !right || [left,right].some(s=>s.conversationId!==social.id || s.turn!==turn.revision ||
       s.revision!==turn.revision || s.at!==turn.at || s.speaker!==speaker || s.listener!==listener || s.source!==turn.source) ||
       left.role!==(id===speaker?'speaker':'listener') || right.role!==(partnerId===speaker?'speaker':'listener'))return null;
  }
  return {conversationId:social.id,at:turn.at,revision:turn.revision,source:turn.source,
    roles:{speaker,listener},role:id===speaker?'speaker':'listener',targetActor:partnerId,targetBone:'head'};
}
