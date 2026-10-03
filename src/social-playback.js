import {styleAllowed} from './conversation-policy.mjs';
import catalog from './social-catalog.json';
import {HER_SOCIAL_CATALOG} from './heroine-social-catalog.mjs';
import {HEROINE_REPERTOIRE} from './heroine-repertoire.mjs';
import {sha256} from './sha256.mjs';
export { catalog as SOCIAL_CATALOG };
export const socialCatalogFor = actorKind => actorKind==='heroine-her'?HER_SOCIAL_CATALOG:catalog;
export const socialActorKind = (social,actor) => social.visual?.actorKinds?.[actor] || (actor==='heroine'?'heroine-her':'motus');
// Low semantic load continuation; expressive clips require a compatible declared intent.
export const SOCIAL_CONTINUATION = 'gestures-standing__IDLE-085';
export const socialAlias = id => 'social_'+id.replace(/[^a-zA-Z0-9]/g,'_') + (/IDLE-(013|106|054|057)$/.test(id)?'_stop':'');
// These native durations are shared metadata, not the local actor's loaded clips.
// The chair transitions were measured from editor2A-phoneL-web-v01.glb.
const CHAIR_DURATIONS={tbl_to_chair:1.5666667222976685,chair_to_tbl:1.7333333492279053};
const HER_CHAIR_DURATIONS=Object.fromEntries(HEROINE_REPERTOIRE.filter(e=>e.runtime&&Object.hasOwn(CHAIR_DURATIONS,e.id)).map(e=>[e.id,e.duration]));
const timing=new Map([catalog,HER_SOCIAL_CATALOG].map(c=>[c,new Map(c.entries.filter(e=>e.available).map(e=>[socialAlias(e.id),e.range[1]]))]));
export function socialDuration(actorKind,name) {
  return timing.get(socialCatalogFor(actorKind)).get(name) || (actorKind==='heroine-her'?HER_CHAIR_DURATIONS[name]:CHAIR_DURATIONS[name]) || 0;
}
export async function loadSocialAssets(get, parse) {
  const entries=catalog.entries.filter(e=>e.available), paths=[...new Set(entries.map(e=>e.asset))], assets={};
  await Promise.all(paths.map(async path=> {
    const buffer=await get(path), expected=entries.find(e=>e.asset===path).sha256;
    const hash=await sha256(buffer);
    if(hash!==expected)throw Error('social asset changed: '+path);
    assets[path]=await parse(buffer);
  }));
  for(const e of entries) {
    const clip=assets[e.asset].animations.find(c=>c.name===e.animation);
    if(!clip || Math.abs(clip.duration-e.range[1])>1/30)throw Error('social range mismatch: '+e.id);
  }
  return {entries,assets,styles:catalog.styles};
}
export function socialPlan(style, key, t0, duration, context={intent:'calm',relation:'neutral',pose:'standing'}) {
  const actorKind=context.actorKind||'motus', bank=socialCatalogFor(actorKind);
  if(style==='neutral')style=actorKind==='heroine-her'?'heroine-native__IDLE-085':SOCIAL_CONTINUATION;
  if(!styleAllowed(style,context.intent,context.relation,context.pose,context))return null;
  const s=bank.styles.find(x=>x.id===style);if(!s||s.entries.some(id=>!bank.entries.some(e=>e.id===id&&e.available)))return null;
  let t=0;const segs=[];
  const append=n=>{const d=duration(n);if(!Number.isFinite(d)||d<=0)return false;segs.push({n,s:t,d});t+=d-0.35;return true;};
  if(s.chairTransition&&!append('tbl_to_chair'))return null;
  for(const id of s.entries) {const n=socialAlias(id),d=duration(n);if(!Number.isFinite(d)||d<=0)return null;segs.push({n,s:t,d});t+=d-0.35;}
  if(s.chairTransition&&!append('chair_to_tbl'))return null;
  const T=t+0.35;for(const a of segs)a.phraseEnd=T;
  return {kind:s.profile?.startsWith('desk')?'desk':s.profile?'bench':'stand',social:true,key,t0,segs,T};
}
export function nextSocialPlan(social, playedKey, t0, duration) {
  if(!social)return null;
  const key=social.id+'|'+social.styleRevision;
  const selected=social.style&&social.style!=='neutral'&&key!==playedKey;
  const g=socialPlan(selected?social.style:'neutral',key,t0,duration);
  return g?{...g,selected}:null;
}
export function participationPacket(chars, people, elapsedMs=0) {
  const pairs=[],seen=new Set();
  for(const [id,e] of Object.entries(chars||{})) {
    const s=e.social;if(!s||seen.has(s.id))continue;seen.add(s.id);
    const other=chars[s.partner];if(other?.social?.id!==s.id||other.social.partner!==id)continue;
    const a=people[id]?.ed?.socialStatus(),b=people[s.partner]?.ed?.socialStatus();
    const ready=!!a&&!!b&&a.seq===e.seq&&b.seq===other.seq&&a.conversationId===s.id&&b.conversationId===s.id&&a.ready&&b.ready&&Math.hypot(a.x-b.x,a.z-b.z)<2.5;
    const faces=(u,v)=>{const d=Math.hypot(v.x-u.x,v.z-u.z);return d>0.4 && ((u.seat?u.ax:u.fx)*(v.x-u.x)+(u.seat?u.az:u.fz)*(v.z-u.z))/d>0.5;};
    const addressed=ready&&faces(a,b)&&faces(b,a);
    pairs.push({conversationId:s.id,elapsedMs,actors:{[id]:{seq:e.seq,partner:s.partner,ready:!!addressed,...(addressed&&a.expression?{expression:a.expression}:{})},[s.partner]:{seq:other.seq,partner:id,ready:!!addressed,...(addressed&&b.expression?{expression:b.expression}:{})}}});
  }
  return pairs;
}

export function socialSeatOccupancy(chars,people,except){
 const seats=new Set();for(const [id,e]of Object.entries(chars||{})){if(id===except)continue;const goal=e.cmd||e.from;if(goal?.seat)seats.add(goal.seat);const actual=people?.[id]?.ed?.status?.();if(actual?.seat)seats.add(actual.seat);else if(!actual&&e.from?.seat)seats.add(e.from.seat);}
 return [...seats];
}
