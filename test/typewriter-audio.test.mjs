import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimationAudio} from '../src/audio-sync.mjs';
import {createSound} from '../src/sound.js';

function fixture(soundOverride){
 const calls=[],sound=soundOverride||{on:true,beginFrame(){},endFrame(){},shot:(...args)=>calls.push(args),stop:key=>calls.push(['stop',key]),loop(){},stopActor(){}};
 const sync=createAnimationAudio(sound);
 const state=(id,time,clip=.2,typing=true)=>({id,seq:1,time,rendered:true,replaying:false,typing,actions:{type:{time:clip,duration:3.5,weight:1}},chair:null,cupLift:null});
 const frame=(states,active=true)=>{sync.begin(active);for(const s of states)sync.update(s,1/30);sync.end();};
 return {calls,sync,state,frame,sound};
}
test('second and third machines never both sound, and owner survives reversed actor order',()=>{
 const f=fixture();f.frame([f.state('columnist',1),f.state('reporter',1)]);
 f.frame([f.state('columnist',1.033,.25),f.state('reporter',1.033,.25)]);
 assert.deepEqual(f.calls.map(c=>c[0]),['columnist:type']);
 f.frame([f.state('reporter',1.066,.81),f.state('columnist',1.066,.81)]);
 assert.deepEqual(f.calls.map(c=>c[0]),['columnist:type','columnist:type']);
});
test('handoff stops previous tail before the other machine starts; idle stops it',()=>{
 const f=fixture();f.frame([f.state('columnist',1),f.state('reporter',1)]);
 f.frame([f.state('columnist',1.033,.25),f.state('reporter',1.033,.25)]);f.calls.length=0;
 f.frame([f.state('columnist',1.066,.81,false),f.state('reporter',1.066,.81)]);
 assert.deepEqual(f.calls.map(c=>c.slice(0,2)),[['stop','columnist:type'],['reporter:type','typekey']]);
 f.calls.length=0;f.frame([f.state('reporter',1.099,.82,false)]);assert.deepEqual(f.calls,[['stop','reporter:type']]);
});
test('pause, reset, missing and unrendered witnesses release the audible machine',()=>{
 for(const end of ['pause','reset','missing','unrendered','replaying','discontinuity']){
  const f=fixture();f.frame([f.state('reporter',1)]);f.frame([f.state('reporter',1.033,.25)]);f.calls.length=0;
  if(end==='pause')f.frame([],false);else if(end==='reset')f.sync.reset();else if(end==='missing')f.frame([]);
  else f.frame([{...f.state('reporter',1.066,.81),...(end==='unrendered'?{rendered:false}:{[end]:true})}]);
  assert.deepEqual(f.calls,[['stop','reporter:type']],end);
 }
});
test('one machine preserves key contacts and wraps without catchup bursts',()=>{
 const f=fixture();f.frame([f.state('reporter',1)]);f.frame([f.state('reporter',1.033,.25)]);
 assert.equal(f.calls.length,1);f.frame([f.state('reporter',4,3.45)]);assert.equal(f.calls.length,1);
 f.frame([f.state('reporter',4.033,.25)]);assert.equal(f.calls.length,2);
});
class Node{gain={value:0};frequency={value:0};Q={value:0};connect(){}disconnect(){}start(){}stop(){}}
class Context{state='running';currentTime=0;destination={};createGain(){return new Node();}createBiquadFilter(){return new Node();}createBufferSource(){return new Node();}async resume(){}async decodeAudioData(){return {duration:.14};}}
test('real sound graph has one type source across three actors and a handoff',async()=>{
 const sound=createSound({AudioContextClass:Context,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),storage:{getItem:()=> '1'}});
 await sound.ready();const f=fixture(sound),ids=['newspaper_editor','columnist','reporter'];
 f.frame(ids.map(id=>f.state(id,1)));f.frame(ids.map(id=>f.state(id,1.033,.25)));
 assert.deepEqual(sound.inspect().playing.filter(p=>p.asset==='typekey').map(p=>p.key),['newspaper_editor:type']);
 f.frame(ids.map(id=>f.state(id,1.066,.81,id!=='newspaper_editor')));
 assert.deepEqual(sound.inspect().playing.filter(p=>p.asset==='typekey').map(p=>p.key),['columnist:type']);
 assert(sound.inspect().playing.some(p=>p.asset==='city'));f.frame([],false);assert.equal(sound.inspect().playing.length,0);
});
