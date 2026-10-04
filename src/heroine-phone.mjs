// Original MC phone motions transferred to HER53, with HER bone-local contacts.
export function attachHeroinePhone(extra,bank,profile){
  const required=['start','01','02','03','stop'].flatMap(n=>['phone_'+n,'stand_phone_'+n]);
  if(!required.every(n=>bank.animations.some(c=>c.name===n)))throw Error('Incomplete HER phone bank');
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(profile?.version!==1||!['ear','mouth','outward','faceAxis'].every(k=>vector(profile[k])))throw Error('Invalid HER phone contacts');
  if(!extra.shared?.phonesFor)throw Error('Phone prop unavailable');
  extra.phones=extra.shared.phonesFor(extra.id);
  if(!extra.phones)throw Error('Phone prop unavailable');
  extra.phoneClips=bank;
  extra.phoneProfile=profile;
}
