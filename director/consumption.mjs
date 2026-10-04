// One physical dose per command. Existing per-minute effects are distributed over
// witnessed sip contact, using the unchanged authored cycle duration.
export const CONSUMPTION={heroine_coffee:{kind:'coffee',duration:5.066666603088379,sipMs:1150},whisky:{kind:'whisky',duration:18.833333333333332,sipMs:44/30*1000}};
export const usesConsumption=(id,activity)=>id==='heroine'&&Object.hasOwn(CONSUMPTION,activity);
export function consumptionReady(id,activity,place,caps,now){
 if(!usesConsumption(id,activity))return true;
 const a=caps?.actors?.[id];return !!a?.loaded&&Number.isFinite(caps.at)&&caps.at<=now&&now-caps.at<3500&&a.consumptionAvailable?.includes(activity)&&(activity==='whisky'?place==='bar':/^(desk[ABC]|bench[NMS]|diningChair)$/.test(place));
}
export function acceptConsumption(p,a,at,now,needs={},fatigueRate=0){
 const spec=CONSUMPTION[p.activity],s=a?.consumption;
 if(!spec||!Number.isFinite(at)||at>now||now-at>=3500||!a?.loaded||a.seq!==p.seq||a.activity!==p.activity||!s||s.seq!==p.seq||s.kind!==spec.kind||!Number.isInteger(s.observation)||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0||s.elapsedMs>2000)return 0;
 let c=p.consumption;
 if(!c||c.seq!==p.seq){c=p.consumption={seq:p.seq,kind:spec.kind,observation:s.observation,at,consumedMs:0};return 0;}
 if(c.at===null){c.observation=s.observation;c.at=at;return 0;}
 if(s.observation<=c.observation||at<=c.at)return 0;
 const gap=at-c.at;c.observation=s.observation;c.at=at;
 if(gap>3500)return 0;
 const ms=Math.max(0,Math.min(s.elapsedMs,gap,spec.sipMs-c.consumedMs));c.consumedMs+=ms;
 const minuteFraction=ms/spec.sipMs*spec.duration/60;
 for(const [k,rate]of Object.entries(needs))if(Number.isFinite(rate))p.needs[k]=Math.max(0,Math.min(100,(p.needs[k]||0)+rate*minuteFraction));
 p.fatigue=Math.max(0,Math.min(100,p.fatigue+fatigueRate*minuteFraction));return ms;
}

// A stopped observation interval must establish a new baseline before crediting contact.
export function resetConsumption(st){for(const p of Object.values(st.chars))if(p.consumption){p.consumption.at=null;p.consumption.observation=-1;}}
