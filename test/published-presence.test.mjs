import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the connection code actually shipped in app.js. A source-only test
// misses a stale bundle that silently removes the visible-viewer handshake.
function bundleConnection(app) {
  const at=app.indexOf('/events?runtime=office-tray-service-v1');
  assert(at>=0,'published runtime connection missing');
  const offset=Math.max(0,at-12000),prefix=app.slice(offset,at),matches=[...prefix.matchAll(/function ([\w$]+)\([^)]*\)\{/g)];
  const blocks=[];
  for(const match of matches){
    const start=offset+match.index,open=start+match[0].length-1;
    let depth=1,quote=null,end=open+1;
    for(;end<app.length&&depth;end++){
      const char=app[end];
      if(quote){if(char==='\\')end++;else if(char===quote)quote=null;continue;}
      if(char==='"'||char==="'"||char==='`')quote=char;
      else if(char==='{')depth++;else if(char==='}')depth--;
    }
    const code=app.slice(start,end);
    if(code.includes('/events?runtime=office-tray-service-v1')&&code.includes('/execution')&&code.includes('/presentation'))blocks.push({code,name:match[1]});
  }
  const selected=blocks.sort((a,b)=>a.code.length-b.code.length)[0];
  assert(selected,'published connection block missing');
  const factory=selected.code.match(/(?:let|const)\s+[\w$]+\s*=\s*([\w$]+)\(/)?.[1];
  assert(factory,'model-status factory missing');
  return {...selected,factory};
}
function fixture(code,name,factory){
  const streams=[],posts=[],docEvents={},windowEvents={},intervals=[];
  const document={visibilityState:'visible',addEventListener:(name,fn)=>{docEvents[name]=fn;}};
  class EventSource{
    constructor(url){this.url=url;this.events={};streams.push(this);}
    addEventListener(name,fn){this.events[name]=fn;}
    emit(name,data){this.events[name]?.({data:JSON.stringify(data)});}
    close(){this.closed=true;}
  }
  const window={__simulationMode:'viewer',addEventListener:(name,fn)=>{windowEvents[name]=fn;},dispatchEvent:event=>{windowEvents[event.type]?.(event);}};
  const context=vm.createContext({document,window,EventSource,CustomEvent,Date,JSON,
    fetch:async(url,options)=>{posts.push({url,options,body:JSON.parse(options.body)});return {ok:true};},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},setTimeout:fn=>fn(),
    [factory]:()=>({connection(){},update(){}})});
  vm.runInContext(code+`;this.connect=${name}`,context);
  context.connect('https://fixture.invalid',()=>{},()=>{});
  return {streams,posts,document,docEvents,windowEvents,intervals};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
const source=fs.readFileSync(new URL('../src/live.js',import.meta.url),'utf8')
  .replace(/^import .*;$/m,'').replace('export function connectLive','function connectLive');
const bundle=bundleConnection(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
for(const [label,code,name,factory] of [['source',source,'connectLive','createModelStatus'],['published bundle',bundle.code,bundle.name,bundle.factory]]){
  test(`${label}: stream lease enables visible heartbeat; hiding stops presence`,async()=>{
    const f=fixture(code,name,factory);
    assert.equal(f.posts.length,0);assert.equal(f.streams.length,1);
    f.streams[0].emit('presence-lease',{lease:'fixture-stream'});await settle();
    assert.equal(f.posts.length,1);assert.equal(f.posts[0].url,'https://fixture.invalid/presence');
    assert.deepEqual(f.posts[0].body,{lease:'fixture-stream',visible:true});
    assert.equal(f.posts[0].options.keepalive,true);
    const heartbeat=f.intervals.find(i=>i.ms===2000);assert(heartbeat,'heartbeat not scheduled');
    heartbeat.fn();await settle();assert.equal(f.posts.at(-1).body.visible,true);
    f.document.visibilityState='hidden';f.docEvents.visibilitychange();await settle();
    assert.equal(f.posts.at(-1).body.visible,false);
    heartbeat.fn();await settle();assert.equal(f.posts.at(-1).body.visible,false);
    f.document.visibilityState='visible';f.docEvents.visibilitychange();await settle();
    assert.equal(f.posts.at(-1).body.visible,true);
    f.windowEvents.pagehide();await settle();assert.equal(f.posts.at(-1).body.visible,false);
  });
  test(`${label}: reconnect uses the new stream lease`,async()=>{
    const f=fixture(code,name,factory);
    f.streams[0].emit('presence-lease',{lease:'fixture-old'});await settle();
    f.streams[0].readyState=2;f.streams[0].onerror();
    assert.equal(f.streams.length,2);
    f.streams[1].emit('presence-lease',{lease:'fixture-new'});await settle();
    assert.equal(f.posts.at(-1).body.lease,'fixture-new');
    assert.equal(f.posts.at(-1).body.visible,true);
  });
}
