import catalog from './social-catalog.json';
import {sha256} from './sha256.mjs';
export { catalog as SOCIAL_CATALOG };
// The accepted Standing Arguing take is an authored standing speech loop.
// Playing its gestures does not assign an argument/topic/emotion to either person.
export const SOCIAL_CONTINUATION = 'mixamo-gap__mxg_arguing';
export const socialAlias = id => 'social_'+id.replace(/[^a-zA-Z0-9]/g,'_') + (/IDLE-(013|106|054|057)$/.test(id)?'_stop':'');
export async function loadSocialAssets(get, parse) {
  const entries=catalog.entries.filter(e=>e.available), paths=[...new Set(entries.map(e=>e.asset))], assets={};
  for(const path of paths) {
    const buffer=await get(path), expected=entries.find(e=>e.asset===path).sha256;
    const hash=await sha256(buffer);
    if(hash!==expected)throw Error('social asset changed: '+path);
    assets[path]=await parse(buffer);
  }
  for(const e of entries) {
    const clip=assets[e.asset].animations.find(c=>c.name===e.animation);
    if(!clip || Math.abs(clip.duration-e.range[1])>1/30)throw Error('social range mismatch: '+e.id);
  }
  return {entries,assets,styles:catalog.styles};
}
export function socialPlan(style, key, t0, duration) {
  if(style==='neutral')style=SOCIAL_CONTINUATION;
  const s=catalog.styles.find(x=>x.id===style);if(!s)return null;
  let t=0;const segs=[];
  for(const id of s.entries) {const n=socialAlias(id),d=duration(n);if(!d)return null;segs.push({n,s:t,d});t+=d-0.35;}
  return {kind:'stand',social:true,key,t0,segs,T:t+0.35};
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
    const faces=(u,v)=>{const d=Math.hypot(v.x-u.x,v.z-u.z);return d>0.4 && (u.fx*(v.x-u.x)+u.fz*(v.z-u.z))/d>0.5;};
    const addressed=ready&&faces(a,b)&&faces(b,a);
    pairs.push({conversationId:s.id,elapsedMs,actors:{[id]:{seq:e.seq,partner:s.partner,ready:!!addressed},[s.partner]:{seq:other.seq,partner:id,ready:!!addressed}}});
  }
  return pairs;
}
