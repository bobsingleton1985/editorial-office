import test from 'node:test';
import assert from 'node:assert/strict';
import {musicAt,vinylSamples,createMusicPlayer,MUSIC_PROFILE} from '../src/music.mjs';
import {MUSIC_TRACKS} from '../src/music-tracks.mjs';
import {createSound} from '../src/sound.js';

const tracks=[{id:'a',title:'A',url:'a.mp3',duration:10},{id:'b',title:'B',url:'b.mp3',duration:20}];
class Param {value=0;}
class Node {gain=new Param();frequency=new Param();Q=new Param();delayTime=new Param();connections=[];connect(n){this.connections.push(n);}disconnect(){}start(){this.started=true;}stop(){this.stopped=true;}}
class Context {state='running';sampleRate=1000;nodes=[];add(){const n=new Node();this.nodes.push(n);return n;}createGain(){return this.add();}createBiquadFilter(){return this.add();}createDelay(){return this.add();}createMediaElementSource(){return this.add();}createBufferSource(){return this.add();}createBuffer(){return {copyToChannel(){}};}}
class Media {paused=true;readyState=0;currentTime=0;duration=10;listeners=new Map();loads=0;plays=0;addEventListener(k,f){this.listeners.set(k,f);}emit(k){this.listeners.get(k)?.();}load(){this.readyState=0;this.loads++;}pause(){this.paused=true;this.emit('pause');}play(){this.plays++;this.paused=false;return Promise.resolve();}}
function fixture(){const ctx=new Context(),media=new Media(),player=createMusicPlayer(ctx,ctx.add(),{tracks,createElement:()=>media,clock:()=>4000});return {ctx,media,player};}
test('broadcast boundaries, wrapping and late viewers choose the same record',()=>{
 assert.equal(musicAt(9999,tracks).track.id,'a');assert.equal(musicAt(10000,tracks).track.id,'b');assert.equal(musicAt(30000,tracks).track.id,'a');
 assert.deepEqual(musicAt(33000,tracks),musicAt(3000,tracks));assert.equal(musicAt(NaN,tracks),null);assert.equal(musicAt(0,[]),null);
});
test('catalog contains the agreed 50 distinct licensed records with real durations',()=>{
 assert.equal(MUSIC_TRACKS.length,50);assert.equal(new Set(MUSIC_TRACKS.map(t=>t.id)).size,50);
 assert(MUSIC_TRACKS.every(t=>t.duration>=120&&t.url===`assets/jazz-v01/${t.id}.mp3?v=loudness-20261005-v01`&&t.source.startsWith('https://incompetech.com/')));
});
test('vinyl is subtle and deterministic with distinct irregular surfaces',()=>{
 const a=vinylSamples(44100,8,42),b=vinylSamples(44100,8,43);
 assert.deepEqual(a,vinylSamples(44100,8,42));assert.notDeepEqual(a,b);
 const rms=Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);assert(rms<.001);assert(Math.max(...a.slice(0,10000))<=MUSIC_PROFILE.clickPeak+MUSIC_PROFILE.hissPeak);
});
test('no loading or vinyl until enabled; all records use the same graph and pause stops it',async()=>{
 const {ctx,media,player}=fixture();player.update({enabled:false,now:0});assert.equal(media.loads,0);
 player.update({enabled:true,now:3000});assert.equal(media.src,'a.mp3');media.readyState=4;media.emit('loadedmetadata');await Promise.resolve();
 assert.equal(media.currentTime,3);assert(player.inspect().vinyl);assert(player.inspect().playing);
 const filters=ctx.nodes.filter(n=>n.type);assert.deepEqual(filters.map(n=>[n.type,n.frequency.value]),[['highpass',65],['lowpass',3400]]);
 player.update({enabled:true,now:11000});assert.equal(media.src,'b.mp3');assert(!player.inspect().vinyl);
 media.duration=20;media.readyState=4;media.emit('loadedmetadata');await Promise.resolve();assert.equal(media.currentTime,1);assert(player.inspect().vinyl);
 player.update({enabled:false,now:12000});assert(media.paused);assert(!player.inspect().vinyl);assert(!player.inspect().playing);
});
test('buffering, failed media and suspended contexts never play surface noise alone',async()=>{
 const {ctx,media,player}=fixture();player.update({enabled:true,now:0});media.readyState=4;media.emit('loadedmetadata');await Promise.resolve();
 assert(player.inspect().vinyl);media.emit('waiting');assert(!player.inspect().vinyl);
 media.emit('error');assert(media.paused);assert(!player.inspect().vinyl);assert.equal(player.inspect().error,'music-load-error');
 ctx.state='suspended';player.update({enabled:true,now:2000});assert(!player.inspect().playing);
});
test('a pending play cannot resurrect music after mute or silence',async()=>{
 const {media,player}=fixture();let resolve;media.play=()=>new Promise(r=>resolve=()=>{media.paused=false;r();});
 player.update({enabled:true,now:0});media.readyState=4;media.emit('loadedmetadata');player.stop();resolve();await Promise.resolve();
 // Native play() can settle after pause; the playing event still enforces the gate.
 media.emit('playing');assert(!player.inspect().vinyl);assert(!player.inspect().playing);
});
test('real viewer sound engine gates jazz and vinyl on a fresh live presentation',async()=>{
 const keys=['Audio','__tv','__simulationMode','__simulationStatus'];const saved=keys.map(k=>[k,Object.hasOwn(globalThis,k),globalThis[k]]);
 let media;
 class SoundContext extends Context {destination={};currentTime=0;async resume(){}async decodeAudioData(){return {duration:20};}}
 try {
  globalThis.Audio=class extends Media {constructor(){super();media=this;}};
  globalThis.__tv=()=>({ch:'jazz',now:5000});globalThis.__simulationMode='viewer';globalThis.__simulationStatus='stale';
  const sound=createSound({AudioContextClass:SoundContext,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),storage:{getItem:()=> '1'}});
  await sound.ready();sound.beginFrame();sound.endFrame();assert.equal(media.loads,0);
  globalThis.__simulationStatus='live';sound.beginFrame();sound.endFrame();assert.equal(media.loads,1);
  media.duration=174;media.readyState=4;media.emit('loadedmetadata');await Promise.resolve();assert(sound.inspect().music.vinyl);
  globalThis.__simulationStatus='stale';sound.beginFrame();sound.endFrame();assert(!sound.inspect().music.vinyl);assert(media.paused);
  globalThis.__simulationStatus='live';sound.beginFrame();sound.endFrame();await Promise.resolve();assert(sound.inspect().music.playing);
  sound.beginFrame(false);assert(!sound.inspect().music.vinyl);assert(!sound.inspect().music.playing);
  sound.set(false);sound.beginFrame();sound.endFrame();assert(!sound.inspect().music.playing);
 } finally {for(const [key,exists,value] of saved){if(exists)globalThis[key]=value;else delete globalThis[key];}}
});
