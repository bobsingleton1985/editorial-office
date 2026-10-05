// Validated executor observation, tied to the current actor command.
export function readPhoneWitness(actor, command) {
  const p=actor?.phone;
  if(actor?.loaded!==true || !Number.isInteger(command?.seq) || actor.seq!==command.seq || p?.seq!==command.seq || !['idle','pickup','talk','return'].includes(p.phase))return null;
  const occupied=p.occupied===true && p.phase!=='idle';
  return {seq:command.seq,ready:p.ready===true,occupied,phase:p.phase,
    receiving:p.receiving===true && p.ready===true && occupied && p.phase==='talk' && actor.activity==='phone' && command.activity==='phone'};
}
