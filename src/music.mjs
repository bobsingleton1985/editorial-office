import {MUSIC_TRACKS} from './music-tracks.mjs';

export const MUSIC_PROFILE = Object.freeze({highpassHz:65, lowpassHz:3400, reflectionSec:.035, reflectionGain:.055, hissPeak:.00045, clickPeak:.018});

// A shared broadcast clock: late viewers join the same record and position.
export function musicAt(nowMs, tracks=MUSIC_TRACKS) {
  const total=tracks.reduce((n,t)=>n+t.duration,0);
  if(!Number.isFinite(nowMs)||!(total>0))return null;
  let offset=((nowMs/1000)%total+total)%total;
  for(const track of tracks){if(offset<track.duration)return {track,offset};offset-=track.duration;}
  return {track:tracks[0],offset:0};
}

function random(seed){let n=seed>>>0;return ()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};}
export function vinylSamples(sampleRate, seconds, seed) {
  const rng=random(seed),samples=new Float32Array(Math.ceil(sampleRate*seconds));
  for(let i=0;i<samples.length;i++)samples[i]=(rng()*2-1)*MUSIC_PROFILE.hissPeak;
  let at=.2+rng();
  while(at<seconds){
    const start=Math.floor(at*sampleRate),length=Math.ceil((.001+rng()*.003)*sampleRate),gain=(.15+rng()*.85)*MUSIC_PROFILE.clickPeak;
    for(let i=0;i<length&&start+i<samples.length;i++)samples[start+i]+=(rng()*2-1)*gain*Math.exp(-6*i/length);
    at+=.15+rng()*1.7;
  }
  return samples;
}

export function createMusicPlayer(ctx,output,{tracks=MUSIC_TRACKS,createElement=()=>new Audio(),clock=()=>Date.now()}={}) {
  const element=createElement();element.preload='metadata';element.loop=false;
  const input=ctx.createGain();input.channelCount=1;input.channelCountMode='explicit';
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=MUSIC_PROFILE.highpassHz;hp.Q.value=Math.SQRT1_2;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=MUSIC_PROFILE.lowpassHz;lp.Q.value=Math.SQRT1_2;
  const gate=ctx.createGain();gate.gain.value=0;
  const delay=ctx.createDelay(.1);delay.delayTime.value=MUSIC_PROFILE.reflectionSec;
  const wet=ctx.createGain();wet.gain.value=MUSIC_PROFILE.reflectionGain;
  input.connect(hp);hp.connect(lp);lp.connect(gate);gate.connect(output);lp.connect(delay);delay.connect(wet);wet.connect(gate);
  const source=ctx.createMediaElementSource(element);source.connect(input);
  let desired=null,selected=null,noise=null,pending=false,lastAttempt=-Infinity,error=null,revision=0;
  function stopNoise(){if(noise){try{noise.stop();}catch{}noise.disconnect();noise=null;}}
  function mute(){gate.gain.value=0;element.pause();stopNoise();}
  function startNoise(){
    if(noise||!desired||element.paused||element.readyState<3)return;
    let seed=0;for(const c of selected.id)seed=(seed*31+c.charCodeAt(0))>>>0;
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*47),ctx.sampleRate);
    buffer.copyToChannel(vinylSamples(ctx.sampleRate,47,seed),0);
    noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;noise.connect(input);noise.start(0,desired.offset%47);
  }
  function audible(){if(desired&&selected?.id===desired.track.id&&ctx.state==='running'&&!element.paused&&element.readyState>=3){gate.gain.value=1;startNoise();}else {gate.gain.value=0;stopNoise();}}
  function play(){
    if(!desired||!selected||selected.id!==desired.track.id||ctx.state!=='running'||pending||clock()-lastAttempt<3000)return;
    lastAttempt=clock();pending=true;const attempt=revision;
    try{Promise.resolve(element.play()).then(()=>{if(attempt!==revision)return;pending=false;if(!desired||selected?.id!==desired.track.id)mute();else {error=null;audible();}},e=>{if(attempt!==revision)return;pending=false;error=String(e?.message||e);mute();});}
    catch(e){pending=false;error=String(e.message||e);mute();}
  }
  const align=()=>{if(desired&&selected?.id===desired.track.id&&element.readyState>=1){try{element.currentTime=Math.min(desired.offset,Math.max(0,element.duration-.05));}catch{}}};
  element.addEventListener('loadedmetadata',()=>{align();play();});
  element.addEventListener('playing',audible);
  element.addEventListener('waiting',()=>{gate.gain.value=0;stopNoise();});
  element.addEventListener('pause',()=>{gate.gain.value=0;stopNoise();});
  element.addEventListener('ended',()=>{gate.gain.value=0;stopNoise();});
  element.addEventListener('error',()=>{error='music-load-error';mute();});
  return {
    update({enabled,now=clock()}){
      const next=enabled&&ctx.state==='running'?musicAt(now,tracks):null;
      if(!next){if(desired){revision++;pending=false;lastAttempt=-Infinity;}desired=null;mute();return;}
      desired=next;
      if(selected?.id!==next.track.id){revision++;pending=false;mute();selected=next.track;lastAttempt=-Infinity;error=null;element.src=selected.url;element.load();}
      if(element.readyState>=1&&(element.paused||Math.abs(element.currentTime-next.offset)>2))align();
      if(element.paused)play();else audible();
    },
    stop(){revision++;pending=false;lastAttempt=-Infinity;desired=null;mute();},
    inspect:()=>({track:selected?.title||null,id:selected?.id||null,playing:!!desired&&!element.paused&&element.readyState>=3,vinyl:!!noise,offset:element.currentTime||0,error,profile:MUSIC_PROFILE,count:tracks.length}),
  };
}
