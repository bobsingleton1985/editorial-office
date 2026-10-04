// Vary audible contacts within 40 ms of the rendered key strike. No timers:
// paused, stale, silent or unrendered animation cannot produce keystrokes.
const CONTACTS=[8,25,30,34,38,42,46,51,56,60,65,69,73,76,81,89,93,103].map(f=>(f-1)/30);
function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function random(seed){let h=seed>>>0;return ()=>{h=(h+0x6d2b79f5)>>>0;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function contacts(id,seq,cycle,duration){
 const r=random(hash(`${id}:${seq}:${cycle}`));
 return CONTACTS.map((time,index)=>{
  const jitter=(r()-.5)*.08,soft=r()<.12,gain=.62+r()*.3,rate=.93+r()*.14;
  return {time:Math.max(.001,Math.min(duration-.001,time+jitter)),index,gain:soft?gain*.4:gain,rate};
 });
}
export function typingStrikes(sound,previous,current,state){
 const a=previous.actions.type,b=current.actions.type;
 if(!previous.typing||!current.typing||!a||!b||a.weight<=.3||b.weight<=.55||!(b.duration>0))return;
 const wrap=b.time<a.time;
 if(wrap&&!(a.time>b.duration*.7&&b.time<b.duration*.3))return;
 const cycle=state.cycle||0;
 const play=(n,c)=>sound.shot(`${current.id}:type:${c}:${n.index}`,'typekey',{gain:n.gain,rate:n.rate});
 for(const n of contacts(current.id,current.seq,cycle,b.duration))
  if(n.time>a.time&&n.time<=(wrap?b.duration:b.time))play(n,cycle);
 if(wrap){state.cycle=cycle+1;for(const n of contacts(current.id,current.seq,state.cycle,b.duration))if(n.time<=b.time)play(n,state.cycle);}
}
