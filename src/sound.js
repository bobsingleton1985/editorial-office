// One listener mix. Independent volume buses share the neighboring-room filters.
import {AUDIO_ASSETS} from './audio-assets.mjs';
import {createMusicPlayer} from './music.mjs';
const KEY='editorial.sound';
const VOLUME_KEY='editorial.sound.volumes.v1';
const BUS_GAINS={background:.15,voices:1.5,effects:1.5,music:.25};
const channelFor=id=>id==='city'?'background':/^(editor|columnist|reporter|heroine)-/.test(id)?'voices':'effects';
export function createSound({AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext,fetchAudio=globalThis.fetch?.bind(globalThis),storage=globalThis.localStorage}={}) {
 let on=false;try{on=storage?.getItem(KEY)==='1';}catch{}
 const volumes={background:1,voices:1,effects:1,music:1},buses={};
 try{const saved=JSON.parse(storage?.getItem(VOLUME_KEY)||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const channel of Object.keys(volumes)){const value=saved[channel];if(typeof value==='number'&&Number.isFinite(value))volumes[channel]=Math.max(0,Math.min(1,value));}}catch{}
 let ctx,master,room,music,active=false;
 const failures=new Map(),buffers=new Map(),loading=new Map(),playing=new Map(),wanted=new Map(),history=[],completed=new Set(),cursors=new Map();
 const record=(type,key,asset,details={})=>{history.push({type,key,asset,at:ctx?.currentTime||0,...details});if(history.length>128)history.shift();};
 function audio(){if(ctx||!AudioContextClass)return ctx;ctx=new AudioContextClass();master=ctx.createGain();master.gain.value=.7;master.connect(ctx.destination);room=ctx.createBiquadFilter();room.type='lowpass';room.frequency.value=1800;room.Q.value=Math.SQRT1_2;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1800;lp.Q.value=Math.SQRT1_2;room.connect(lp);lp.connect(master);for(const channel of Object.keys(volumes)){const bus=ctx.createGain();bus.gain.value=BUS_GAINS[channel]*volumes[channel];bus.connect(channel==='music'?master:room);buses[channel]=bus;}if(ctx.createMediaElementSource&&globalThis.Audio)music=createMusicPlayer(ctx,buses.music);return ctx;}
 async function load(id){if(buffers.has(id))return buffers.get(id);if(loading.has(id))return loading.get(id);const spec=AUDIO_ASSETS[id];if(!spec||(failures.get(id)||0)>Date.now())return null;const job=(async()=>{try{const r=await fetchAudio(spec.url);if(!r.ok)throw Error('HTTP '+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(id,b);return b;}catch(e){failures.set(id,Date.now()+30000);record('load-error',String(e.message),id);return null;}finally{loading.delete(id);}})();loading.set(id,job);return job;}
 function stop(key){const p=playing.get(key);if(!p)return;playing.delete(key);if(p.resume){cursors.set(key+'|'+p.asset,(p.offset+Math.max(0,ctx.currentTime-p.startedAt))%p.duration);if(cursors.size>64)cursors.delete(cursors.keys().next().value);}p.source.onended=null;try{p.source.stop();}catch{}p.source.disconnect();p.gain.disconnect();record('stop',key,p.asset);}
 function hush(){music?.stop();wanted.clear();for(const key of [...playing.keys()])stop(key);}
 function start(key,id,{loop=false,managed=false,resume=false,gain=1,offset=0}={}){if(!on||!active||ctx?.state!=='running')return;const buffer=buffers.get(id);if(!buffer){void load(id);return;}if(resume&&cursors.has(key+'|'+id))offset=cursors.get(key+'|'+id);if(managed&&!loop&&offset>=buffer.duration){completed.add(key);return;}offset=Math.max(0,offset)%buffer.duration;const source=ctx.createBufferSource(),g=ctx.createGain(),channel=channelFor(id);source.buffer=buffer;source.loop=loop;g.gain.value=gain;source.connect(g);g.connect(buses[channel]);const p={source,gain:g,asset:id,channel,loop,managed:managed||loop,resume,offset,startedAt:ctx.currentTime,duration:buffer.duration};playing.set(key,p);source.onended=()=>{if(playing.get(key)===p){playing.delete(key);if(managed&&!loop){completed.add(key);if(completed.size>128)completed.delete(completed.values().next().value);}source.disconnect();g.disconnect();}};source.start(0,offset);record('start',key,id,{offset});}
 async function unlock(){if(!on||!audio())return;try{await ctx.resume();}catch{}if(on){const ids=Object.keys(AUDIO_ASSETS);let i=0;await Promise.all(Array.from({length:3},async()=>{while(on&&i<ids.length)await load(ids[i++]);}));}}
 globalThis.addEventListener?.('pointerdown',()=>{if(on&&ctx?.state!=='running')void unlock();},{passive:true});
 globalThis.addEventListener?.('keydown',()=>{if(on&&ctx?.state!=='running')void unlock();});
 globalThis.addEventListener?.('pagehide',hush);
 globalThis.document?.addEventListener('visibilitychange',()=>{if(document.hidden){active=false;hush();}});
 const api={get on(){return on;},set(v){on=!!v;try{storage?.setItem(KEY,on?'1':'0');}catch{}if(on)void unlock();else hush();},
 get volumes(){return {...volumes};},
 setVolume(channel,value){if(!Object.hasOwn(volumes,channel)||typeof value!=='number'||!Number.isFinite(value))return false;volumes[channel]=Math.max(0,Math.min(1,value));try{storage?.setItem(VOLUME_KEY,JSON.stringify(volumes));}catch{}const param=buses[channel]?.gain;if(param){const target=BUS_GAINS[channel]*volumes[channel];if(param.setTargetAtTime)param.setTargetAtTime(target,ctx.currentTime,.015);else param.value=target;}return true;},
 beginFrame(v=true){active=!!v;if(!active){hush();return;}wanted.clear();if(on&&ctx?.state==='running')api.loop('city','city');},
 loop(key,id,options={}){if(!active||!on)return;wanted.set(key,id);const p=playing.get(key);if(p&&p.asset!==id)stop(key);if(!playing.has(key))start(key,id,{...options,loop:true});},
 clip(key,id,options={}){if(!active||!on)return;wanted.set(key,id);if(!playing.has(key)&&!completed.has(key))start(key,id,{...options,managed:true});},
 shot(key,id,options={}){if(!active||!on)return;stop(key);start(key,id,options);},
 endFrame(){const tv=globalThis.__tv?.();music?.update({enabled:on&&active&&volumes.music>0&&tv?.ch==='jazz'&&(globalThis.__simulationMode!=='viewer'||globalThis.__simulationStatus==='live'),now:tv?.now??Date.now()});for(const [key,p]of playing)if(p.managed&&wanted.get(key)!==p.asset)stop(key);},
 stop,hush,hushEvents(){for(const key of [...playing.keys()])if(key!=='city')stop(key);},stopActor(id){for(const key of [...playing.keys()])if(key.startsWith(id+':'))stop(key);},
 phone(k,t,onFor,cycle){const key='phone:'+k;if(t>=0&&t%cycle<onFor)api.loop(key,'phone');else stop(key);},
 inspect:()=>({on,active,music:music?.inspect()||null,state:ctx?.state||'not-started',volumes:{...volumes},loaded:buffers.size,playing:[...playing].map(([key,p])=>({key,asset:p.asset,channel:p.channel,loop:p.loop})),history:[...history]}),
 // Test dependency injection exercises the real graph and cancellation without a device.
 ready:unlock,
 };
 return api;
}
