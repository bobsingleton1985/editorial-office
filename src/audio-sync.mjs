// Receives rendered animation witnesses only. No director commands or wall-clock sound scheduling.
const TYPE_KEYS=[8,25,30,34,38,42,46,51,56,60,65,69,73,76,81,89,93,103].map(f=>(f-1)/30);
const voiceOf=id=>id==='newspaper_editor'||id==='editor'?'editor':id;
export function voiceMood(intent,style=''){
 if(intent==='confront')return 'argument';
 if(intent==='tense'||intent==='object')return 'displeasure';
 const s=(String(intent||'')+' '+style).toLowerCase();
 if(/surpris|shock|astonish/.test(s))return 'surprise';
 if(/displeas|disapprov/.test(s))return 'displeasure';
 if(/flirt|romanc|love|seduc/.test(s))return 'flirt';
 if(/argu|anger|angry|scold|quarrel|conflict/.test(s))return 'argument';
 if(/laugh|joy|happy|cheer|amuse|fist.pump/.test(s))return 'joy';
 return 'talk';
}
export function createAnimationAudio(sound){
 const previous=new Map();let enabled=false;
 function reset(){previous.clear();}
 function voice(s){const id=s.id;
  const speech=s.speech||s.vocal;
  if(speech&&speech.role==='speaker'&&speech.active&&!s.clapping){
   const actor=voiceOf(id);if(['editor','columnist','reporter','heroine'].includes(actor)){
    const mood=voiceMood(speech.intent,speech.style);if((mood==='surprise'&&speech.elapsed>2.5)||(mood==='displeasure'&&speech.elapsed>3))return;const key=id+':voice:'+speech.key+':'+mood;
    if(mood==='surprise'||mood==='displeasure')sound.clip(key,actor+'-'+mood,{offset:Math.max(0,speech.elapsed||0),gain:.9});
    else sound.loop(id+':voice:'+mood,actor+'-'+mood,{offset:(speech.index*7.137+id.length*1.319)%17,gain:.9,resume:true});
   }
  }
 }
 function update(s,dt){
  if(!s)return;const old=previous.get(s.id);previous.set(s.id,s);
  if(old&&old.seq!==s.seq)sound.stopActor?.(s.id);
  // Clip wraps, interpolation priming and phrase boundaries must not restart speech.
  if(enabled&&s.rendered&&!s.replaying&&old&&old.seq===s.seq)voice(s);
  if(!enabled||!s.rendered||s.replaying||s.discontinuity||old?.discontinuity||!old||old.seq!==s.seq||s.time<=old.time||s.time-old.time>.3||dt<=0||dt>.25)return;
  const id=s.id,shot=(tag,asset,gain=1)=>sound.shot(id+':'+tag,asset,{gain});
  const crossed=(name,t)=>{const a=s.actions[name],b=old.actions[name];return a&&b&&a.weight>.55&&b.weight>.3&&(a.time>=b.time?(b.time<t&&a.time>=t):(a.duration>0&&b.time>a.duration*.7&&a.time<a.duration*.3&&(t>b.time||t<=a.time)));};
  if(s.typing&&old.typing&&s.actions.type)for(const t of TYPE_KEYS)if(crossed('type',t))shot('type','typekey',.8);
  if(s.writing&&old.writing&&s.writing.down&&old.writing.down&&Math.hypot(s.writing.x-old.writing.x,s.writing.z-old.writing.z)>.00008)sound.loop(id+':pencil',id==='reporter'?'pencil2':'pencil1',{gain:.7});
  if(crossed('g_write_stop',20/30))shot('pencildown','pencildown');
  if(s.chair!==null&&old.chair!==null&&s.chair.key===old.chair.key&&Math.hypot(...s.chair.position.map((v,i)=>v-old.chair.position[i]))>.0002)sound.loop(id+':chair','chair',{gain:.5});
  // Local minima of actual rendered foot/palm trajectories, with rearm/refractory guards.
  const state=s.contactState=old.contactState||{};
  if(s.walking&&old.walking&&Math.hypot(s.x-old.x,s.z-old.z)>.0001){
   for(const foot of ['l','r']){const y=s.feet[foot],last=old.feet[foot],v=y-last,was=state[foot],floor=s.footFloor?.[foot];
    const armed=(was?.armed||false)||(Number.isFinite(floor)&&y>floor+.045);
    if(armed&&Number.isFinite(floor)&&Math.min(y,last)<floor+.03&&was?.v<-.00005&&v>=-.00001&&s.time-was.at>.2){shot('step-'+foot,foot==='l'?'step1':'step2',.7);state[foot]={v,at:s.time,armed:false};}else state[foot]={v,at:was?.at??-10,armed};
   }
  }else{delete state.l;delete state.r;}
  if(s.clapping&&old.clapping){const delta=s.palms-old.palms,was=state.clap,armed=!!was?.armed||s.palms>.22||old.palms>.22;
   if(armed&&was?.delta<0&&delta>=0&&old.palms<.14&&s.time-was.at>.18){shot('clap',s.clapVariant==='b'?'clap2':'clap1');state.clap={delta,at:s.time,armed:false};}else state.clap={delta,at:was?.at??-10,armed};
  }else delete state.clap;
  if(s.pouring&&old.pouring)sound.loop(id+':pour','pour',{gain:.7});
  if(s.brushing&&old.brushing)sound.loop(id+':cloth','cloth',{gain:.3});
  // A mug actually returns to the same rest pose, not simply a coffee command finishing.
  if(s.cupLift!==null&&old.cupLift!==null&&old.cupLift>.002&&s.cupLift<=.002)shot('cup','cup',.7);
  if(s.meal&&old.meal&&s.meal.index===old.meal.index&&s.meal.name===old.meal.name&&s.meal.weight>.55){
   const {name,frame}=s.meal,prior=old.meal.frame;
   const hit=(f)=>prior<f&&frame>=f;
   if(name==='soup_stir'||name==='stir')sound.loop(id+':stir','stir',{gain:.7});
   if(name==='soup_eat'&&hit(30))shot('soup','soup',.6);
   const bite={fr_1:85,fr_2:77,fl_1:75,fl_2:57}[name];if(bite&&hit(bite))shot('bite','bite',.6);
   if(name==='soup_stop'&&hit(21))shot('clink','clink',.6);
  }

 }
 return {begin(active){const next=!!active&&sound.on;if(next!==enabled)reset();enabled=next;if(!next)reset();sound.beginFrame(next);},update,end(){sound.endFrame();},reset};
}
