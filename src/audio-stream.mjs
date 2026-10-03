// Sample audio evidence at the same presentation time as the visible pose.
// Discrete phases change with applySimulation; continuous values interpolate only within one command/clip.
const lerp=(a,b,f)=>Number.isFinite(a)&&Number.isFinite(b)?a+(b-a)*f:a;
export function sampleAudioWitness(frame,id){
 const a=frame.a.meta.actors?.[id]?.sound,b=frame.b.meta.actors?.[id]?.sound;
 if(!a||frame.stale)return null;
 const f=frame.alpha,base=f>=1?b:a;if(!base)return null;
 const s=structuredClone(base);s.rendered=true;s.replaying=false;
 if(!b||a.seq!==b.seq||f>=1)return s;
 for(const k of ['time','x','z','palms','cupLift'])s[k]=lerp(a[k],b[k],f);
 for(const side of ['l','r'])s.feet[side]=lerp(a.feet[side],b.feet[side],f);
 if(a.chair&&b.chair&&a.chair.key===b.chair.key)s.chair.position=a.chair.position.map((v,i)=>lerp(v,b.chair.position[i],f));
 if(a.writing&&b.writing&&a.writing.down===b.writing.down)for(const k of ['x','z'])s.writing[k]=lerp(a.writing[k],b.writing[k],f);
 for(const [name,x]of Object.entries(a.actions)){
  const y=b.actions[name];if(!y)continue;
  const duration=x.duration,delta=y.time-x.time;
  if(delta<0&&!(duration>0&&x.time>duration*.7&&y.time<duration*.3))s.discontinuity=true;
  // Wrapping is only legitimate for the same clip. A large reverse seek primes the contact detector.
  s.actions[name].time=delta<0&&duration>0&&(x.time>duration*.7&&y.time<duration*.3)?(x.time+(y.time+duration-x.time)*f)%duration:lerp(x.time,y.time,f);
  s.actions[name].weight=lerp(x.weight,y.weight,f);
 }
 if(a.meal&&b.meal&&a.meal.index===b.meal.index&&a.meal.name===b.meal.name)s.meal.frame=lerp(a.meal.frame,b.meal.frame,f);
 if(a.speech&&b.speech&&a.speech.key===b.speech.key)s.speech.elapsed=lerp(a.speech.elapsed,b.speech.elapsed,f);
 if(a.vocal&&b.vocal&&a.vocal.key===b.vocal.key)s.vocal.elapsed=lerp(a.vocal.elapsed,b.vocal.elapsed,f);
 return s;
}
