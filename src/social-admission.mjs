// Runtime-only admission time. Keep the director's original event time intact.
// Both actors receive one stamped snapshot, including when a world POST was late.
export function createSocialAdmission(saved=[]) {
 const pairs=new Map(saved.map(([id,events])=>[id,new Map(events)]));
 const admit=(world,now)=>{
  if(!world?.chars||!Number.isFinite(now))return world;
  const active=new Set(Object.values(world.chars).map(c=>c.social?.id).filter(Boolean));
  for(const id of pairs.keys())if(!active.has(id))pairs.delete(id);
  const initial=new Set([...active].filter(id=>!pairs.has(id)));
  for(const id of initial)pairs.set(id,new Map());
  const chars=Object.fromEntries(Object.entries(world.chars).map(([id,c])=>{
   const s=c.social;if(!s?.visual||!pairs.has(s.id))return [id,c];
   const seen=pairs.get(s.id),stamp=(list,kind)=>(list||[]).map(e=>{
    const {availableAt,...original}=e,key=kind+'|'+JSON.stringify(original);
    if(!seen.has(key))seen.set(key,Number.isFinite(availableAt)?Math.max(e.at,availableAt):initial.has(s.id)?e.at:Math.max(e.at,now));
    return {...e,availableAt:seen.get(key)};
   });
   return [id,{...c,social:{...s,visual:{...s.visual,events:stamp(s.visual.events,'choice'),intentEvents:stamp(s.visual.intentEvents,'intent')}}}];
  }));
  return {...world,chars};
 };
 admit.snapshot=()=>[...pairs].map(([id,events])=>[id,[...events]]);
 return admit;
}
