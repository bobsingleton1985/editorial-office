import {OwnerDialogueInbox} from './owner-dialogue-inbox.mjs';
import {ChronicleStore} from './chronicle-store.mjs';
import {createSocialAdmission} from './social-admission.mjs';
// Editorial relay: keeps the current world of the shared newsroom and streams it to every viewer (Server-Sent Events).
// Only the director (the Mac) may change the world, with a secret token. Requires Playwright + Chromium.
// It also looks out of the window for everyone: real weather in the owner's chosen city (Open-Meteo, no key), every 10 min.
import http from 'node:http';
import { createExecutionFeedback } from './execution-feedback.mjs';
const execution=createExecutionFeedback();
import {createPresentationFeedback} from './presentation-feedback.mjs';
const presentation=createPresentationFeedback();
import {createViewerPresence} from './viewer-presence.mjs';
const viewerPresence=createViewerPresence();
import {createPoseHub} from './pose-hub.mjs';
import {startSimulationWorker} from './worker.mjs';
import {prepareRepresentation,staticResponse} from './static-delivery.mjs';
const poseHub=createPoseHub(), simExecutor={}, simViewers=new Set([simExecutor]);
execution.connect(simExecutor);
let simGeneration=0;
function scheduleSimulationRetry(){clearTimeout(simRetry);if(!simClosing)simRetry=setTimeout(ensureSimulation,5000);}
let simWorker=null,simStarting=false,simFailure=null,simClosing=false,simRetry=null;
const staticAssets=new Map();
async function ensureSimulation(){
  if(simStarting||simWorker||simClosing||!world)return;
  simStarting=true;const generation=++simGeneration;
  try{
    const {chromium}=await import(process.env.SIMULATION_PLAYWRIGHT_MODULE||'playwright');
    const local='http://127.0.0.1:'+server.address().port;
    const started=await startSimulationWorker({chromium,url:local+'/?q=lowest&relay='+local+'&charbase='+local+'/',getWorld:()=>world,
      onSnapshot:(s,t)=>poseHub.publish(s,t),
      onExecution:body=>execution.accept({...body,lease:simExecutor.executionLease},simViewers,world,Date.now()),
      onError:error=>{if(generation!==simGeneration||simClosing)return;simFailure=error;poseHub.reset();const old=simWorker;simWorker=null;old?.close().catch(()=>{});scheduleSimulationRetry();},
      launchOptions:{args:process.env.SIMULATION_SOFTWARE_RENDERER==='1'?['--use-angle=swiftshader']:[]}});
    if(simClosing||generation!==simGeneration||started.stats().failure){await started.close();if(!simClosing)throw Error(started.stats().failure||'Superseded worker');return;}
    simWorker=started;simFailure=null;
  }catch(e){simFailure=String(e);scheduleSimulationRetry();}
  finally{simStarting=false;}
}

const CLIENT_RUNTIME = 'office-tray-service-v1'; // Separate HER skeleton support; old clients must refresh.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +(process.env.PORT || 8790), HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.DIRECTOR_TOKEN || '';
const ORIGINS = (process.env.ALLOW_ORIGINS || '*').split(',').map((s) => s.trim());
const STATIC = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : '';   // optional: also serve the page / private assets
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css', '.bin': 'application/octet-stream', '.webm':'video/webm', '.mp4':'video/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
const MAX_VIEWERS = +(process.env.MAX_VIEWERS || 500), MAX_PER_IP = +(process.env.MAX_PER_IP || 12);
if (TOKEN.length < 24) { console.error('DIRECTOR_TOKEN (24+ chars) is required'); process.exit(1); }
const OWNER = (process.env.OWNER_TOKEN || '').length >= 24 ? process.env.OWNER_TOKEN : '';
const OPEN = process.env.SETTINGS_OPEN === '1';        // testing: any viewer may change the weather (for everyone); otherwise only the owner
const STATE = process.env.STATE_DIRECTORY || process.env.STATE_DIR || '';                     // systemd StateDirectory: remembers the choice
let chronicle=null;try{if(STATE)chronicle=new ChronicleStore(path.join(STATE,'chronicle','events.jsonl'));}catch(e){console.error('chronicle: archive unavailable');}
const ADMISSION_FILE=STATE?path.join(STATE,'social-admission-v90.json'):'';
let admissionSaved=[];
try {if(ADMISSION_FILE)admissionSaved=JSON.parse(fs.readFileSync(ADMISSION_FILE,'utf8'));}
catch(e){if(e.code!=='ENOENT')throw e;}
const admitSocialWorld=createSocialAdmission(admissionSaved);
let admissionSerialized=JSON.stringify(admissionSaved);
function admitWorld(w){
 const admitted=admitSocialWorld(w,Date.now()),serialized=JSON.stringify(admitSocialWorld.snapshot());
 if(ADMISSION_FILE&&serialized!==admissionSerialized){fs.writeFileSync(ADMISSION_FILE+'.tmp',serialized,{mode:0o600});fs.renameSync(ADMISSION_FILE+'.tmp',ADMISSION_FILE);}
 admissionSerialized=serialized;return admitted;
}


// ---------- weather outside the newsroom windows: real weather of a city, or a fixed look for testing
const CITIES = { nyc: { name: 'Нью-Йорк', lat: 40.71, lon: -74.01 }, msk: { name: 'Москва', lat: 55.75, lon: 37.62 } };
const LOOKS = { sun: 'солнце', cloudy: 'облачно', rain: 'дождь', snow: 'снег', night: 'ночь' };
const SETTINGS_FILE = STATE ? path.join(STATE, 'settings.json') : '';
let settings = { city: 'nyc', look: 'real', hostessMode:'dance', blinds: { down: 0.63, tilt: 0 } };
try { if (SETTINGS_FILE) settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch (e) { /* first start */ }
if (!CITIES[settings.city]) settings.city = 'nyc';
if (!LOOKS[settings.look]) settings.look = 'real';
const unit = (v, d) => (Number.isFinite(+v) ? Math.round(Math.min(1, Math.max(0, +v)) * 100) / 100 : d);
settings.blinds = { down: unit(settings.blinds?.down, 0.63), tilt: unit(settings.blinds?.tilt, 0) };
if(!['dance','drinks'].includes(settings.hostessMode))settings.hostessMode='dance';
const saveSettings = () => { if (SETTINGS_FILE) try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); } catch (e) { console.error('settings:', e.message); } };
const real = {};                                      // city → last real weather (asked at most every 10 min per city)
let weather = null;                                   // what everyone sees: {choice, city, name, day, sky, fall, ground, desc, temp, utc, manual}
function describe(code) {                             // WMO weather code → what the page shows, in words and in the window
  if (code >= 95) return ['гроза', 'rain'];
  if (code === 85 || code === 86) return ['снегопад', 'snow'];
  if (code >= 80) return ['ливень', 'rain'];
  if (code >= 71 && code <= 77) return ['снег', 'snow'];
  if (code >= 61 && code <= 67) return ['дождь', 'rain'];
  if (code >= 51 && code <= 57) return ['морось', 'rain'];
  if (code === 45 || code === 48) return ['туман', 'cloudy'];
  if (code === 3) return ['пасмурно', 'cloudy'];
  if (code === 2) return ['переменная облачность', 'sun'];
  return ['ясно', 'sun'];
}
async function ask(id, force) {
  const c = CITIES[id], old = real[id];
  if (!force && old && Date.now() - old.at < 9.5 * 60000) return old;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=weather_code,is_day,temperature_2m,snow_depth&timezone=auto`;
  const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json(), cur = j.current;
  const [desc, kind] = describe(cur.weather_code), day = cur.is_day === 1;
  return (real[id] = { city: id, name: c.name, day, sky: day ? kind : 'night', fall: kind === 'rain' || kind === 'snow' ? kind : null,
    ground: (cur.snow_depth || 0) >= 0.02 || kind === 'snow', desc, temp: Math.round(cur.temperature_2m), utc: j.utc_offset_seconds, at: Date.now() });
}
function compose() {                                  // real weather of the city, or the fixed look on top of it (clock stays the city's)
  const r = real[settings.city];
  if (settings.look === 'real') return r ? { ...r, choice: settings.city, manual: false } : null;
  const k = settings.look;
  return { ...(r || { city: settings.city, name: CITIES[settings.city].name, temp: null, utc: null }), choice: k, manual: true,
    day: k !== 'night', sky: k, fall: k === 'rain' || k === 'snow' ? k : null, ground: k === 'snow', desc: LOOKS[k] };
}
async function lookOutside(force) {
  try { await ask(settings.city, force); } catch (e) { console.error('weather:', e.message); }
  const w = compose(); if (w && JSON.stringify(w) !== JSON.stringify(weather)) { weather = w; broadcast('weather', weather); }
}
lookOutside(true); setInterval(() => lookOutside(true), 10 * 60000);

// ---------- journal: what the people did lately and who decided (Jev or the fallback rule); anyone may read it.
// One line per decision of a person: world.chars[id].seq is his own decision number (old worlds: world.editor, the columnist).
const JOURNAL_FILE = STATE ? path.join(STATE, 'journal.json') : '', JOURNAL_MAX = 600;
let journal = [];
try { if (JOURNAL_FILE) journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8')); } catch (e) { /* first start */ }
if (!Array.isArray(journal)) journal = [];
let journalDirty = false;
function remember(w) {
  const list = w.chars && typeof w.chars === 'object' ? Object.entries(w.chars) : [['columnist', { ...w.editor, seq: w.seq }]];
  for (const [id, e] of list) {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(id) || !e || typeof e.at !== 'number') continue;
    const seq = Number.isInteger(e.seq) ? e.seq : w.seq;
    if (journal.slice(-40).some((j) => (j.char || 'columnist') === id && j.seq === seq)) continue;   // the same decision re-sent
    journal.push({ seq, char: id, name: typeof e.name === 'string' ? e.name.slice(0, 40) : id, at: e.at, label: typeof e.label === 'string' ? e.label.slice(0, 160) : '', action: e.action || null, activity: e.activity || null,
      source: e.source || null, confidence: Number.isFinite(e.confidence) ? e.confidence : null, moved: !!e.cmd,
      ...(Number.isFinite(e.fatigue) ? { fatigue: Math.round(e.fatigue) } : {}) });
  }
  journal.sort((a, b) => a.at - b.at);
  if (journal.length > JOURNAL_MAX) journal = journal.slice(-JOURNAL_MAX);
  journalDirty = true;
}
setInterval(() => { if (!journalDirty || !JOURNAL_FILE) return; journalDirty = false;
  try { fs.writeFileSync(JOURNAL_FILE + '.tmp', JSON.stringify(journal)); fs.renameSync(JOURNAL_FILE + '.tmp', JOURNAL_FILE); } catch (e) { console.error('journal:', e.message); } }, 30000);
const lastChange = new Map();                         // ip → ms: one change per 2 s per viewer

let world = null;                                    // last world from the director: {seq, editor, chairs, ...}
let directorSeen = 0;                                // last time the director talked to us (ms)
const viewers = new Set(), perIp = new Map();

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
function cors(req, res) {
  const o = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (o && ORIGINS.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
}
function json(res, code, data) { const b = JSON.stringify(data); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }); res.end(b); }
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const worldMsg = () => ({ ...world, now: Date.now(), viewers: viewerPresence.count(), connectedViewers:viewers.size, director: Date.now() - directorSeen < 90000 });
function broadcast(event,data){poseHub.broadcast(event,data);}

function readBody(req, limit = 65536) {
  return new Promise((ok, fail) => { let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > limit) { fail(new Error('too_large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { fail(new Error('bad_json')); } }); req.on('error', fail); });
}
const MAX_WORLD_BYTES=1024*1024; // Authenticated world snapshots include all four actors and their context.
function validWorld(w) {
  return w && Number.isInteger(w.seq) && w.editor && typeof w.editor.at === 'number' && typeof w.editor.from === 'object'
    && (w.chars === undefined || (typeof w.chars === 'object' && Object.keys(w.chars).length <= 12)) && Buffer.byteLength(JSON.stringify(w)) <= MAX_WORLD_BYTES;
}

// ---------- needs nudges (owner 30.09): a viewer moves a scale of a person; the director picks the command up and the person decides again
const BOOT = Date.now();                               // the director tells a restarted relay by this
const ownerDialogueInbox=new OwnerDialogueInbox(STATE?path.join(STATE,'owner-dialogue-inbox.json'):null);
const nudges = []; let nudgeSeq = 0;
const PERSON_ID = /^[a-z][a-z0-9_-]{0,31}$/, NEED_ID = /^[a-z][a-z_]{1,23}$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  cors(req, res);
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600'); res.writeHead(204); return res.end(); }
  if(req.method==='GET'&&url.pathname==='/chronicle') {
    // Owner authorized public read access on 2026-10-04; writes stay director-authenticated.
    if(!chronicle)return json(res,503,{error:'chronicle_unavailable'});
    try{return json(res,200,chronicle.query({date:url.searchParams.get('date')||undefined,category:url.searchParams.get('category')||'all',actor:url.searchParams.get('actor')||'',partner:url.searchParams.get('partner')||'',before:url.searchParams.get('before'),limit:Number(url.searchParams.get('limit'))||100}));}
    catch(e){return json(res,400,{error:e.message});}
  }
  if (req.method === 'GET' && url.pathname === '/journal') {
    const n = Math.max(1, Math.min(JOURNAL_MAX, +(url.searchParams.get('n') || 100)));
    return json(res, 200, { now: Date.now(), entries: journal.slice(-n).reverse() });
  }
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, clientRuntime: CLIENT_RUNTIME, viewers: viewerPresence.count(), connectedViewers:viewers.size, world: !!world, simulation:{...poseHub.stats(),worker:simWorker?.stats(),starting:simStarting,error:simFailure}, director: Date.now() - directorSeen < 90000, weather });
  if (req.method === 'GET' && url.pathname === '/events') {
    // Before assigning an executor lease or sending any four-person world.
    if (url.searchParams.get('runtime') !== CLIENT_RUNTIME) return json(res, 426, {error:'refresh_required', runtime:CLIENT_RUNTIME});
    const ip = ipOf(req);
    if (viewers.size >= MAX_VIEWERS || (perIp.get(ip) || 0) >= MAX_PER_IP) return json(res, 503, { error: 'busy' });
    const v={res,ip};viewers.add(v);perIp.set(ip,(perIp.get(ip)||0)+1);
    const initial=[['presentation-lease',presentation.connect(v)],['presence-lease',viewerPresence.connect(v)]];if(world)initial.push(['world',worldMsg()]);else initial.push(['viewers',{now:Date.now(),viewers:viewerPresence.count(),connectedViewers:viewers.size}]);
    if(weather)initial.push(['weather',weather]);initial.push(['blinds',settings.blinds],['hostess',{mode:settings.hostessMode}]);
    poseHub.connect(req,res,initial);
    broadcast('viewers',{now:Date.now(),viewers:viewerPresence.count(),connectedViewers:viewers.size});
    res.on('close',()=>{viewers.delete(v);viewerPresence.disconnect(v);presentation.disconnect(v);const k=(perIp.get(ip)||1)-1;if(k)perIp.set(ip,k);else perIp.delete(ip);broadcast('viewers',{now:Date.now(),viewers:viewerPresence.count(),connectedViewers:viewers.size});});
    return;
  }
  if(req.method==='POST'&&url.pathname==='/presence'){let body;try{body=await readBody(req,1024);}catch(e){return json(res,400,{error:e.message});}const ok=viewerPresence.accept(body);return json(res,ok?200:409,{ok});}
  if(req.method==='POST'&&url.pathname==='/presentation'){let body;try{body=await readBody(req,8192);}catch(e){return json(res,400,{error:e.message});}const ok=presentation.accept(body,world,Date.now());return json(res,ok?200:409,{ok});}
  if(req.method==='POST'&&url.pathname==='/execution')return json(res,409,{error:'server_authoritative_execution'});
  if (url.pathname.startsWith('/director/')) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ') || !same(h.slice(7), TOKEN)) return json(res, 401, { error: 'unauthorized' });
    directorSeen = Date.now();
    if(req.method==='GET'&&url.pathname==='/director/chronicle'){if(!chronicle)return json(res,503,{error:'chronicle_unavailable'});try{return json(res,200,{...chronicle.query({date:url.searchParams.get('date')||undefined,category:url.searchParams.get('category')||'all',actor:url.searchParams.get('actor')||'',partner:url.searchParams.get('partner')||''}),ownerConfigured:Boolean(OWNER)});}catch{return json(res,400,{error:'invalid_chronicle_query'});}}
    if(req.method==='POST'&&url.pathname==='/director/chronicle') {
      try{if(!chronicle)throw Error('chronicle_unavailable');const b=await readBody(req,4*1024*1024);if(!Array.isArray(b.records)||b.records.length>50)throw Error('invalid_chronicle_batch');chronicle.append(b.records);return json(res,200,{acceptedIds:b.records.map(r=>r.id)});}
      catch(e){return json(res,e.message.startsWith('invalid_')||e.message.includes('secret_')||e.message.includes('too_large')?400:503,{error:'chronicle_write_failed'});}
    }
    if (req.method === 'GET' && url.pathname === '/director/status') return json(res, 200, { clientRuntime: CLIENT_RUNTIME, viewers: viewerPresence.count(), connectedViewers:viewers.size, seq: world?.seq ?? null, now: Date.now(), nudge: nudgeSeq, boot: BOOT, execution:true,hostessMode:settings.hostessMode });
    if(req.method==='GET'&&url.pathname==='/director/execution')return json(res,200,{now:Date.now(),capabilities:presentation.merge(execution.capabilities(Date.now()),world,Date.now()),items:execution.read(Math.max(0,Number(url.searchParams.get('since'))||0))});
    if(req.method==='GET'&&url.pathname==='/director/dialogue')return json(res,200,{items:ownerDialogueInbox.pending()});
    if(req.method==='POST'&&url.pathname==='/director/dialogue/ack'){
      try{const b=await readBody(req,512);ownerDialogueInbox.ack(b.id);return json(res,200,{ok:true});}catch{return json(res,503,{error:'dialogue_ack_failed'});}
    }
    if (req.method === 'GET' && url.pathname === '/director/nudges') {
      const since = Math.max(0, +(url.searchParams.get('since') || 0));
      return json(res, 200, { boot: BOOT, seq: nudgeSeq, now: Date.now(), items: nudges.filter((n) => n.seq > since) });
    }
    if (req.method === 'POST' && url.pathname === '/director/world') {
      let w; try { w = await readBody(req, MAX_WORLD_BYTES); } catch (e) { return json(res, 400, { error: e.message }); }
      if (!validWorld(w)) return json(res, 400, { error: 'invalid_world' });
      world = admitWorld(w); remember(w); broadcast('world', worldMsg());void ensureSimulation();
      return json(res, 200, { ok: true, viewers: viewerPresence.count(), connectedViewers:viewers.size, now: Date.now() });
    }
  }
  if (url.pathname === '/settings/weather') {
    const h = req.headers.authorization || '', owner = OWNER && h.startsWith('Bearer ') && same(h.slice(7), OWNER);
    if (req.method === 'POST') {
      if (!OPEN && !owner) return json(res, 403, { error: 'owner_only' });
      const ip = ipOf(req); if (Date.now() - (lastChange.get(ip) || 0) < 2000) return json(res, 429, { error: 'too_often' });
      lastChange.set(ip, Date.now()); if (lastChange.size > 5000) lastChange.clear();
      let b; try { b = await readBody(req, 1024); } catch (e) { return json(res, 400, { error: e.message }); }
      if (CITIES[b.choice]) { settings.city = b.choice; settings.look = 'real'; }
      else if (LOOKS[b.choice]) settings.look = b.choice;
      else return json(res, 400, { error: 'unknown_choice' });
      saveSettings();
      await lookOutside(false);
    }
    return json(res, 200, { open: OPEN, weather });
  }
  if(url.pathname==='/settings/hostess'){
    const h=req.headers.authorization||'',owner=OWNER&&h.startsWith('Bearer ')&&same(h.slice(7),OWNER);
    if(req.method==='POST'){
      if(!OPEN&&!owner)return json(res,403,{error:'owner_only'});
      const ip=ipOf(req)+'|h';if(Date.now()-(lastChange.get(ip)||0)<2000)return json(res,429,{error:'too_often'});
      let b;try{b=await readBody(req,512);}catch(e){return json(res,400,{error:e.message});}
      if(!['dance','drinks'].includes(b?.mode))return json(res,400,{error:'unknown_mode'});
      lastChange.set(ip,Date.now());if(lastChange.size>5000)lastChange.clear();
      const before=settings.hostessMode;settings.hostessMode=b.mode;
      try{if(SETTINGS_FILE){fs.writeFileSync(SETTINGS_FILE+'.tmp',JSON.stringify(settings));fs.renameSync(SETTINGS_FILE+'.tmp',SETTINGS_FILE);}}catch{settings.hostessMode=before;return json(res,500,{error:'settings_not_saved'});}
      broadcast('hostess',{mode:settings.hostessMode});
    }else if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});
    return json(res,200,{mode:settings.hostessMode,open:OPEN});
  }
  if(url.pathname==='/settings/dialogue'){
    if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});
    const h=req.headers.authorization||'',owner=OWNER&&h.startsWith('Bearer ')&&same(h.slice(7),OWNER);
    if(!owner)return json(res,403,{error:'owner_only'});
    const ip=ipOf(req)+'|dialogue';if(Date.now()-(lastChange.get(ip)||0)<1000)return json(res,429,{error:'too_often'});
    let b;try{b=await readBody(req,4096);}catch{return json(res,400,{error:'invalid_owner_dialogue'});}
    try{const receipt=ownerDialogueInbox.enqueue(b,Date.now());lastChange.set(ip,Date.now());return json(res,202,receipt);}
    catch(e){const code=['invalid_owner_dialogue','dialogue_id_conflict','dialogue_queue_full'].includes(e.message)?e.message:'dialogue_storage_unavailable';return json(res,code==='invalid_owner_dialogue'?400:code==='dialogue_id_conflict'?409:503,{error:code});}
  }
  if(url.pathname==='/settings/model-retry'){
    if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});
    const h=req.headers.authorization||'',owner=OWNER&&h.startsWith('Bearer ')&&same(h.slice(7),OWNER);
    if(!OPEN&&!owner)return json(res,403,{error:'owner_only'});
    const ip=ipOf(req)+'|model';if(Date.now()-(lastChange.get(ip)||0)<1000)return json(res,429,{error:'too_often'});
    let b;try{b=await readBody(req,512);}catch(e){return json(res,400,{error:e.message});}
    if(!b||typeof b.person!=='string'||!PERSON_ID.test(b.person)||!['physical','reflection','dialogue'].includes(b.requestKind)||typeof b.requestId!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(b.requestId))return json(res,400,{error:'bad_model_retry'});
    const current=world?.modelRequests?.current?.[b.person+':'+b.requestKind];
    if(!current||current.id!==b.requestId||current.status!=='error')return json(res,409,{error:'model_error_changed'});
    lastChange.set(ip,Date.now());if(lastChange.size>5000)lastChange.clear();
    const n={seq:++nudgeSeq,at:Date.now(),kind:'model_retry',person:b.person,requestKind:b.requestKind,requestId:b.requestId};nudges.push(n);if(nudges.length>50)nudges.shift();
    return json(res,202,{ok:true,status:'queued',seq:n.seq});
  }
  if (url.pathname === '/settings/needs') {            // a scale of a person: {person, need, value 0..100}; same access as the weather and the blinds
    const h = req.headers.authorization || '', owner = OWNER && h.startsWith('Bearer ') && same(h.slice(7), OWNER);
    if (req.method === 'POST') {
      if (!OPEN && !owner) return json(res, 403, { error: 'owner_only' });
      const ip = ipOf(req) + '|n'; if (Date.now() - (lastChange.get(ip) || 0) < 300) return json(res, 429, { error: 'too_often' });
      lastChange.set(ip, Date.now()); if (lastChange.size > 5000) lastChange.clear();
      let b; try { b = await readBody(req, 512); } catch (e) { return json(res, 400, { error: e.message }); }
      if (typeof b.person !== 'string' || !PERSON_ID.test(b.person) || typeof b.need !== 'string' || !NEED_ID.test(b.need) || typeof b.value !== 'number' || !Number.isFinite(b.value)) return json(res, 400, { error: 'bad_nudge' });
      const n = { seq: ++nudgeSeq, at: Date.now(), person: b.person, need: b.need, value: Math.round(Math.min(100, Math.max(0, b.value))) };
      nudges.push(n); if (nudges.length > 50) nudges.shift();
      return json(res, 200, { ok: true, seq: n.seq });
    }
    return json(res, 200, { open: OPEN });
  }
  if (url.pathname === '/settings/blinds') {           // the blinds on the west windows: how far down, how shut (same for everyone)
    const h = req.headers.authorization || '', owner = OWNER && h.startsWith('Bearer ') && same(h.slice(7), OWNER);
    if (req.method === 'POST') {
      if (!OPEN && !owner) return json(res, 403, { error: 'owner_only' });
      const ip = ipOf(req) + '|b'; if (Date.now() - (lastChange.get(ip) || 0) < 300) return json(res, 429, { error: 'too_often' });
      lastChange.set(ip, Date.now());
      let b; try { b = await readBody(req, 512); } catch (e) { return json(res, 400, { error: e.message }); }
      settings.blinds = { down: unit(b.down, settings.blinds.down), tilt: unit(b.tilt, settings.blinds.tilt) };
      saveSettings(); broadcast('blinds', settings.blinds);
    }
    return json(res, 200, settings.blinds);
  }
  if (STATIC && req.method === 'GET') {
    const rel = decodeURIComponent(url.pathname).replace(/\/$/, '/index.html');
    const file = path.resolve(STATIC, '.' + rel);
    if (file.startsWith(STATIC + path.sep) && TYPES[path.extname(file)] && fs.existsSync(file) && fs.statSync(file).isFile()) {
      if(!staticAssets.has(file)){const encoded={};for(const [e,suffix]of [['br','.br'],['gzip','.gz']])if(fs.existsSync(file+suffix))encoded[e]=fs.readFileSync(file+suffix);staticAssets.set(file,prepareRepresentation(fs.readFileSync(file),TYPES[path.extname(file)],encoded));}
      return staticResponse(req,res,staticAssets.get(file));
    }
  }
  json(res, 404, { error: 'not_found' });
});
setInterval(() => broadcast('viewers',{now:Date.now(),viewers:viewerPresence.count(),connectedViewers:viewers.size}),15000);   // keeps proxies from closing idle streams
server.headersTimeout = 10000; server.requestTimeout = 0;
server.listen(PORT, HOST, () => console.log('relay on http://'+HOST+':'+server.address().port));

// Preserve the latest public journal/settings during a supervised version switch.
process.on('SIGTERM',async()=>{simClosing=true;clearTimeout(simRetry);poseHub.close();await simWorker?.close();if(JOURNAL_FILE){fs.writeFileSync(JOURNAL_FILE+'.tmp',JSON.stringify(journal));fs.renameSync(JOURNAL_FILE+'.tmp',JOURNAL_FILE);}saveSettings();process.exit(0);});
