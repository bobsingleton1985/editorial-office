import {HER_SOCIAL_CATALOG,HER_SOCIAL_PROFILES} from './heroine-social-catalog.mjs';

// Reuse clips already loaded on the HER skeleton. A native gesture becomes a
// conversation variant only through the shared consent/turn/participation engine.
export function createHeroineSocial(nativeClips) {
  const byId=new Map(nativeClips.map(e=>[e.id,e])),assets={};
  const entries=HER_SOCIAL_CATALOG.entries.filter(e=>e.available).map(e=>{
    const source=byId.get(e.code);
    if(!source?.clip)throw Error('HER social source missing: '+e.code);
    if(source.seated!==e.seated)throw Error('HER social posture mismatch: '+e.code);
    if(Math.abs(source.clip.duration-e.range[1])>1/30)throw Error('HER social range mismatch: '+e.code);
    const clip=source.clip.clone();clip.name=e.animation;
    assets[e.asset]={animations:[clip]};
    return {...e};
  });
  return {actorKind:'heroine-her',entries,assets,styles:HER_SOCIAL_CATALOG.styles.filter(s=>s.entries.every(id=>entries.some(e=>e.id===id))),
    // A front-facing seated clip cannot silently become a sideways bench take.
    profiles:HER_SOCIAL_PROFILES,bases:{stand:'stand_idle',seated:'sit_idle'}};
}
