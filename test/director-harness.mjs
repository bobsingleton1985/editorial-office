import * as television from '../director/tv-control.mjs';
import * as ownerDialogue from '../director/owner-dialogue.mjs';
import * as requestsHealth from '../director/model-requests.mjs';
import * as service from '../director/drink-service.mjs';
import * as chronicle from '../director/chronicle-core.mjs';
import {ChronicleStore} from '../director/chronicle-store.mjs';
import * as flirt from '../director/flirt-need.mjs';
import * as transport from '../director/world-transport.mjs';
import * as diagnostic from '../director/decision-trace.mjs';
import * as projection from '../director/relationship-context.mjs';
import {compactSnapshot} from '../director/compact-snapshot.mjs';
import * as development from '../director/relationship-development.mjs';
import * as livelihood from '../director/livelihood.mjs';
import * as consumption from '../director/consumption.mjs';
import * as performance from '../director/paid-performance.mjs';
import {HER_SOCIAL_CATALOG} from '../director/heroine-social-catalog.mjs';
import * as meals from '../director/meal-repertoire.mjs';
import * as economy from '../director/economy.mjs';
import * as work from '../director/work-witness.mjs';
import * as sleep from '../director/sleep-core.mjs';
import * as places from '../director/conversation-places.mjs';
import fs from 'node:fs';
import {dirname} from 'node:path';
import vm from 'node:vm';
import * as heroine from '../director/heroine-profile.mjs';
import {PROGRAM as TV_PROGRAM,onAir} from '../src/tv-schedule.js';
import {processBonusQueue} from '../director/owner-bonuses.mjs';
import {parseOwnerCall} from '../director/owner-calls.mjs';
import * as social from '../director/social-core.mjs';
import * as relationship from '../director/relationship-core.mjs';
import * as policy from '../director/conversation-policy.mjs';
import { DESKS, DINING_CHAIR, BENCH, SPOTS, CHAIR_REST, CHAIR_TUCKED } from '../director/layout-v79.mjs';
const registry=fs.readFileSync(new URL('../registry/chains-v01.json',import.meta.url),'utf8');
const repertoire=fs.readFileSync(new URL('../director/social-repertoire.json',import.meta.url),'utf8');
export function harness(source, initialState=null, config= economy.UNCONFIGURED_ECONOMY, speed=1,clockStart=Date.now()) {
  const original=fs.readFileSync(source,'utf8');const src=source;
  let clock = clockStart, answer = { action: 'lunch@benchS', confidence: 0.8 };
  const logs = [], requests = [], writes = [], calls=new Map(), archived=[],timers=[];let handler=null,archiveFailure=false;
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ DESKS, DINING_CHAIR, BENCH, SPOTS, CHAIR_REST, CHAIR_TUCKED,
    ...television,...ownerDialogue,dirname,TextEncoder,TV_PROGRAM,onAir,processBonusQueue,parseOwnerCall,compactSnapshot,...requestsHealth,...service,...chronicle,ChronicleStore,...flirt,...transport,...diagnostic,...projection,...development,...livelihood,...consumption,...performance,HER_SOCIAL_CATALOG,...meals,...economy,...work,...social,...relationship,...policy,...places,...heroine,...sleep, Date: TestDate, URL, Math: Object.assign(Object.create(Math), { random: () => 0 }),
    setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},
    process: { env: { HOME: '/isolated', FAST:String(speed), REGISTRY_FILE: '/registry.json', STATE_FILE: '/state.json', DIRECTOR_TOKEN: 'test-only', RELAY_URL: 'http://test-relay', JEV_URL: 'http://test-jev' } },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    fs: { readFileSync: (p) => { if(calls.has(String(p)))return calls.get(String(p)); if(String(p).endsWith('/economy-config.json'))return JSON.stringify(config);if(p==='/state.json'&&initialState)return JSON.stringify(initialState);if (p === '/registry.json') return registry;if(String(p).endsWith('/social-repertoire.json'))return repertoire; throw Error('isolated read refused'); },
      statSync: () => ({ mtimeMs: 1 }), writeFileSync: (p, s) => writes.push({ path: p, data: JSON.parse(s) }), openSync:()=>1,closeSync:()=>{},fsyncSync:()=>{},mkdirSync:()=>{}, existsSync:p=>calls.has(String(p)),renameSync: (a,b) => {if(calls.has(String(a))){if(archiveFailure)throw Error('isolated archive failure');archived.push(String(b));calls.delete(String(a));}}, readdirSync: p => [...calls.keys()].filter(k=>k.startsWith(String(p))).map(k=>k.slice(String(p).length)) },
    fetch: async (url, opts = {}) => {
      const body = opts.body ? JSON.parse(opts.body) : null; requests.push({ url, body });
      let result;
      if(handler){const value=await handler(url,body);if(value!==undefined)return {ok:true,json:async()=>structuredClone(value)};}
      if (url.endsWith('/api/character-rules')) result = { version: 'test', text: 'ISOLATED TEST RULES' };
      else if (url.endsWith('/api/behavior-session')) result = { session_id: 'test-session', state: body.action === 'pause' ? 'paused' : 'active' };
      else if (url.endsWith('/api/behavior-decide')) { if (answer instanceof Error) throw answer; const selected=body.snapshot.available_actions.find(a=>(a.semantic_id||a.id)===answer.action); result = {...answer,action:selected?.id||answer.action}; }
      else if (url.endsWith('/director/status')) result = { viewers: 1, seq: 1, nudge: 0, boot: 'test' };
      else if(url.includes('/director/execution'))result={capabilities:JSON.parse(vm.runInContext('JSON.stringify(executionCapabilities ? {...executionCapabilities,at:Date.now()} : null)',context)),items:[]};
      else if (url.endsWith('/health')) result = { weather: { utc: 0, name: 'test' } };
      else if(url.endsWith('/director/dialogue'))result={items:[]};
      else if(url.endsWith('/director/dialogue/ack'))result={ok:true};
      else if (url.endsWith('/director/world')) result = { ok: true };
      else throw Error('unexpected isolated request: ' + url);
      return { ok: true, json: async () => structuredClone(result) };
    }, structuredClone });
  const executable = original.replace(/^import .*;$/gm, '').replaceAll('import.meta.url', JSON.stringify('file:///isolated/director/director.mjs')).split('if (!TOKEN) {')[0];
  vm.runInContext(executable, context, { filename: src });
  const run = (s) => vm.runInContext(s, context);
  if(!initialState)run("st.nextCall = st.nextTask = 1e9; st.lastWire = Date.now(); st.tasks = []; st.taskSeq = 1; for (const p of Object.values(st.chars)) { p.busyUntil = Date.now() + 180000; p.needs = Object.fromEntries(Object.keys(p.needs).map(k => [k, 0])); } cityUtc = 0;");
  return { run, advance: (ms) => { clock += ms; }, setAnswer: (x) => { answer = x; }, logs, requests, writes,
    timers,runNextTimer:async()=>{const t=timers.shift();if(t)await t.fn();},
    queueCall:(name,value)=>calls.set('/isolated/calls/'+name,JSON.stringify(value)),calls,archived,failArchive:value=>{archiveFailure=value;},setHandler:(fn)=>{handler=fn;},state: () => JSON.parse(run('JSON.stringify(st)')), now: () => clock };
}
