import {recoverInterruptedRequests,requestAllowed,requestStarted,requestFailed,requestSucceeded,retryModelRequest} from './model-requests.mjs';
import {ChronicleStore} from './chronicle-store.mjs';
import {extractChronicle,DanceObserver} from './chronicle-core.mjs';
import {projectWorld} from './world-transport.mjs';
import {trace,newTraceId,offeredKinds,mappedDecision} from './decision-trace.mjs';
import {fitRelationshipRequest} from './relationship-context.mjs';
import {FLIRT,flirtGrowth,advanceFlirtNeed,flirtContext,financialFlirtPressure} from './flirt-need.mjs';
import {nextReflection,reflectionActions,applyReflection,courtshipStatus,flirtPermitted} from './relationship-development.mjs';
import {livelihoodContext,explainEarningActions,isEarningStep} from './livelihood.mjs';
import {usesConsumption,consumptionReady,acceptConsumption,resetConsumption,CONSUMPTION} from './consumption.mjs';
import {clearDeliveredService,serviceCommandChanged,ensureServices,serviceActions,serviceContext,chooseService,observeServices,tickServices} from './drink-service.mjs';
import {advancePerformances,committedPerformance,performancePlaces,ensurePerformances,performanceActions,performanceContext,choosePerformance,startPerformance,observePerformances,tickPerformances,cancelPerformance} from './paid-performance.mjs';
import {expandMealActions,resolveMealAction} from './meal-repertoire.mjs';
import {HER_SOCIAL_CATALOG} from './heroine-social-catalog.mjs';
import {UNCONFIGURED_ECONOMY,ensureEconomy,available,price,canAfford,canReplacePurchase,reservePurchase,cancelPurchases,confirmPurchases,rewardWork,moneyContext,moneyActions,chooseMoney,tickEconomy} from './economy.mjs';
import {workInterval,resetWorkWitness} from './work-witness.mjs';
import {HEROINE_PROFILE,HEROINE_ACTIVITIES,heroineSupports} from './heroine-profile.mjs';
import {SLEEP,initializeSleep,requireSleep,awakeFatigueRate,awakeFatigue,startSleep,acceptSleepSample} from './sleep-core.mjs';
import {benchPassageTags,conversationPlaceProposals,revalidateConversationPlace,CONVERSATION_PLACES} from './conversation-places.mjs';
import {observeWorkCompleted,appraisalActions,chooseAppraisal,courtshipActions,chooseCourtship,expressionStyle,publicRelations,currentIntent,chooseIntent,chooseRelation,availableIntents,relationOptions,RELATION_TEXT,INTENT_TEXT} from './relationship-core.mjs';
import {styleAllowed,CONVERSATION_POLICY_VERSION} from './conversation-policy.mjs';
// Editorial director: runs on the Mac, decides what the people of the newsroom do next (Jev through the local pilot server),
// and sends the new world to the relay. Viewers only play it. Jev is asked only while someone is watching.
// Several people (29.09 evening): each has his own needs, his own decisions and his own line in the world (world.chars);
// the stories on the wire, the chairs and the Jev budget are shared. Nobody sits where another sits or goes.
//   RELAY_URL=https://… DIRECTOR_TOKEN=… node director.mjs
import fs from 'node:fs';
import { SOCIAL, initializeSocial, pairOf, beginConversation, publicConversation, finishConversation, applyParticipation, pauseParticipation, expireParticipation } from './social-core.mjs';
import { DESKS, DINING_CHAIR, BENCH, SPOTS, CHAIR_REST, CHAIR_TUCKED } from './layout-v79.mjs';

const HERE = new URL('..', import.meta.url).pathname;                 // editorial-live/: .director-token and relay-url.txt live here
const fromFile = (f) => { try { return fs.readFileSync(HERE + f, 'utf8').trim(); } catch { return ''; } };
const RELAY = (process.env.RELAY_URL || fromFile('relay-url.txt') || 'http://127.0.0.1:8790').replace(/\/$/, '');
const TOKEN = process.env.DIRECTOR_TOKEN || fromFile('.director-token');
const JEV = (process.env.JEV_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const STATE = process.env.STATE_FILE || new URL('./director-state.json', import.meta.url).pathname;
const DAILY = +(process.env.DAILY_LIMIT || 10000);          // Jev decisions per day at most (all people together); beyond that a simple rule decides
const FAST = +(process.env.FAST || 1);                     // test speed-up of dwell times (1 = real)
const CLIENT = 'editorial-director-01';
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// ---------- the people (emergence decisions 28.09, owner 29.09: the person called «editor» until now is the columnist).
// A new person = a new entry here + his body on the VPS (assets/…glb, skeleton «MOTUS | rig»). Activities are the same for everybody:
// whatever the registry has «в живой редакции» is open to each of them. grow: needs per minute of watched time; fatigue: × the activity's rate.
const PEOPLE = {
  heroine: HEROINE_PROFILE,
  columnist: { name: 'Колумнист', glb: 'assets/editor2A-web-v01.glb', chairBack: 0, home: 'deskA',
    role: 'колумнист газеты, звезда с именной колонкой',
    character: 'Выходец из бедного Бруклина, сам пробился. Остроумен, любит публику, кофе, пластинки и долгие разговоры. Хочет признания. Тщеславен, ревнив, работает рывками.',
    personality: { sociability: 0.8, initiative: 0.5, discipline: 0.4 }, grow: { nicotine: 1.0, coffee: 0.75, hunger: 0.5, drunk: -0.4, music: 0.5, dance: 0.2 }, fatigue: 1, start: { nicotine: 40, coffee: 30, hunger: 30, drunk: 0, music: 20, dance: 10 } },
  reporter: { name: 'Репортёр', glb: 'assets/reporter-web-v03.glb', chairBack: 0.05, home: 'deskB', mouth: [-4.1, -4.2, 0], phoneMouth: [-1.7, -20.7, 0],   // mouth: his mouth against the columnist's, head bone frame, cm (measured on the page)
    role: 'репортёр, около тридцати лет',
    character: 'Сын состоятельной семьи без денег: наследство ушло новой семье отца. Авантюрист и романтик, легко загорается, за столом быстро скучает, рутину бросает. Хочет большую рискованную историю и имя без отцовских денег. Сначала действует, потом думает.',
    personality: { sociability: 0.6, initiative: 0.9, discipline: 0.3 }, grow: { nicotine: 1.0, coffee: 0.75, hunger: 0.5, drunk: -0.4, music: 0.3, dance: 0.35 }, fatigue: 1, start: { nicotine: 25, coffee: 45, hunger: 45, drunk: 0, music: 15, dance: 15 } },
  newspaper_editor: { name: 'Редактор', glb: 'assets/newspaper-editor-web-v01.glb', chairBack: 0, home: 'deskC', walkPolicy: 'mixamo-only', mouth: [-0.45179545175233216, -5.564845877908131, 0.10690048579610341],
    role: 'редактор газеты',
    character: 'Сдержанный и дисциплинированный редактор. Ценит точность и доведение работы до конца. Общается спокойно и по существу.',
    personality: { sociability: 0.5, initiative: 0.5, discipline: 0.8 }, grow: { nicotine: 1.0, coffee: 0.75, hunger: 0.5, drunk: -0.4, music: 0.3, dance: 0.2 }, fatigue: 1, start: { nicotine: 25, coffee: 30, hunger: 30, drunk: 0, music: 15, dance: 10 } },
};
// Every actor keeps the same needs, independently of its connected animation bank.
// Individual growth/start values override these defaults; unsupported relief is explained.
const COMMON = { grow: { nicotine:1, coffee:.75, hunger:.5, drunk:-.4, music:.3, dance:.2, alcohol:0.3, social:SOCIAL.grow, flirt:FLIRT.grow }, start: { nicotine:25, coffee:30, hunger:30, drunk:0, music:15, dance:10, alcohol:15, social:SOCIAL.start, flirt:FLIRT.start } };
for (const p of Object.values(PEOPLE)) { p.grow = { ...COMMON.grow, ...p.grow }; p.start = { ...COMMON.start, ...p.start }; }
// growth multipliers from the city hour (owner 30.09): the wish for a drink grows faster after six in the evening
const EVENING = { alcohol: 2.5 }, EVENING_FROM = 18;
const IDS = Object.keys(PEOPLE).filter(id=>id!=='heroine').concat('heroine');
const supports = (id,verb) => id==='heroine' ? heroineSupports(verb) : !verb.startsWith('heroine_');

// ---------- places
const PLACES = {
  diningChair:{kind:'chair',chair:'D',x:DINING_CHAIR.x,z:DINING_CHAIR.z,name:DINING_CHAIR.label},
  deskA: { kind: 'desk', desk: 'A', x: DESKS.A.x, z: DESKS.A.z, name: 'письменный стол A (у окна, под вентилятором)' },
  deskB: { kind: 'desk', desk: 'B', x: DESKS.B.x, z: DESKS.B.z, name: 'письменный стол B (в центре)' },
  deskC: { kind: 'desk', desk: 'C', x: DESKS.C.x, z: DESKS.C.z, name: 'письменный стол C (у телетайпа)' },
  benchS: { kind: 'bench', x: BENCH.S.x, z: BENCH.S.z, name: 'скамья у круглого стола, южный край' },
  benchM: { kind: 'bench', x: BENCH.M.x, z: BENCH.M.z, name: 'скамья у круглого стола, середина' },
  benchN: { kind: 'bench', x: BENCH.N.x, z: BENCH.N.z, name: 'скамья у круглого стола, северный край' },
  window: { kind: 'spot', x: SPOTS.window.x, z: SPOTS.window.z, name: 'у окна' },
  teletype: { kind: 'spot', x: SPOTS.teletype.x, z: SPOTS.teletype.z, name: 'у телетайпа' },
  phoneA: { kind: 'spot', x: -3.0, z: -2.40, name: 'у телефона стола A' },     // the page's SPOTS.phoneA (the aisle beside desk A); only for calls
  trayTable: {kind:'spot',x:.45,z:2.1,name:'у столика с подносом'},
  bar: { kind: 'spot', x: 2.705, z: 4.650, name: 'у тумбы с баром и проигрывателем' },   // the page's SPOTS.bar: where the approved whisky recording begins (whisky alone, 30.09)
  window2: { kind: 'spot', x: -4.55, z: 1.6, name: 'у окна, рядом' },          // the page's SPOTS.window2: the second place at the window; only for smoking together (invitations)
  // the zone in front of the TV (the page's SPOTS.tv … tv5, «Джаз у телевизора», owner 30.09): five places, several people listen at once
  tv: { kind: 'spot', at: 'tv', x: 1.942, z: 2.669, name: 'перед телевизором' }, tv2: { kind: 'spot', at: 'tv', x: 0.577, z: 2.039, name: 'перед телевизором, слева' },
  tv3: { kind: 'spot', at: 'tv', x: 3.307, z: 3.299, name: 'перед телевизором, справа' }, tv4: { kind: 'spot', at: 'tv', x: 0.630, z: 3.719, name: 'перед телевизором, сзади слева' },
  tv5: { kind: 'spot', at: 'tv', x: 1.995, z: 4.349, name: 'перед телевизором, сзади справа' },
  tvKnob: { kind: 'spot', at: 'tv_knob', x: 2.075, z: 1.329, name: 'у телевизора' },   // the page's SPOTS.tvKnob: crouched at the channel knob
};
for(const [id,p]of Object.entries(SPOTS))if(!PLACES[id])PLACES[id]={kind:'spot',x:p.x,z:p.z,name:p.label||id};
const TV_IDS = ['tv', 'tv2', 'tv3', 'tv4', 'tv5'];
const target = (id) => (PLACES[id].kind === 'spot' ? { spot: id } : { seat: id });
const RATE = {sleep_desk:0,read_wire:-4, conversation: 0, work: 7, rest_desk: -6, rest_lounge: -12, wait: 0, invite: 0 };  // fatigue change per minute (core activities; the rest come from the registry)
const DWELL = { conversation: [40,75], work: [180, 360], rest_desk: [60, 120], rest_lounge: [120, 240], wait: [30, 60], read_wire:[30,60], phone: [20, 40], invite: [60, 60] };   // invite: until the answer moves him   // seconds after arriving (phone: the talk; owner 30.09: 1–2.5 min was too long)
// phone calls (owner 30.09): now and then the phone on desk A rings; the nearest one answers — seated if he sits at desk A, otherwise he
// walks to the phone (phoneA). The call is the director's, not Jev's; after it Jev decides again (no «continue» for a call).
// Next: the owner's Telegram messages ring it as well (startCall).
const CALL_EVERY = [20, 40];                                         // minutes of watched time between calls
const NEED_TXT = { flirt: 'интерес к флирту', social: 'потребность в общении', alcohol: 'желание выпить', nicotine: 'тяга к сигарете', coffee: 'желание выпить кофе', hunger: 'голод', drunk: 'опьянение', music: 'желание послушать музыку', dance: 'желание потанцевать' };
// the wish to dance (owner 30.09): a need of its own, apart from listening; drunkenness raises it (+1.5 a minute when fully drunk) and it is
// catching (+0.8 a minute while someone else dances). Dancing only while music plays (registry: when 'music'), at tv2, tv3, tv4 (the Charleston travels)
const DANCE_IDS = ['tv2', 'tv3', 'tv4'];
const danceBoost = (id, now) => ((st.chars[id]?.needs?.drunk ?? 0) / 100) * 1.5 + (Object.entries(st.chars).some(([k, p]) => k !== id && p.activity === 'dance' && activityRunning(k, now) && musicOn(now)) ? 0.8 : 0);
// music (owner 30.09): it plays when the TV grid has its music channel (tv-schedule.js: at night 01–06 in the city, otherwise one minute in
// eight) or when someone turned the knob (st.tvMusic: the TV plays music for everybody for TV_MUSIC_MIN). Registry: director.when =
// 'music' — offered only while music plays (he stops when it ends); 'quiet' — only while it does not; director.effect = 'tv_music' —
// turning the knob. The wish to dance is a separate need: it comes with the dance clips.
const TV_PROGRAM = ['anchor', 'weather', 'coffee', 'korea', 'jazz', 'suburb', 'stars', 'boxing'], TV_MUSIC_MIN = 10;
function musicOn(now) {
  if (st.tvMusic && now >= st.tvMusic.at && now < st.tvMusic.until) return true;
  const h = cityUtc === null ? new Date(now).getHours() : new Date(now + cityUtc * 1000).getUTCHours();
  if (h >= 1 && h < 6) return true;
  return TV_PROGRAM[Math.floor(now / 60000) % TV_PROGRAM.length] === 'jazz' && now % 60000 < 30000;   // the grid's music minute, while half of it is left
}
// drunk (owner 30.09): a glass of whisky adds about 25 (registry 'whisky'), he sobers by 0.4 a minute; from 80 the page gives him the drunk walk
const cleanNeeds = (n) => Object.fromEntries(Object.entries(n && typeof n === 'object' ? n : {}).filter(([k, r]) => /^[a-z][a-z_]{0,30}$/.test(k) && Number.isFinite(r)));

// ---------- activities from the animation registry: chains «в живой редакции» that carry a `director` block
// director: {verb, rate, dwell: [a, b], once, where: [{at, label, jev}]}; at = window | teletype | desk_here | desk_other | desk_any | bench
// {desk} and {place} in label/jev are filled in. A chain is «в живой редакции» only once the page can play it — for every person at once.
const REGISTRY = process.env.REGISTRY_FILE || (process.env.HOME + '/Editorial/Claude outputs/registry/chains-v01.json');
const CORE = new Set(['continue', 'work', 'work_variant', 'rest_desk', 'rest_lounge', 'wait']);
const DESK_IDS = ['deskA', 'deskB', 'deskC'], BENCH_IDS = ['benchS', 'benchM', 'benchN'];
const sleepTargets=id=>id==='heroine'?['diningChair']:DESK_IDS;
const waitingForSleepSeat=p=>['waiting_for_free_desk','waiting_for_free_chair'].includes(p.sleepPending?.reason);
const sleepPlaceText=place=>PLACES[place]?.kind==='chair'?'на стуле рядом с круглым столом':'за столом '+PLACES[place]?.desk;
const WHERE = {coffee_seat:()=>[...BENCH_IDS,...DESK_IDS,'diningChair'], window: () => ['window'], teletype: () => ['teletype'], bar: (here, taken) => (taken?.has('tv5') ? [] : ['bar']), desk_any: () => DESK_IDS, bench: () => BENCH_IDS,
  tv: (here, taken) => TV_IDS.filter((t) => !taken?.has(t) && !(t === 'tv5' && taken?.has('bar')))                     // the nearest free place in the zone (tv5 is next to the bar)
    .sort((a, b) => Math.hypot(PLACES[a].x - PLACES[here].x, PLACES[a].z - PLACES[here].z) - Math.hypot(PLACES[b].x - PLACES[here].x, PLACES[b].z - PLACES[here].z)).slice(0, 1),
  tv_knob: () => ['tvKnob'],
  tv_dance: (here, taken) => DANCE_IDS.filter((t) => !taken?.has(t))
    .sort((a, b) => Math.hypot(PLACES[a].x - PLACES[here].x, PLACES[a].z - PLACES[here].z) - Math.hypot(PLACES[b].x - PLACES[here].x, PLACES[b].z - PLACES[here].z)).slice(0, 1),
  desk_here: (here) => (DESK_IDS.includes(here) ? [here] : []), desk_other: (here) => DESK_IDS.filter((d) => d !== here) };
const kindOf = (at) => (at.startsWith('desk') ? 'desk' : at);
let REG = {}, regMtime = 0;
function loadRegistry() {
  try {
    const m = fs.statSync(REGISTRY).mtimeMs; if (m === regMtime) return;
    const next = {};
    for (const c of JSON.parse(fs.readFileSync(REGISTRY, 'utf8')).chains || []) {
      const d = c.director; if (!d || c.status !== 'в живой редакции') continue;
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(d.verb || '') || CORE.has(d.verb) || !Number.isFinite(d.rate) || !Array.isArray(d.dwell) || d.dwell.length !== 2 || !Array.isArray(d.where)) { log('registry: chain skipped (director block malformed):', c.id); continue; }
      const v = next[d.verb] ??= { rate: d.rate, dwell: d.dwell, once: !!d.once, needs: cleanNeeds(d.needs), where: [],
        people: Array.isArray(d.people) ? d.people.filter((x) => typeof x === 'string') : null,
        when: d.when === 'music' || d.when === 'quiet' ? d.when : null, effect: d.effect === 'tv_music' ? d.effect : null };   // people: only these may do it (whisky alone: the columnist, owner 30.09)
      for (const w of d.where) if (WHERE[w.at] && typeof w.label === 'string' && typeof w.jev === 'string') v.where.push(w); else log('registry: place skipped in', c.id, w && w.at);
    }
    REG = {...next,...HEROINE_ACTIVITIES}; regMtime = m;
    log('registry:', Object.entries(REG).map(([v, x]) => `${v}@${x.where.map((w) => w.at).join('|')}`).join(', ') || 'no director activities');
  } catch (e) { log('registry unreadable, keeping the previous list:', e.message); }
}
const fill = (t, p) => t.replaceAll('{desk}', PLACES[p].desk || '').replaceAll('{place}', PLACES[p].name);
const rateOf = (id, a) => (RATE[a] ?? REG[a]?.rate ?? 0) * (PEOPLE[id].fatigue ?? 1);
const dwellOf = (a) => DWELL[a] ?? REG[a]?.dwell ?? [60, 120];
const cityHour = (now) => cityUtc === null ? new Date(now).getHours() : new Date(now + cityUtc * 1000).getUTCHours();
const ownFinancialFlirtPressure=id=>id==='heroine'&&st.economy?.config.enabled?financialFlirtPressure(available(st,id),price(st,'lunch')):0;
const needGrowth = (id, k, now) => k==='flirt' ? flirtGrowth(st.chars[id],PEOPLE[id].personality,ownFinancialFlirtPressure(id)) : (PEOPLE[id].grow[k] ?? 0) * (EVENING[k] && cityHour(now) >= EVENING_FROM ? EVENING[k] : 1) + (k === 'dance' ? danceBoost(id, now) : 0);
function witnessedExecution(id,now){const p=st.chars[id],a=executionCapabilities?.actors?.[id];return id!=='heroine'&&p.activity!=='lunch'&&!['smoke','smoke_coffee'].includes(p.activity)||(a?.seq===p.seq&&a.activity===p.activity&&a.executing===true&&now-executionCapabilities.at<3500);}
function activityRunning(id, now) { const p = st.chars[id]; return witnessedExecution(id,now)&&!p.executionGate && now >= (p.arriveAt || 0) && (!REG[p.activity]?.once || now < (p.activityUntil ?? p.busyUntil)); }
const smokingNeedBlocked=(id,k,activity)=>['smoke','smoke_coffee'].includes(activity)&&(k==='nicotine'?!executionCapabilities?.actors?.[id]?.smoking?.lit:k==='coffee'&&activity==='smoke_coffee'?!executionCapabilities?.actors?.[id]?.smoking?.sip:false);
const needRate = (id, k, a, now = Date.now()) => needGrowth(id, k, now) + (activityRunning(id, now)&&!usesConsumption(id,a) ? (smokingNeedBlocked(id,k,a)?0:(REG[a]?.needs?.[k] ?? 0)) : 0);
// Current physiology remains visible to Jev even when no activity relieves it.
const liveNeeds = (id) => Object.keys(PEOPLE[id].grow);
// Keep real needs and growth even when the connected repertoire cannot relieve them.
function needLimitations(id) {
  const messages={nicotine:'Курение для этого персонажа пока не подключено: нужен совместимый полный процесс с сигаретой.',social:'Общение для этого персонажа ещё не подключено.',alcohol:'Питьё для этого персонажа ещё не подключено. Наливание в бокал не утоляет это желание.',music:'Слушание музыки для этого персонажа ещё не подключено.'};
  return Object.fromEntries(Object.keys(PEOPLE[id].grow).filter(k=>PEOPLE[id].grow[k]>0).filter(k=>k==='flirt'?!supports(id,'conversation'):k==='social'?!supports(id,'conversation'):!Object.entries(REG).some(([verb,x])=>supports(id,verb)&&(!x.people||x.people.includes(id))&&(x.needs?.[k]??0)<0)).map(k=>[k,messages[k]||'Для этой потребности пока не подключено подходящее действие.']));
}
loadRegistry();
const rnd = ([a, b]) => a + Math.random() * (b - a);
const WIRE = ['Туман остановил паромы на Стейтен-Айленд', 'Горсовет одобрил новый мост через Ист-Ривер', 'Забастовка грузчиков в бруклинском порту',
  'Пожар на складе в Квинсе', 'Мировая серия: «Доджерс» против «Янкиз»', 'Похолодание: ночью до нуля', 'Задержки на линиях метро IRT',
  'Новая выставка в Музее современного искусства', 'Цены на кофе снова растут', 'Лайнер задерживается у причала 90', 'Отключение света в Гарлеме'];
const WIRE_EN = {  // headlines for the TV bulletin (props and captions are in English)
  'Туман остановил паромы на Стейтен-Айленд': 'FOG HALTS STATEN ISLAND FERRIES',
  'Горсовет одобрил новый мост через Ист-Ривер': 'CITY COUNCIL APPROVES NEW EAST RIVER BRIDGE',
  'Забастовка грузчиков в бруклинском порту': 'LONGSHOREMEN STRIKE AT BROOKLYN PIERS',
  'Пожар на складе в Квинсе': 'WAREHOUSE FIRE IN QUEENS',
  'Мировая серия: «Доджерс» против «Янкиз»': 'WORLD SERIES: DODGERS VS. YANKEES',
  'Похолодание: ночью до нуля': 'COLD SNAP: FREEZING TONIGHT',
  'Задержки на линиях метро IRT': 'DELAYS ON IRT SUBWAY LINES',
  'Новая выставка в Музее современного искусства': 'NEW EXHIBITION AT THE MUSEUM OF MODERN ART',
  'Цены на кофе снова растут': 'COFFEE PRICES CLIMB AGAIN',
  'Лайнер задерживается у причала 90': 'OCEAN LINER HELD AT PIER 90',
  'Отключение света в Гарлеме': 'POWER FAILURE IN HARLEM',
};
// the newsroom's clock is the city chosen in the menu (owner 30.09): its UTC offset comes with the relay's weather (/health), asked every 10 min
let cityUtc = null, cityAsked = 0;
async function cityClock(now) {
  if (now - cityAsked < 600000) return; cityAsked = now;
  try { const w = (await relay('/health')).weather; if (Number.isFinite(w?.utc) && w.utc !== cityUtc) { cityUtc = w.utc; log('clock:', w.name, 'UTC' + (cityUtc >= 0 ? '+' : '') + cityUtc / 3600); } }
  catch { /* keep the last one */ }
}
const hhmm = (ms) => (cityUtc === null ? new Date(ms).toTimeString().slice(0, 5) : new Date(ms + cityUtc * 1000).toISOString().slice(11, 16));

// ---------- state (survives restarts): st.chars[id] — each person; the wire, the chairs, the budget — shared
function freshPerson(id, now, place) {
  const P = PEOPLE[id];
  const desk=PLACES[place].kind==='desk',activity=desk?'work':PLACES[place].kind==='bench'?'rest_lounge':'wait';
  return { place, activity, since: now, busyUntil: now + 60000 / FAST, fatigue: 20, lastNeeds: now, needs: { ...P.start }, memory: [], repeats: 0, arriveAt: 0, seq: 1,
    chairsAtStart: {}, entry: { from: target(place), cmd: null, at: now, label: desk?`работает за столом ${PLACES[place].desk}`:`находится ${PLACES[place].name}`, activity, source: 'start' } };
}
let st; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { st = null; }
const now0 = Date.now();
if (!st) st = { seq: 1, chairs: { A: CHAIR_REST, B: CHAIR_REST, C: CHAIR_REST, D:CHAIR_REST }, day: new Date().toDateString(), jevToday: 0, request: 0, tasks: [], taskSeq: 0, nextTask: 0, chars: {} };
st.chairs ??= {}; st.chairs.D ??= CHAIR_REST; st.sleepDeskLeases ??= {};
// Restore the physical lease as well as the future destination after a restart.
if(!st.diningChairLease){const found=Object.entries(st.chars||{}).find(([,p])=>p.place==='diningChair'||p.entry?.from?.seat==='diningChair');if(found)st.diningChairLease={owner:found[0],phase:found[1].place==='diningChair'?'claimed':'departing'};}
st.tasks ??= []; st.taskSeq ??= 0; st.nextTask ??= 0; st.chars ??= {};
if (!st.chars.columnist && st.place) {                               // the state of one «editor» (before 29.09 evening) becomes the columnist's
  st.chars.columnist = { place: st.place, activity: st.activity, since: st.since, busyUntil: st.busyUntil, fatigue: st.fatigue, lastNeeds: st.lastNeeds, needs: st.needs || {},
    memory: st.memory || [], repeats: st.repeats || 0, arriveAt: st.arriveAt || 0, seq: st.world?.seq ?? st.seq, chairsAtStart: { ...(st.world?.chairs || {}) }, entry: st.world?.editor || null };
  if (st.tasks[0] && st.activity === 'work') st.tasks[0].by = 'columnist';
  for (const k of ['place', 'activity', 'since', 'busyUntil', 'fatigue', 'lastNeeds', 'needs', 'memory', 'repeats', 'arriveAt']) delete st[k];
  log('state: the editor of v1 is the columnist now');
}
for (const id of IDS) if (!st.chars[id]) {                           // a new person comes in: at his own desk if it is free, else at any free one
  const taken = new Set([...Object.values(st.chars).map((p) => p.place),...(st.steps||[]).map(s=>s.place)]), free = (PEOPLE[id].startPlaces || [PEOPLE[id].home, ...DESK_IDS]).find((d) => !taken.has(d));
  if(!free)throw Error('No compatible unoccupied starting place for '+id);
  st.chars[id] = freshPerson(id, now0, free); if(PLACES[free].desk){st.chars[id].chairsAtStart = { [PLACES[free].desk]: 0 }; st.chairs[PLACES[free].desk] = 0;}st.seq += 1;
  log(`state: ${PEOPLE[id].name} comes in, ${PLACES[free].name}`);
}
for (const [id, p] of Object.entries(st.chars)) { p.activityUntil ??= p.busyUntil; p.needs ??= {}; initializeSleep(p); requireSleep(p,now0); p.lastNeeds=now0; for (const [k, v0] of Object.entries(PEOPLE[id]?.start || {})) p.needs[k] ??= v0; }
initializeSocial(st);
const economyConfig=JSON.parse(fs.readFileSync(process.env.ECONOMY_CONFIG_FILE||new URL('./economy-config.json',import.meta.url),'utf8'));
ensureEconomy(st,economyConfig,now0);ensurePerformances(st);ensureServices(st);
st.lastWire=now0; // Restarted/unwatched wall time is not active simulation time.
const recoveredRequests=recoverInterruptedRequests(st,now0);
let teletypeDirty=recoveredRequests||st.fatigueRulesVersion!==2||st.economy.config.enabled&&!st.world?.chars?.columnist?.finances?.enabled;st.fatigueRulesVersion=2;
if(teletypeDirty)st.seq++; // Publish newly initialized accounts even if every actor is still busy.
st.nextCall ??= rnd(CALL_EVERY) * 60000 / FAST;
function startCall(now, text = null) {                              // desk A rings: whoever sits there answers, else the nearest one walks over
  if (!text) st.nextCall = rnd(CALL_EVERY) * 60000 / FAST;         // text: the owner's message (Archie, ring.sh) — a fact for the one who answers
  if(Object.values(st.chars).some(p=>p.activity==='phone'))return false;
  const ids = Object.keys(st.chars).filter((k) => PEOPLE[k]&&supports(k,'phone')&&!st.chars[k].sleep&&!st.chars[k].sleepPending&&!Object.values(st.sleepDeskLeases).some(l=>l.owner===k)&&!(st.diningChairLease?.owner===k&&st.diningChairLease.phase==='departing'));
  const id = ids.find((k) => st.chars[k].place === 'deskA') || ids.sort((a, b) => travelSeconds(st.chars[a].place, 'phoneA') - travelSeconds(st.chars[b].place, 'phoneA'))[0];
  if (!id) return false;
  if(applyDecision(id, st.chars[id].place === 'deskA' ? 'phone@deskA' : 'phone@phoneA', text ? 'owner_call' : 'call', null)===false)return false;
  log(`phone: desk A rings${text ? ` (the owner: «${text.slice(0, 60)}»)` : ''}, ${PEOPLE[id].name} answers`);
  if (text) { const p = st.chars[id]; p.memory.push({ event: 'phone_call', from: 'владелец газеты', text, at: hhmm(now) }); p.memory = p.memory.slice(-12);
    p.busyUntil = Math.max(now, p.arriveAt || 0) + 10000 / FAST;      // the owner's call: 10 s of talk (owner 30.09)
    st.ownerMsg = { text, at: now, time: hhmm(now), by: PEOPLE[id].name }; st.world = composeWorld(now); save(); }
  return true;
}
// the owner's message is a fact of the whole newsroom for half an hour (emergence decisions 28.09 §8): everybody's snapshot has it
const ownerNote = (now) => (st.ownerMsg && now - st.ownerMsg.at < 30 * 60000 ? { owner_message: `В ${st.ownerMsg.time} звонил владелец газеты, трубку взял ${st.ownerMsg.by}. Владелец сказал: «${st.ownerMsg.text}»` } : {});
const CALLS = HERE + 'calls/';                                       // the owner's calls: ring.sh (Archie) drops {text} files here, one call per file
function ownerCalls(now) {
  let f; try { f = fs.readdirSync(CALLS).filter((n) => n.endsWith('.json')).sort()[0]; } catch { return; }
  if (!f) return;
  let text = ''; try { text = String(JSON.parse(fs.readFileSync(CALLS + f, 'utf8')).text || '').trim().slice(0, 500); } catch { /* a broken file is dropped */ }
  if (text && !startCall(now, text)) return;                         // somebody is on the phone now: it rings after him
  try { fs.mkdirSync(CALLS + 'done', { recursive: true }); fs.renameSync(CALLS + f, CALLS + 'done/' + f); } catch (e) { log('calls:', e.message); }
}
// ---------- invitations (owner 30.09): «invite@<id>» is offered to Jev like any action; the one invited answers at once (his own Jev
// decision: accept / decline / defer) — even in the middle of something; both see each other, the page shows a bubble (the thing +
// the answer) and a nod or a shake. Agreed: the one who called goes first, the other follows LAG later (they do not smoke in step);
// «not now»: he comes later by himself. A refusal is remembered by both and the same pair is not asked again for a while.
const INV = { answer: 2200, go: 4500, lag: 4000, later: 16000, cool: { accept: 12, decline: 25, defer: 12 } };   // ms; cool: minutes before the same one asks the same one again
const ACC = { columnist: 'колумниста', reporter: 'репортёра', newspaper_editor: 'редактора' }, DAT = { columnist: 'колумнисту', reporter: 'репортёру', newspaper_editor: 'редактору' };
st.inviteCool ??= {}; st.inviteSeq ??= 0; st.steps ??= []; st.deferredInvites ??= {};
const busyWith = (p) => !!p.sleep || !!p.sleepPending || Object.values(st.sleepDeskLeases).some(l=>st.chars[l.owner]===p) || (st.diningChairLease?.phase==='departing'&&st.chars[st.diningChairLease.owner]===p) || p.activity === 'phone' || p.activity === 'invite' || /^smoke/.test(p.activity);
function canInvite(id, o, now) {
  const a = st.chars[id], b = st.chars[o]; if(id==='heroine'||o==='heroine'||!canAfford(st,id,'smoke',now)||!canAfford(st,o,'smoke',now))return false; if (!b || !PEOPLE[o] || st.invite || !supports(id,'smoke') || !supports(o,'smoke')) return false;
  if (busyWith(a) || busyWith(b) || now < (b.arriveAt || 0) || now < (a.arriveAt || 0)) return false;
  if ((st.inviteCool[id + '>' + o] || 0) > now) return false;
  const taken = new Set(Object.entries(st.chars).filter(([k]) => k !== id && k !== o).map(([, p]) => p.place));
  return !taken.has('window') && !taken.has('window2');
}
function startInvite(id, o, now) {                                   // the inviter «speaks» (bubble 🚬 ?); the answer is asked on the next tick (2 s)
  st.inviteSeq += 1; st.invite = { n: st.inviteSeq, from: id, to: o, at: now, answerAt: now + 1000 };
}
const talkOn = (p, t) => { p.entry = { ...(p.entry || {}), talk: t }; };
function stepsDue(now) {                                             // the moves an answer scheduled (the one who called goes first, the other a bit later)
  const due = st.steps.filter((x) => now >= x.at); if (!due.length) return false;
  st.steps = st.steps.filter((x) => now < x.at);
  for (const x of due) { const p = st.chars[x.id]; if (!p || p.activity === 'phone') continue;
    const taken = new Set(Object.entries(st.chars).filter(([k]) => k !== x.id).map(([, q]) => q.place));
    if (taken.has(x.place)) continue;
    applyDecision(x.id, 'smoke@' + x.place, 'invite', null); }
  return true;
}
async function answerInvite(now) {
  if(st.invite?.kind === 'social') return answerSocialInvite(now);                                   // the one invited decides now, whatever he is doing
  const v = st.invite, a = v.from, b = v.to, pa = st.chars[a], pb = st.chars[b];
  const inv = 'invitation-' + v.n, cur = labelOf(b, pb.activity, pb.place);
  const avail = [
    { id: 'accept:' + inv, description: `Согласиться: пойти покурить вместе с ${PEOPLE[a].name.toLowerCase()}ом у окна (бросить то, чем занят сейчас: ${cur})` },
    { id: 'decline:' + inv, description: `Отказаться и продолжать: ${cur}` },
    { id: 'defer:' + inv, description: `Ответить «не сейчас», закончить начатое и подойти к окну чуть позже` }];
  inviteNote[b] = `${PEOPLE[a].name} зовёт тебя покурить вместе у окна`;
  const diagnosticId=newTraceId();
  trace(diagnosticId,'choice_started',{actorId:b,revision:st.seq,choiceKinds:offeredKinds(avail),optionCount:avail.length,offered:avail});
  let d = null, source = 'jev';
  if (process.env.NO_JEV || st.jevToday >= DAILY) {requestFailed(st,b,'physical',diagnosticId,new Error(process.env.NO_JEV?'model_disabled':'daily_limit'),Date.now());await publishModelStatus();delete inviteNote[b];return;}
  else { try { d = await askJev(b, avail, null, diagnosticId); st.jevToday += 1; } catch (e) {delete inviteNote[b];trace(diagnosticId,'application',{actorId:b,source:'none',status:'request_failed',physicalExecution:'existing_command_preserved'});return;} }
  delete inviteNote[b];
  if(st.invite!==v||pa.sleepPending||pb.sleepPending||pa.sleep||pb.sleep){trace(diagnosticId,'application',{actorId:b,action:d?.action??null,source,status:'stale_rejected',revisionAfter:st.seq,physicalExecution:'not_confirmed_by_response'});return;}
  if (!d || !avail.some((x) => x.id === d.action)) { source = 'rule'; const n = pb.needs.nicotine ?? 0; d = { action: (n >= 45 ? 'accept:' : n >= 25 ? 'defer:' : 'decline:') + inv, confidence: null }; }
  const ans = d.action.split(':')[0], t = Date.now(), mark = { accept: 'yes', decline: 'no', defer: 'later' }[ans];
  talkOn(pb, { at: t, to: a, icon: 'smoke', mark });
  // who stands where: the pair of places with the shorter walk in sum (then nobody walks past the other already standing there)
  const w = (id, pl) => travelSeconds(st.chars[id].place, pl);
  const sp = ans === 'accept' && w(a, 'window2') + w(b, 'window') < w(a, 'window') + w(b, 'window2') ? { [a]: 'window2', [b]: 'window' } : { [a]: 'window', [b]: 'window2' };
  st.steps.push({ id: a, place: sp[a], at: t + INV.go - INV.answer });
  if (ans === 'accept') { st.steps.push({ id: b, place: sp[b], at: t + INV.go - INV.answer + INV.lag }); pb.busyUntil = t + 60000; }
  if (ans === 'defer') st.deferredInvites[b] = { from: a, place: 'window2', notBefore: t + INV.later, expires: t + 10 * 60000 };
  if (ans !== 'accept') pb.busyUntil = Math.max(pb.busyUntil, t + 20000);   // he said no: he goes on with what he was doing for a while
  st.inviteCool[a + '>' + b] = t + INV.cool[ans] * 60000;
  const hm = hhmm(t);
  pa.memory.push({ event: 'invitation', to: PEOPLE[b].name, what: 'покурить у окна', answer: { accept: 'согласился', decline: 'отказался', defer: 'сказал «не сейчас»' }[ans], at: hm, source }); pa.memory = pa.memory.slice(-12);
  pb.memory.push({ event: 'invited', by: PEOPLE[a].name, what: 'покурить у окна', answer: { accept: 'согласился', decline: 'отказался', defer: 'сказал «не сейчас»' }[ans], at: hm, source }); pb.memory = pb.memory.slice(-12);
  st.invite = null; st.seq += 1; st.world = composeWorld(t); save();
  trace(diagnosticId,'application',{actorId:b,action:d.action,source,status:'invitation_response_recorded',revisionAfter:st.seq,steps:st.steps,physicalExecution:'not_confirmed_by_response'});
  log(`invite: ${PEOPLE[b].name} ${ans} (${source}${d.confidence != null ? ' ' + Math.round(d.confidence * 100) + '%' : ''}) → ${PEOPLE[a].name} to ${sp[a]}${ans === 'accept' ? ', ' + PEOPLE[b].name + ' to ' + sp[b] : ''}`);
}
const inviteNote = {};
const taskOf = (id) => st.tasks.find((t) => t.by === id) || null;
const waiting = () => st.tasks.filter((t) => !t.by);
function newTask(now) {
  st.taskSeq += 1;
  st.tasks.push({ id: 'task-' + st.taskSeq, title: WIRE[(st.taskSeq - 1) % WIRE.length], arrived: hhmm(now), need_min: Math.round(rnd([4, 8])), done_min: 0 });
  st.nextTask = rnd([15, 20]) * 60000 / FAST;                      // 3-4 stories an hour of watched time
  st.teletype = { id: 'task-' + st.taskSeq, at: now, title: st.tasks.at(-1).title, en: WIRE_EN[st.tasks.at(-1).title] || '' };   // viewers hear the teletype at this moment
  teletypeDirty = true;
  log(`teletype: new story «${st.tasks.at(-1).title}» (${waiting().length} waiting)`);
}
if (!st.tasks.length && !st.taskSeq) newTask(Date.now());
// Chronicle is a separate owner archive. No history is added to st or Jev requests.
const CHRONICLE_FILE=STATE+'.chronicle/events.jsonl',CHRONICLE_CURSOR=STATE+'.chronicle/delivery.json';
let chronicle=null,chronicleCursor=0,chronicleSending=false,chronicleWarning=0;
let danceObserver;const chronicleNames=Object.fromEntries(Object.entries(PEOPLE).map(([id,p])=>[id,p.name]));
const chronicleError=e=>{if(Date.now()-chronicleWarning>60000){log('chronicle unavailable:',e.message);chronicleWarning=Date.now();}};
try{chronicle=new ChronicleStore(CHRONICLE_FILE);try{chronicleCursor=JSON.parse(fs.readFileSync(CHRONICLE_CURSOR,'utf8')).cursor||0;}catch{}if(chronicleCursor>chronicle.records.length)chronicleCursor=0;}catch(e){chronicleError(e);}
let danceCheckpoint=[];try{const saved=JSON.parse(fs.readFileSync(STATE+'.chronicle/dance.json','utf8'));if(Array.isArray(saved))danceCheckpoint=saved;}catch{}
danceObserver=new DanceObserver(chronicle?.records.filter(r=>r.type==='event').map(r=>r.data)||[],danceCheckpoint);
let danceCheckpointHash=JSON.stringify(danceObserver.snapshot());
const captureChronicle=(events=null)=>{if(!chronicle)return;try{
 const at=Date.now(),data=events?{events,current:null,observedAt:at}:extractChronicle(st,chronicleNames,at);
 if(!events)data.events.push(...danceObserver.observe(st,null,at,FAST));chronicle.capture(data);
 const checkpoint=JSON.stringify(danceObserver.snapshot());if(checkpoint!==danceCheckpointHash){fs.writeFileSync(STATE+'.chronicle/dance.json.tmp',checkpoint);fs.renameSync(STATE+'.chronicle/dance.json.tmp',STATE+'.chronicle/dance.json');danceCheckpointHash=checkpoint;}
}catch(e){chronicleError(e);}};
async function deliverChronicle(){
 if(!chronicle||chronicleSending||chronicleCursor>=chronicle.records.length)return;
 chronicleSending=true;
 try{const batch=chronicle.batch(chronicleCursor,20),r=await fetch(RELAY+'/director/chronicle',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},body:JSON.stringify({records:batch.records}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('archive_http_'+r.status);const ack=await r.json();
  if(!Array.isArray(ack.acceptedIds)||!batch.records.every(x=>ack.acceptedIds.includes(x.id)))throw Error('archive_ack_mismatch');
  fs.writeFileSync(CHRONICLE_CURSOR+'.tmp',JSON.stringify({cursor:batch.cursor}));fs.renameSync(CHRONICLE_CURSOR+'.tmp',CHRONICLE_CURSOR);chronicleCursor=batch.cursor;
 }catch(e){chronicleError(e);}finally{chronicleSending=false;}
}
const save = () => { captureChronicle();try { fs.writeFileSync(STATE + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(STATE + '.tmp', STATE); } catch (e) { log('save failed', e.message); } };

const LABEL = {sleep_desk: (id,p)=>`${st.chars[id].sleep?.phase==='asleep'?'спит':st.chars[id].sleep?.phase==='waking'?'просыпается':'готовится ко сну'} ${sleepPlaceText(p)}`, work: (id, p) => (taskOf(id) ? `правит «${taskOf(id).title}» за столом ${PLACES[p].desk}` : `работает за столом ${PLACES[p].desk}`), rest_desk: (id, p) => `отдыхает за столом ${PLACES[p].desk}`,
  rest_lounge: (id,p) => p==='diningChair'?'отдыхает на стуле у обеденного стола':'отдыхает на скамье у круглого стола', read_wire:()=> 'читает ленту телетайпа',wait: (id,p)=>PLACES[p].kind==='chair'?'сидит на стуле у обеденного стола':PLACES[p].kind==='desk'?'сидит за столом':PLACES[p].kind==='bench'?'сидит на скамье':p==='teletype'?'стоит у телетайпа':p==='teletypeRead'?'стоит перед телетайпом':'стоит '+PLACES[p].name,
  phone: (id, p) => (PLACES[p].kind === 'desk' ? `говорит по телефону за столом ${PLACES[p].desk}` : 'говорит по телефону у стола A'),
  conversation: (id) => {const p=pairOf(st,id);return p?`общается с ${PEOPLE[p.members.find(x=>x!==id)].name.toLowerCase()}`:'ждёт решения после разговора';},
  invite: (id) => (st.invite?.from === id ? `зовёт ${ACC[st.invite.to] || st.invite.to} покурить` : 'зовёт покурить') };
function labelOf(id, a, p) {
  if (LABEL[a]) return LABEL[a](id, p);
  const kind = PLACES[p].kind === 'spot' ? (p === 'window2' ? 'window' : PLACES[p].at || p) : PLACES[p].kind, w = REG[a]?.where.find((x) => kindOf(x.at) === kind) || REG[a]?.where[0];
  return w ? fill(w.label, p) : a;
}

function tickNeeds(now) {                                          // runs only while someone watches
  const minW = (now - (st.lastWire ?? now)) / 60000; st.lastWire = now;
  st.nextTask -= minW * 60000; if (st.nextTask <= 0 && waiting().length < 3) newTask(now);
  st.nextCall -= minW * 60000; if (st.nextCall <= 0) startCall(now);
  for (const id of Object.keys(st.chars)) updatePersonNeeds(id, now);
}
function updatePersonNeeds(id, now, witnessedWorkMs=0) {
    const p = st.chars[id];
    now=Math.max(now,p.lastNeeds);const last = p.lastNeeds, min = Math.max(0, now - last) / 60000; p.lastNeeds = now;
    const finish = p.activityUntil ?? p.busyUntil;
    const start = Math.max(last, p.arriveAt || 0), end = REG[p.activity]?.once ? Math.min(now, finish) : now;
    const witnessed=witnessedExecution(id,now);
    const acting = p.executionGate || !witnessed ? 0 : Math.max(0, end - start) / 60000;
    const after = p.executionGate ? min : REG[p.activity]?.once ? Math.max(0, now - Math.max(last, finish)) / 60000 : 0;
    if(p.executionGate)p.busyUntil=Math.max(p.busyUntil,now+2000);
    // A meal ends through its executor receipt, including after a temporary report gap.
    if(p.activity==='lunch'){p.busyUntil=Math.max(p.busyUntil,now+2000);if(witnessed)p.activityUntil=Math.max(p.activityUntil,now+2000);}
    requireSleep(p,last); // Capture 95 before an ordinary rest tick can take it just below the threshold.
    if(!p.sleep||p.sleep.phase==='entering')awakeFatigue(p,last,now,acting+after>0?((usesConsumption(id,p.activity)?0:rateOf(id,p.activity))*acting+rateOf(id,'wait')*after)/(acting+after):0,acting+after,FAST,cityUtc??-new Date(now).getTimezoneOffset()*60);
    requireSleep(p,now);
    if(p.sleep)p.busyUntil=now+60000;
    advanceFlirtNeed(p,min*FAST,PEOPLE[id].personality,needGrowth(id,'drunk',now)+(usesConsumption(id,p.activity)?0:(REG[p.activity]?.needs?.drunk??0)*acting/(min||1)),ownFinancialFlirtPressure(id));
    for (const k of Object.keys(PEOPLE[id].grow).filter(k=>k!=='flirt')) p.needs[k] = Math.max(0, Math.min(100, (p.needs[k] ?? 0) + (needGrowth(id, k, now) * min + (usesConsumption(id,p.activity)?0:(smokingNeedBlocked(id,k,p.activity)?0:(REG[p.activity]?.needs?.[k] ?? 0))) * acting) * FAST));
    if (REG[p.activity]?.when === 'music' && !musicOn(now) && now > (p.arriveAt || 0)) p.busyUntil = Math.min(p.busyUntil, now);   // the music is over: he decides again
    if (!supports(id,'work') || p.activity !== 'work' || now <= p.arriveAt) return;
    let t = taskOf(id); if (!t && waiting()[0]) { t = waiting()[0]; t.by = id; teletypeDirty = true; }   // at his desk with nothing to do: he takes the next story off the wire
    if (!t) return;
    t.done_min += (st.economy.config.enabled?witnessedWorkMs/60000:acting)*FAST;
    if (t.done_min >= t.need_min) {                                   // external work_finished event for this task
      st.tasks = st.tasks.filter((x) => x !== t); p.memory.push({ event: 'work_finished', task: t.id, title: t.title, at: hhmm(now) }); p.memory = p.memory.slice(-12);
      rewardWork(st,id,t,now);observeWorkCompleted(st,id,t,now);st.seq++;teletypeDirty=true;
      log(`work_finished ${t.id} «${t.title}» (${PEOPLE[id].name})`); p.busyUntil = Math.min(p.busyUntil, now + 15000);   // a natural moment to decide again
    }
}

// what viewers see in the panel: his needs with their rate per minute, his story, the queue on the wire (the page runs values on between decisions)
function stateNow(id, now) {
  const p = st.chars[id], t = taskOf(id);
  return { at: now, needLimitations:needLimitations(id), needs: { fatigue: { v: +p.fatigue.toFixed(1), rate: p.sleep&&p.sleep.phase!=='entering'?0:(awakeFatigueRate(cityHour(now))+(activityRunning(id,now)?(usesConsumption(id,p.activity)?0:rateOf(id,p.activity)):p.executionGate||REG[p.activity]?.once&&now>=(p.activityUntil??p.busyUntil)?rateOf(id,'wait'):0))*FAST },
      ...Object.fromEntries(Object.keys(PEOPLE[id].grow).map((k) => [k, { v: +(p.needs[k] ?? 0).toFixed(1), rate: +(needRate(id, k, p.activity) * FAST).toFixed(2) }])) },
    task: t ? { confirmedOnly:st.economy.config.enabled, title: t.title, done: +t.done_min.toFixed(2), need: t.need_min, working: p.activity === 'work', from: Math.max(now, p.arriveAt || 0) } : null,
    queue: waiting().length };
}

// ---------- actions offered to Jev (only what the office can physically do right now, and only where nobody else is or is going)
const EFFECT = (id, a) => [rateOf(id, a) > 0 ? `занятие добавляет примерно ${rateOf(id, a)} усталости в минуту` : rateOf(id, a) < 0 ? `занятие снижает усталость примерно на ${-rateOf(id, a)} в минуту` : 'занятие не восстанавливает силы; усталость от бодрствования продолжает расти',
  ...Object.entries(REG[a]?.needs || {}).filter(([k, r]) => r < 0 && NEED_TXT[k]).map(([k]) => `${NEED_TXT[k]} проходит`)].join('; ');
const takenBy = (id) => new Set([...performancePlaces(st,id),...(id!=='heroine'&&st.trayDelivery?['trayTable','tv2']:[]),...(id!=='heroine'&&st.economy?.services?.some(s=>s.status==='running')?['bar','tv5','tv2']:[]),...Object.entries(st.chars).filter(([k]) => k !== id).flatMap(([, p]) => (p.place === 'phoneA' ? ['phoneA', 'deskA'] : [p.place])),
  ...(st.steps || []).filter((x) => x.id !== id).map((x) => x.place),...Object.entries(st.sleepDeskLeases).filter(([,l])=>l.owner!==id).map(([desk])=>desk),...(st.diningChairLease&&st.diningChairLease.owner!==id?['diningChair']:[])]);   // a place someone was told to go to after an invitation is his   // at the phone: desk A is his too
function serviceInput(now){
 const a=executionCapabilities?.actors?.heroine,taken=takenBy('heroine');
 return {durations:a?.serviceDurations,capabilities:executionCapabilities,stationFree:!taken.has('bar')&&!taken.has('tv5')&&!taken.has('tv2')&&!taken.has('trayTable'),ready:socialReady('heroine',now)&&a?.serviceReady===true,
  benches:Object.fromEntries(IDS.map(id=>{
   const busy=[...takenBy(id)],middle=IDS.find(k=>k!==id&&st.chars[k].place==='benchM'),m=middle&&executionCapabilities?.actors?.[middle];
   const middleEntering=middle&&!(socialReady(middle,now)&&m.mode==='seated'&&m.seat==='benchM');
   return [id,BENCH_IDS.filter(b=>!busy.includes(b)&&benchPassageTags(b,busy).length>0&&!(middleEntering&&((b==='benchS'&&busy.includes('benchN'))||(b==='benchN'&&busy.includes('benchS')))))];
  }))};
}
function performanceInput(now){const a=executionCapabilities?.actors?.heroine;return {mode:st.hostessMode||'dance',capabilities:executionCapabilities,benches:Object.fromEntries(IDS.map(id=>[id,['benchS'].filter(b=>!takenBy(id).has(b))])),ready:socialReady('heroine',now)&&a?.moneyWitness===1&&executionCapabilities.at<=now,music:musicOn(now),durations:a?.performanceDurations||{},places:['tv3'].filter(p=>!takenBy('heroine').has(p))};}
function actions(id) {
  const p = st.chars[id], here = p.place, P = PLACES[here], out = [], taken = takenBy(id), home = PEOPLE[id].home;
  if(Object.values(st.sleepDeskLeases).some(l=>l.owner===id))return [{id:'continue',description:'Завершить освобождение места для сна: оно удерживается до фактического выхода.'}];
  if(st.diningChairLease?.owner===id&&st.diningChairLease.phase==='departing')return [{id:'continue',description:'Продолжить выход со стула; место удерживается до фактического освобождения.'}];
  const add = (aid, description) => { if (!taken.has(aid.split('@')[1])) out.push({ id: aid, description }); };
  if(p.sleep)return [{id:'continue',description:'Сон продолжается до восстановления усталости до 30; другие занятия требуют завершения выхода из сна.'}];
  if(p.sleepPending)return [{id:'continue',description:'При усталости 95 назначен обязательный сон. Исполнитель завершает безопасный выход и ждёт совместимого свободного места для сна.'}];
  if(id==='heroine'&&p.activity==='heroine_serve')return serviceActions(st,id,Date.now(),serviceInput(Date.now())).filter(a=>a.id.startsWith('money_drinks_cancel@'));
  const performance=committedPerformance(st,id);if(performance)return [{id:'continue',description:'Продолжить согласованное выступление: исполнитель автоматически организует посадку зрителя и танец; повторного согласия не требуется.'},{id:`money_performance_cancel@${performance.id}`,description:'Отменить согласованное выступление без оплаты.'}];
  loadRegistry();                                                   // picks up registry edits without a restart
  const music = musicOn(Date.now()), fits = (x) => !x?.when || (x.when === 'music') === music;   // listening only while music plays, turning it on only while it does not
  if (p.activity !== 'phone' && p.activity !== 'invite' && !REG[p.activity]?.once && fits(REG[p.activity])) out.push({ id: 'continue', description: `Продолжать текущее занятие: ${labelOf(id, p.activity, here)} (${EFFECT(id, p.activity)})` });   // a call and a once-activity (a cigarette, lunch) end by themselves: no «one more» in a loop (owner 30.09)
  // work: at his own desk; if it is taken, at a free one; not getting up — where he sits
  const free = DESK_IDS.filter((d) => !taken.has(d)), workDesks = [...new Set([...(P.kind === 'desk' ? [here] : []), ...(free.includes(home) ? [home] : free)])];
  for (const d of workDesks) {
    if (d === here && (p.activity === 'work' || p.activity === 'coffee' || p.activity === 'smoke_coffee')) continue;   // after coffee the typewriter comes back only once he has left the desk
    add('work_variant@' + d, (d === here ? `Вернуться к работе, не вставая: ${PLACES[d].name}` : `Пойти работать: ${PLACES[d].name}${d === home ? ' (его стол)' : ''}`) + ` (${EFFECT(id, 'work')})`);
  }
  if (P.kind === 'desk' && p.activity === 'work') add('rest_desk@' + here, `Передохнуть, не вставая из-за стола: откинуться на стуле (${EFFECT(id, 'rest_desk')})`);
  if (P.kind !== 'bench') for (const b of BENCH_IDS) add('rest_lounge@' + b, `Пойти посидеть и отдохнуть: ${PLACES[b].name} (${EFFECT(id, 'rest_lounge')})`);
  if(here!=='diningChair')add('rest_lounge@diningChair',`Пойти посидеть у северного торца обеденного стола (${EFFECT(id,'rest_lounge')})`);
  if (here !== 'window') add('wait@window', `Подойти к окну и постоять, глядя на вечерний город (${EFFECT(id, 'wait')})`);
  for (const [verb, x] of Object.entries(REG)) for (const w of x.where) for (const pl of (id==='heroine'&&verb==='smoke'&&w.at==='window'?['window','window2'].filter(pl=>!taken.has(pl)):WHERE[w.at](here, taken))) {   // registry activities (smoking, coffee, lunch, …)
    if (x.people && !x.people.includes(id)) continue;
    if (verb==='heroine_serve') continue;
    if(id==='heroine'&&verb==='smoke'&&(!['window','window2'].includes(pl)||executionCapabilities?.actors?.[id]?.smokingAvailable!==true))continue;
    if (!consumptionReady(id,verb,pl,executionCapabilities,Date.now())||!fits(x)||st.hostessMode==='drinks'&&verb.includes('dance')) continue;
    if (pl === here && p.activity === verb) continue;
    if (!out.some((a) => a.id === verb + '@' + pl)) add(verb + '@' + pl, `${fill(w.jev, pl)} (${EFFECT(id, verb)})`);
  }
  if (here !== 'teletype') add('wait@teletype', `Подойти к телетайпу и постоять у него (${EFFECT(id, 'wait')})`);
  if(socialReady(id,Date.now())&&executionCapabilities.actors[id].readingAvailable===true)add('read_wire@teletypeRead','Подойти к печатной ленте телетайпа и читать её; чтение начинается только после подхода и фактического взгляда на бумагу.');
  if (REG.smoke) for (const o of Object.keys(st.chars)) if (o !== id && canInvite(id, o, Date.now()))
    out.push({ id: 'invite@' + o, description: `Позвать ${ACC[o] || o} покурить вместе у окна (он сейчас: ${labelOf(o, st.chars[o].activity, st.chars[o].place)}); он решит сам — может согласиться, отказать или подойти позже` });
  const later = deferredInvite(id, Date.now());
  if (later && !taken.has(later.place) && !out.some(x => x.id === 'smoke@' + later.place)) add('smoke@' + later.place, `Теперь присоединиться к ${DAT[later.from] || later.from}: покурить вместе у окна (${EFFECT(id, 'smoke')})`);
  out.push(...socialActions(id));
  const affordable=list=>expandMealActions(list.filter(a=>st.hostessMode!=='drinks'||!a.id.split('@')[0].includes('dance')), socialReady(id,Date.now())?executionCapabilities.actors[id].meals:null).filter(a=>a.id==='continue'||(!price(st,a.id.split('@')[0])||executionCapabilities?.actors?.[id]?.moneyWitness===1)&&canReplacePurchase(st,id,a.id.split('@')[0],Date.now())).map(a=>({...a,description:a.description+(price(st,a.id.split('@')[0])?` Стоимость ${price(st,a.id.split('@')[0])/100} USD; списание при исполнении.`:'' )}));
  out.push(...moneyActions(st,id,pairOf(st,id),Date.now(),Object.fromEntries(Object.entries(PEOPLE).map(([id,p])=>[id,p.name]))));
  out.push(...serviceActions(st,id,Date.now(),serviceInput(Date.now())));
  out.push(...performanceActions(st,id,pairOf(st,id),Date.now(),performanceInput(Date.now())));
  if(id==='heroine') {
    if(!socialReady(id,Date.now()))return [{id:'continue',description:'Ожидать загрузки собственных движений героини; неподготовленные действия недоступны.'}];
    return explainEarningActions(st,id,affordable(out.filter(a=>(a.id.split('@')[1]!=='diningChair'||['rest_lounge','wait','heroine_coffee'].includes(a.id.split('@')[0]))&&supports(id,a.id.split('@')[0]) && (a.id!=='continue'||supports(id,p.activity)))),Date.now());
  }
  return explainEarningActions(st,id,affordable(out),Date.now());
}
function deferredInvite(id, now) {
  const v = st.deferredInvites[id], partner = v && st.chars[v.from];
  return v && now >= v.notBefore && now < v.expires && partner?.activity === 'smoke' && partner.place === 'window' && activityRunning(v.from, now) ? v : null;
}
let rules = null;
async function characterRules() {
  if (rules) return rules;
  try { const r = await fetch(JEV + '/api/character-rules'); if (r.ok) { const j = await r.json(); rules = { version: j.version, text: j.text }; } } catch { /* optional */ }
  return rules;
}
function others(id) {
  const o = Object.entries(st.chars).filter(([k]) => k !== id).map(([k, p]) => `${PEOPLE[k]?.name || k} — ${labelOf(k, p.activity, p.place)} (${PLACES[p.place].name})`);
  return o.length ? o.join('; ') : 'в редакции он пока один';
}
async function snapshot(id, avail) {
  const now = Date.now(), t = new Date(), p = st.chars[id], P = PEOPLE[id], task = taskOf(id);
  st.request += 1;
  return { scope: 'behavior-two-v01', sessionId: CLIENT, requestId: 'request-' + st.request, revision: st.seq,
    self: { id, role: P.role, character: P.character, personality: P.personality,
      needs: { fatigue: Math.round(p.fatigue), ...Object.fromEntries(liveNeeds(id).map((k) => [k, Math.round(p.needs[k] ?? 0)])) },
      flirt:flirtContext(st,id),
      need_limitations: needLimitations(id),
      needs_scale: 'Шкалы 0–100, чем выше, тем сильнее: fatigue — усталость' + liveNeeds(id).map((k) => `, ${k} — ${NEED_TXT[k]}`).join('') + '.', mode: p.activity, place: PLACES[p.place].name,
      since_minutes: Math.round((now - p.since) / 60000), own_desk: P.home ? PLACES[P.home].name : null,
      task: task ? { id: task.id, kind: 'отредактировать сообщение с ленты для утреннего номера', title: task.title,
        arrived: task.arrived, progress_minutes: Math.round(task.done_min), needs_minutes: task.need_min,
        note: 'Работа продвигается только за письменным столом (work_variant); закончится внешним событием work_finished.' } : null,
      finances:{...moneyContext(st,id),...performanceContext(st,id),...serviceContext(st,id),canWork:supports(id,'work'),livelihood:livelihoodContext(st,id,avail,now)}, pending_tasks: waiting().map((x) => ({ id: x.id, title: x.title, arrived: x.arrived })), memory: structuredClone(p.memory.slice(-6)), relationships:publicRelations(st,id), courtship:Object.fromEntries(Object.entries(p.relationships).map(([other,r])=>[other,courtshipStatus(r,id,other)])), currentActivity: publicConversation(st,id), recentEpisodes: structuredClone(p.memory.filter(x=>x.event==='conversation_finished'||x.event==='conversation_cancelled').slice(-3)) },
    situation: { local_time: hhmm(now), room: 'вечерняя редакция нью-йоркской газеты, 1956 год: три письменных стола (A, B, C), скамья у круглого стола, окна на город, телетайп, бар, телевизор',
      music: musicOn(now) ? 'по телевизору играет музыка' : 'музыка не играет',
      others: others(id), ...(inviteNote[id] ? { invitation: inviteNote[id] } : {}), ...(deferredInvite(id, now) ? { deferred_invitation: `${PEOPLE[st.deferredInvites[id].from].name} ещё курит у окна. Ты ответил «не сейчас»; можно присоединиться или выбрать другое занятие.` } : {}), teletype: waiting().length ? `на ленте ждут правки сообщений: ${waiting().length}` : 'новых сообщений на ленте нет', ...ownerNote(now) },
    ...(await characterRules() ? { characterRules: rules } : {}),
    sleep: {available:supports(id,'sleep_desk'),current:p.sleep||null,pending:p.sleepPending||null,threshold:SLEEP.threshold,wakeBelow:SLEEP.wakeBelow,note:'Есть одна шкала усталости. Она растёт быстрее вечером, обычный отдых её снижает. При 95 сон назначается автоматически и имеет приоритет перед другими делами. Исполненный сон снижает усталость и опьянение; пробуждение — при усталости не выше 30 и не раньше минуты сна.'},
    available_actions: avail,
    limits: ['Money is denominated in integer USD cents. You know only your own balance. Gifts and loans require the other person’s independent listed reply; a gift never buys affection. Purchases debit once on confirmed execution, editorial income is per completed task. Debts persist even when episodes are forgotten.',
      'For every character, consider self.finances.livelihood.wallet when choosing work, purchases, gifts, lending, repayment or paid entertainment. Financial pressure is a motive, not a mandatory sequence. Preserve independent consent and never infer other wallets. Expected income and receivables are not spendable cash.',
      'Only the listed actions are physically available now. No invented actions or motion.',
      'Walking, sitting down and standing up are performed by the executor after the choice.',
      'Places where someone else is (or is going) are not in the list.',
      'Relationships have five independent directed dimensions. Dedicated reflection requests let you appraise real events while physical activity continues. Ordinary action selection does not need to compete with reflection. Use your own feelings and confirmed courtship history when deciding whom to approach, whether to flirt, invite or consider ordering a performance. Own feelings do not reveal partner feelings. Remember confirmed courtship responses and respect boundaries. Paid performance is professional work, not romantic consent. Dance together, kisses and forming a couple are unavailable until their complete joint execution is supported; do not invent them.',
      'Flirt is one need, shared by personal flirt and interest in a paid performance. Use self.flirt, your own directed relationships and observed replies to decide whom to approach, treat or order a show from. Alcohol can increase this motive, never guarantees a purchase or changes consent. Reciprocal flirt, a drink offer, a show and a refusal are independent choices; no required sequence. Remember recent refusals and diminishing novelty. Never infer another person’s private need or wallet.',
      'Conversation intent is your own declared manner. Conflict requires the observed basis in the listed action; do not invent a dispute, topic or partner thoughts.',
      'Joint actions: only an invitation from the list (invite@…) or an answer to an invitation; the other decides for himself.'] };
}

// ---------- Jev through the local pilot server (the key stays in the server; we never see it)
let sid = null;
async function jevPost(path, body) {
  const r = await fetch(JEV + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.status = r.status; throw e; } return j;
}
async function session(action) { return jevPost('/api/behavior-session', { action, session_id: sid, client_id: CLIENT }); }
function behaviorWireSnapshot(snap) {
  // Keep runtime identities intact; the pilot HTTP boundary has a narrower ID grammar.
  const safeId = /^(?:(?:accept|decline|defer):invitation-\d{1,9}|(?!(?:accept|decline|defer)(?:@|$))[a-z][a-z0-9_]{0,39})(?:@[A-Za-z0-9_-]{1,100})?$/;
  const reserved = new Set(snap.available_actions.map(a => a.id)), choices = new Map();
  if (reserved.size !== snap.available_actions.length) throw new Error('duplicate_available_action');
  const available_actions = snap.available_actions.map((a, index) => {
    let id = a.id;
    if (!safeId.test(id)) {
      const verb = /^[a-z][a-z0-9_]{0,39}$/.test(id.split('@')[0]) && !['accept','decline','defer'].includes(id.split('@')[0]) ? id.split('@')[0] : 'choice';
      const base = `${verb}@${snap.requestId.replaceAll('-', '_')}_option_${index}`;
      id = base;
      for (let suffix = 1; reserved.has(id); suffix++) id = `${base}_${suffix}`;
    }
    if (choices.has(id)) throw new Error('duplicate_available_action');
    choices.set(id, a.id);
    const long = Array.from(a.description).length > 500;
    return { ...a, id, ...(id !== a.id ? { semantic_id: a.id } : {}),
      ...(long ? { description: Array.from(a.description).slice(0, 400).join('') + '… Полное описание и основание: description_full этого действия.', description_full: a.description } : {}) };
  });
  return { snapshot: { ...snap, available_actions,
    limits: [...snap.limits, 'Choose an offered id exactly. semantic_id is its internal runtime identity, not a selectable id. If present, description_full contains the complete action meaning and factual basis.'] }, choices };
}
async function reflectRelationships(now){
  if(process.env.NO_JEV||st.jevToday>=DAILY)return false;
  const job=nextReflection(st,now,id=>requestAllowed(st,id,'reflection',now));if(!job)return false;
  const names=Object.fromEntries(Object.entries(PEOPLE).map(([id,p])=>[id,p.name]));
  const options=reflectionActions(st,job,names),diagnosticId=newTraceId();
  trace(diagnosticId,'choice_started',{actorId:job.actor,revision:st.seq,choiceKinds:offeredKinds(options),optionCount:options.length,offered:options});
  st.reflection.lastAttemptAt=now;st.reflection.actorAttempts[job.actor]=now;
  st.reflection.last={actor:job.actor,partner:job.partner,dimension:job.key,at:now,status:'pending',events:job.events.map(e=>e.id)};save();
  try{
    const d=await askJev(job.actor,options,job,diagnosticId);st.jevToday++;
    const p=st.chars[job.actor];
    const ok=!p.sleep&&!p.sleepPending&&applyReflection(st,job,d.action,Date.now(),'jev',d.confidence??null);
    st.reflection.last.status=ok?'applied':'stale';
    trace(diagnosticId,'application',{actorId:job.actor,action:d.action,source:'jev',status:ok?'applied':'stale_rejected',revisionAfter:st.seq+1,actorSeq:p.seq,physicalExecution:'reflection_has_no_physical_command'});
  }catch{st.reflection.last.status='unavailable';trace(diagnosticId,'application',{actorId:job.actor,source:'none',status:'request_failed',revisionAfter:st.seq+1,physicalExecution:'reflection_has_no_physical_command'});} // no fabricated fallback appraisal
  st.reflection.lastCompletedAt=Date.now();st.seq++;st.world=composeWorld(Date.now());save();return true;
}
async function publishModelStatus(){st.seq++;st.world=composeWorld(Date.now());save();try{await relay('/director/world',st.world);}catch{teletypeDirty=true;}}
async function askJev(id, avail, reflection = null, diagnosticId=newTraceId()) {
  const kind=reflection?'reflection':'physical';
  if(!requestAllowed(st,id,kind,Date.now()))throw new Error('model_request_waiting');
  requestStarted(st,id,kind,diagnosticId,Date.now());await publishModelStatus();
  for (let attempt = 0; attempt < 2; attempt++) {
    let requestId=null;
    try {
      if (!sid) { const s = await session('start'); sid = s.session_id; if (s.state === 'paused') await session('resume'); }
      else { try { await session('resume'); } catch (e) { if (!/session_not_paused/.test(e.message)) throw e; } }
      const snap=await snapshot(id,structuredClone(avail));
      if(reflection){snap.self.reflection=structuredClone(reflection);snap.limits.push('This request is dedicated reflection, not a choice of physical activity. Assess only the listed dimension using the listed actual events, prior appraisals and your character. Keeping the value is allowed. A friendly conversation can matter without proving romance; a refusal is not misconduct. Do not infer unknown thoughts or a topic.');}
      const original=structuredClone(snap),wire = behaviorWireSnapshot(fitRelationshipRequest(original));
      requestId=original.requestId;
      trace(diagnosticId,'director_request',{attempt,actorId:id,requestId:original.requestId,revision:original.revision,
        choiceKinds:offeredKinds(avail),optionCount:avail.length,snapshot:original,wireSnapshot:wire.snapshot,aliases:Object.fromEntries(wire.choices)});
      const d = await jevPost('/api/behavior-decide', { session_id: sid, snapshot: wire.snapshot, diagnostic_id:diagnosticId });
      trace(diagnosticId,'director_response',{attempt,requestId:original.requestId,response:d});
      if(d.revision!==original.revision)trace(diagnosticId,'response_revision_mismatch',{requestId:original.requestId,expected:original.revision,received:d.revision??null});
      session('pause').catch(() => {});
      if (!wire.choices.has(d.action)) throw new Error('action_not_available');
      const result=mappedDecision(d,wire.choices);
      trace(diagnosticId,'mapped_decision',{attempt,requestId:original.requestId,decision:result});
      requestSucceeded(st,id,kind,diagnosticId,Date.now());await publishModelStatus();
      return result;
    } catch (e) {
      trace(diagnosticId,'request_error',{attempt,requestId,error:/^[a-z0-9_]+$/.test(e.message)?e.message:'request_failed'});
      if (/session_(not_owned|expired|stopped|changed|paused|client_mismatch)|pilot_call_limit/.test(e.message)) { sid = null; continue; }
      requestFailed(st,id,kind,diagnosticId,e,Date.now());await publishModelStatus();throw e;
    }
  }
  const e=new Error('session_unavailable');requestFailed(st,id,kind,diagnosticId,e,Date.now());await publishModelStatus();throw e;
}
function urgentOnly(id, avail) {
  if (pairOf(st,id)) return avail; // own continuation/leave remains available; social=0 never forces departure                                    // a need at 80+ (and not dead tired): only the activities that ease it are offered — to Jev as well, not just to the rule
  const p = st.chars[id]; if (p.fatigue > 65) return avail;
  for (const k of liveNeeds(id).filter((n) => (p.needs[n] ?? 0) >= 80).sort((a, b) => p.needs[b] - p.needs[a])) {
    const sat = avail.filter((x) => k === 'social' ? /^(social_invite|social_join)@/.test(x.id) : (REG[x.id === 'continue' ? p.activity : x.id.split('@')[0]]?.needs?.[k] ?? 0) < 0); if (sat.length) {const money=livelihoodContext(st,id,avail,Date.now());return [...new Map([...sat,...(money.enabled&&(!money.mealAffordable||money.wallet.foodAndDueDebtGapCents>0)?avail.filter(a=>isEarningStep(id,a.id,p,st)):[])].map(a=>[a.id,a])).values()];}
  }
  return avail;
}
function fallback(id, avail) {
  avail=avail.filter(a=>!/^courtship_|^money_|^social_(intent|relation|style)@|^relationship_appraise@/.test(a.id));
  const p = st.chars[id], ids = avail.map((a) => a.id), f = p.fatigue;
  const pick = (re) => ids.filter((i) => re.test(i));
  let pool = f > 65 ? ids.filter((i) => { const v = i.split('@')[0]; return v !== 'continue' && rateOf(id, v === 'work_variant' ? 'work' : v) < 0; }) : (supports(id,'work') && (f < 30 || taskOf(id) || waiting().length)) ? ids.filter(i=>/^work_variant@/.test(i)||i==='continue'&&p.activity==='work') : ids;
  const urgent = liveNeeds(id).filter((k) => (p.needs[k] ?? 0) >= 80).sort((a, b) => p.needs[b] - p.needs[a])[0];
  if (urgent && f <= 65) { const sat = ids.filter((i) => (REG[i.split('@')[0]]?.needs?.[urgent] ?? 0) < 0); if (sat.length) pool = sat; }
  if (!pool.length) pool = ids;
  return { action: pool[Math.floor(Math.random() * pool.length)], confidence: null };
}

// ---------- applying a decision to the world
function travelSeconds(a, b) {
  if (a === b) return 0;
  const A = PLACES[a], B = PLACES[b], d = Math.hypot(A.x - B.x, A.z - B.z) * 1.35;
  return (A.kind !== 'spot' ? 6 : 0) + d / 1.6 + (B.kind !== 'spot' ? 8 : 0);
}
function sleepReady(id,now){const a=executionCapabilities?.actors?.[id];return a?.loaded===true&&Number.isFinite(executionCapabilities.at)&&executionCapabilities.at<=now&&now-executionCapabilities.at<SLEEP.freshness&&a.seq===st.chars[id].seq&&a.sleepAvailable===true;}
// Mandatory sleep is a physical state-machine priority, independent of Jev's action list.
function settledForSleep(id,now){
 const p=st.chars[id],a=executionCapabilities?.actors?.[id];
 return a?.loaded===true&&Number.isFinite(executionCapabilities.at)&&executionCapabilities.at<=now&&now-executionCapabilities.at<SLEEP.freshness&&a.seq===p.seq&&a.activity===p.activity&&['idle','seated'].includes(a.mode)
  &&(PLACES[p.place]?.kind==='spot'?a.mode==='idle'&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Math.hypot(a.x-PLACES[p.place].x,a.z-PLACES[p.place].z)<.35:a.seat===p.place); // A finished phone/smoke/whisky has executing=false but is still a safe stable endpoint.
}
function releaseSleepDesks(now){
 let changed=false;
 for(const [desk,l]of Object.entries(st.sleepDeskLeases)){
  const p=st.chars[l.owner],a=executionCapabilities?.actors?.[l.owner];
  if(p&&p.place!==desk&&settledForSleep(l.owner,now)&&a.mode==='idle'&&a.seat!==desk&&a.executing===true){
   // Only the witnessed destination releases the source chair; never the issued move alone.
   p.entry={...p.entry,from:target(p.place),cmd:null,at:now};delete p.chairsAtStart[PLACES[desk].desk];delete st.sleepDeskLeases[desk];changed=true;
  }
 }
 return changed;
}
function cancelSleepCommitments(id,now){
 const p=st.chars[id];let changed=false;
 for(const c of st.economy.performances)if(c.performer===id||c.payer===id)changed=cancelPerformance(st,c,'fatigue_sleep',now)||changed;
 const v=st.invite;
 if(v&&(v.from===id||v.to===id)){
  st.invite=null;
  for(const member of [v.from,v.to]){
   const q=st.chars[member];delete inviteNote[member];delete q.beforeSocialInvite;
   q.memory.push({event:'invitation_cancelled',partner:member===v.from?v.to:v.from,reason:'fatigue_sleep',source:'fatigue_rule',at:now});q.memory=q.memory.slice(-12);
   if(member!==id&&q.activity==='invite'&&!q.sleep&&!q.sleepPending)applyDecision(member,'wait@'+q.place,'fatigue_interrupt',null,null,false,true);
  }
  changed=true;
 }
 const previous=st.steps.length;st.steps=st.steps.filter(x=>x.id!==id);changed=changed||previous!==st.steps.length;
 for(const [key,v]of Object.entries(st.deferredInvites))if(key===id||v.from===id){delete st.deferredInvites[key];changed=true;}
 for(const [key,v]of Object.entries(st.social.deferred))if(v.from===id||v.to===id){delete st.social.deferred[key];changed=true;}
 delete p.beforeSocialInvite;
 return changed;
}
function mandatorySleep(now){
 let changed=releaseDiningChair(now);changed=releaseSleepDesks(now)||changed;
 for(const id of IDS)changed=requireSleep(st.chars[id],now)||changed;
 const pending=IDS.filter(id=>st.chars[id].sleepPending).sort((a,b)=>st.chars[a].sleepPending.requestedAt-st.chars[b].sleepPending.requestedAt||IDS.indexOf(a)-IDS.indexOf(b));
 for(const id of pending){
  const p=st.chars[id],request=p.sleepPending;
  changed=cancelSleepCommitments(id,now)||changed;
  const taken=takenBy(id),targets=sleepTargets(id),free=targets.filter(d=>!taken.has(d));
  const place=[p.place,PEOPLE[id].home,...free.slice().sort((a,b)=>travelSeconds(p.place,a)-travelSeconds(p.place,b)||targets.indexOf(a)-targets.indexOf(b))].find(d=>free.includes(d));
  const reason=!supports(id,'sleep_desk')||!sleepReady(id,now)?'sleep_executor_unavailable':!settledForSleep(id,now)?'finishing_safe_exit':!place?(id==='heroine'?'waiting_for_free_chair':'waiting_for_free_desk'):'ready';
  if(request.reason!==reason){request.reason=reason;changed=true;}
  if(reason==='ready'){
   if(applyDecision(id,'sleep_desk@'+place,'fatigue_rule',null,null,false,true)!==false){changed=true;continue;}
  }
  // End a conversation/gesture through its normal executor before waiting for a desk.
  if(waitingForSleepSeat(p)&&settledForSleep(id,now)&&p.activity!=='wait'&&request.quiescedSeq!==p.seq){
   if(applyDecision(id,'wait@'+p.place,'fatigue_wait',null,null,false,true)!==false){request.quiescedSeq=p.seq;changed=true;}
  }
 }
 const waiting=pending.filter(id=>waitingForSleepSeat(st.chars[id]));
 const groups=[...new Set(waiting.map(id=>sleepTargets(id).join(',')))];
 for(const group of groups){
  const targets=group.split(','),count=waiting.filter(id=>sleepTargets(id).join(',')===group).length;
  const departing=targets.filter(place=>st.sleepDeskLeases[place]||place==='diningChair'&&st.diningChairLease?.phase==='departing').length;
  if(count<=departing)continue;
  // Yield only a compatible requested place, keeping its physical departure lease.
  const yielded=IDS.filter(id=>{const p=st.chars[id];return targets.includes(p.place)&&!p.sleep&&!p.sleepPending&&!st.sleepDeskLeases[p.place]&&!(st.diningChairLease?.owner===id&&st.diningChairLease.phase==='departing')&&settledForSleep(id,now);}).sort((a,b)=>{const priority=id=>{const p=st.chars[id];return Number.isFinite(p.sleepRestoredAt)?0:['wait','rest_desk','rest_lounge'].includes(p.activity)?1:p.activity==='work'?3:2;};return priority(a)-priority(b)||IDS.indexOf(a)-IDS.indexOf(b);});
  for(const id of yielded){
   const p=st.chars[id],place=p.place;
   const free=['window','window2','teletype','tv','tv2','tv3','tv4','tv5'].filter(x=>!takenBy(id).has(x));
   const spot=free.sort((a,b)=>travelSeconds(place,a)-travelSeconds(place,b))[0];if(!spot)continue;
   if(place==='diningChair'&&!st.diningChairLease)st.diningChairLease={owner:id,phase:'claimed'};
   if(applyDecision(id,'wait@'+spot,'fatigue_yield',null,null,false,true)===false)continue;
   if(place!=='diningChair')st.sleepDeskLeases[place]={owner:id,seq:p.seq,destination:spot,phase:'departing'};
   delete p.sleepRestoredAt;changed=true;break;
  }
 }
 return changed;
}
function entryOf(id, now) {                                          // his line in the world: who he is (for the page) + what he does now
  const P = PEOPLE[id], p = st.chars[id];
  return { name: P.name, glb: P.glb, chairBack: P.chairBack, home: P.home, ...(P.walkPolicy ? { walkPolicy: P.walkPolicy } : {}), ...(P.mouth ? { mouth: P.mouth } : {}), ...(P.phoneMouth ? { phoneMouth: P.phoneMouth } : {}), seq: p.seq, social: publicConversation(st,id) ? {...publicConversation(st,id,true), style:p.socialStyle||'neutral', styleRevision:p.socialStyleRevision||0} : null, sleep:p.sleep||null,sleepPending:p.sleepPending||null,finances:{...moneyContext(st,id),...performanceContext(st,id),...serviceContext(st,id),canWork:supports(id,'work'),livelihood:livelihoodContext(st,id,[],now)},relationships:publicRelations(st,id),reflection:st.reflection?.last?.actor===id?st.reflection.last:null,memory:p.memory.filter(x=>x.event==='conversation_finished'||x.event==='conversation_cancelled'||x.event==='sleep_started'||x.event==='sleep_finished').slice(-6), ...(p.entry || { from: target(p.place), cmd: null, at: now, label: labelOf(id, p.activity, p.place), activity: p.activity, source: 'start' }), state: stateNow(id, now) };
}
function composeWorld(now) {
  const chars = {}, chairs = { ...st.chairs };
  for (const id of Object.keys(st.chars)) if (PEOPLE[id]) { chars[id] = entryOf(id, now);
    for (const g of [chars[id].from, chars[id].cmd]) { const d = g?.seat && (PLACES[g.seat]?.desk||PLACES[g.seat]?.chair); if (d && st.chars[id].chairsAtStart?.[d] !== undefined) chairs[d] = st.chars[id].chairsAtStart[d]; } }   // a chair someone is moving: as at the start of his command
  const first = chars.columnist || Object.values(chars)[0], tv = st.tvMusic && now < st.tvMusic.until ? st.tvMusic : undefined;   // tv: the channel someone turned on, for every viewer
  return { seq: st.seq, modelRequests:st.modelRequests||null, trayDelivery:st.trayDelivery||null, chars, chairs, teletype: st.teletype, tv, editor: first, state: first?.state };   // editor/state: pages cached before 29.09 evening see the columnist alone
}
function decisionContext(id){const p=st.chars[id],pair=pairOf(st,id),partner=pair?.members.find(x=>x!==id),r=partner&&p.relationships?.[partner];return {hostessMode:st.hostessMode||'dance',economyRevision:st.economy.revision,actorSeq:p.seq,conversationId:pair?.id||null,partner:partner||null,intentRevision:currentIntent(pair,id).revision,relationRevision:r?.revision||0,lastSignal:r?.observations.at(-1)?.id||null,relations:Object.entries(p.relationships||{}).map(([other,r])=>[other,r.revision,r.observations.at(-1)?.id||null])};}
function applyDecision(id, action, source, confidence, expected=null, performanceDispatch=false,systemSleepDispatch=false,serviceDispatch=false) {
  if(expected){const current=decisionContext(id);if(!action.startsWith('money_'))expected={...expected,economyRevision:current.economyRevision};if(JSON.stringify(expected)!==JSON.stringify(current))return false;}
  const selectedAction=action,resolved=resolveMealAction(action,socialReady(id,Date.now())?executionCapabilities.actors[id].meals:null);if(!resolved)return false;action=resolved.action;
  const now = Date.now(), p = st.chars[id], [verb, variant] = action.split('@'), from = p.place;
  if(action==='continue'&&committedPerformance(st,id)){p.busyUntil=Math.max(p.busyUntil,now+15000);return true;}
  if(!performanceDispatch&&!systemSleepDispatch&&committedPerformance(st,id)&&!action.startsWith('money_performance_cancel@'))return false;
  const forcedSleep=systemSleepDispatch&&verb==='sleep_desk'&&!!p.sleepPending;
  const sleepWait=systemSleepDispatch&&verb==='wait'&&PLACES[variant]&&['fatigue_wait','fatigue_yield','fatigue_interrupt'].includes(source);
  if(p.sleepPending&&!forcedSleep&&!sleepWait)return false;
  if(Object.values(st.sleepDeskLeases).some(l=>l.owner===id))return false;
  if(st.sleepDeskLeases[variant]?.owner&&st.sleepDeskLeases[variant].owner!==id||variant==='phoneA'&&st.sleepDeskLeases.deskA)return false;
  if(!consumptionReady(id,verb,variant,executionCapabilities,now)||!supports(id,verb)||st.hostessMode==='drinks'&&verb.includes('dance'))return false;
  const agreedConversation=verb==='conversation'&&pairOf(st,id)?.assignments?.[id]?.place===variant;
  if(id==='heroine'&&verb!=='continue'&&!agreedConversation&&!performanceDispatch&&!serviceDispatch&&!forcedSleep&&!sleepWait&&!actions(id).some(a=>a.id===selectedAction))return false;
  if(id==='heroine'&&verb==='continue'&&(!supports(id,p.activity)||REG[p.activity]?.once))return false;
  // A missing renderer report is not a new physical command. Preserve replay origin and sequence.
  if(id==='heroine'&&verb==='continue'&&!socialReady(id,now)){p.busyUntil=Math.max(p.busyUntil,now+30000/FAST);return false;}
  if(variant==='diningChair'&&(!['rest_lounge','conversation','wait','sleep_desk','heroine_coffee'].includes(verb)||takenBy(id).has(variant)))return false;
  // Repeated choices during departure must preserve the in-flight source command.
  if(st.diningChairLease?.owner===id&&st.diningChairLease.phase==='departing')return verb==='continue';
  if(p.sleep)return false;
  if(verb==='sleep_desk'&&(!forcedSleep||!sleepTargets(id).includes(variant)||takenBy(id).has(variant)||!sleepReady(id,now)))return false;
  const pair=pairOf(st,id),partner=pair?.members.find(x=>x!==id),intent=currentIntent(pair,id),relation=partner&&p.relationships[partner];
  if(verb==='courtship_reply'){
    const o=courtshipActions(st,pair,id).find(x=>x.id===action);
    if(!o||!socialIntentReady(id,o.intent,now)||!chooseCourtship(st,pair,id,action,now,source,actorStyles(id)))return false;
    st.seq++;st.world=composeWorld(now);save();return true;
  }
  if(verb.startsWith('money_drinks_')){const ok=chooseService(st,id,action,now,source,serviceInput(now),a=>applyDecision(id,a,source,confidence,null,false,false,verb==='money_drinks_start'));if(!ok)return false;st.seq++;st.world=composeWorld(now);save();return true;}
  if(verb.startsWith('money_performance_')){
    const input=performanceInput(now);
    const ok=['money_performance_start','money_performance_watch'].includes(verb)?startPerformance(st,id,action,pair,now,source,input,a=>applyDecision(id,a,source,confidence,null,verb==='money_performance_start')):choosePerformance(st,id,action,pair,now,source,input);
    if(!ok)return false;st.seq++;st.world=composeWorld(now);save();return true;
  }
  if(verb.startsWith('money_')){
    if(!chooseMoney(st,id,action,pair,now,source))return false;
    st.seq++;st.world=composeWorld(now);save();return true;
  }
  if(verb==='relationship_appraise')return false; // retired: use dedicated, revision-checked reflection
  if(verb==='social_style'&&!socialStyleReady(id,variant,now))return false;
  if(verb==='read_wire'&&(variant!=='teletypeRead'||!socialReady(id,now)||executionCapabilities.actors[id].readingAvailable!==true||takenBy(id).has(variant)))return false;
  const invitePartner=verb==='social_invite'?variant:verb==='social_join'?st.social.deferred[variant]?.from:null;
  const proposed=invitePartner&&socialProposal(id,invitePartner,now);
  if(['social_invite','social_join'].includes(verb)&&!proposed)return false;
  if(verb==='social_intent'&&(!pair||pair.phase!=='active'||!socialIntentReady(id,variant,now)||!chooseIntent(st,pair,id,variant,now,source,actorStyles(id))))return false;
  if(verb==='social_relation'&&(!pair||pair.phase!=='active'||!chooseRelation(st,pair,id,variant,now,source)))return false;
  if(verb!=='continue'&&!canReplacePurchase(st,id,verb,now))return false;
  updatePersonNeeds(id, now);
  if(pair && !['continue','social_style','social_intent','social_relation','conversation'].includes(verb)) finishConversation(st,id,forcedSleep||source==='fatigue_wait'?'fatigue_sleep':source==='fatigue_yield'?'sleep_desk_yield':verb==='phone'?'phone_interrupt':'self_leave',source,now);                                       // include time spent waiting for the model before changing activity
  const before = Math.round(p.fatigue);
  let activity = p.activity, place = from;
  if (verb === 'continue') { /* same place, same activity */ }
  else if (verb === 'work_variant') { activity = 'work'; place = variant; }
  else if (verb === 'rest_desk') { activity = 'rest_desk'; place = variant; }
  else if (verb === 'rest_lounge') { activity = 'rest_lounge'; place = variant; }
  else if (verb === 'wait') { activity = 'wait'; place = variant; }
  else if(verb==='read_wire'){activity='read_wire';place=variant;}
  else if (verb === 'phone' && PLACES[variant]) { activity = 'phone'; place = variant; }
  else if (verb === 'invite' && PEOPLE[variant]) { activity = 'invite'; }
  else if (verb === 'social_invite' && PEOPLE[variant]) { p.beforeSocialInvite={purchasePending:!!st.economy.reservations[`${id}:${p.seq}`],activity:p.activity,activityUntil:p.activityUntil,busyUntil:p.busyUntil,since:p.since,arriveAt:p.arriveAt,entry:{...p.entry}};activity='invite'; }
  else if (verb === 'social_join' && st.social.deferred[variant]) { p.beforeSocialInvite={purchasePending:!!st.economy.reservations[`${id}:${p.seq}`],activity:p.activity,activityUntil:p.activityUntil,busyUntil:p.busyUntil,since:p.since,arriveAt:p.arriveAt,entry:{...p.entry}};activity='invite'; }
  else if (verb === 'conversation' && PLACES[variant]) {activity='conversation';place=variant;p.socialStyle='neutral';}
  else if(verb==='social_intent'){activity='conversation';p.socialStyle='neutral';}
  else if(verb==='social_relation'){activity='conversation';}
  else if (verb === 'social_style' && SOCIAL_STYLES.some(x=>x.id===variant) && pair) {activity='conversation';p.socialStyle=variant;p.socialStyleRevision=(p.socialStyleRevision||0)+1;pair.visualEvents??=[];pair.visualEvents.push({actor:id,style:variant,revision:p.socialStyleRevision,at:now,intent:intent.intent,intentRevision:intent.revision,relation:relation.stance,policyVersion:CONVERSATION_POLICY_VERSION});}
  else if (verb === 'social_leave') {activity=PLACES[from].kind==='desk'?'rest_desk':'wait';}
  else if(verb==='sleep_desk'){activity='sleep_desk';place=variant;}
  else if (REG[verb] && PLACES[variant]) { activity = verb; place = variant; }
  if(verb!=='continue'&&!canReplacePurchase(st,id,activity,now))return false;
  p.repeats = verb === 'continue' ? p.repeats + 1 : 0;
  const move = place !== from, travel = travelSeconds(from, place), dwell = (usesConsumption(id,activity)?CONSUMPTION[activity].duration:['smoke','smoke_coffee'].includes(activity)?60:activity==='lunch'&&resolved.meal&&executionCapabilities?.actors?.[id]?.mealDurations?.[resolved.meal]||rnd(dwellOf(activity))) * (REG[activity]?.once || ['wait','conversation'].includes(activity) ? 1 : Math.min(4, 1 + p.repeats)) / FAST;   // Waiting and conversation are reconsidered at their base interval; other needs keep evolving.
  p.memory.push({ action:selectedAction, at: hhmm(now), fatigue_before: before, source });
  p.memory = p.memory.slice(-12);
  p.chairsAtStart = {}; for (const pl of [from, place]) if (['desk','chair'].includes(PLACES[pl].kind)) {const k=PLACES[pl].desk||PLACES[pl].chair;p.chairsAtStart[k]=st.chairs[k]??CHAIR_REST;};
  if (move) { if (['desk','chair'].includes(PLACES[from].kind)) st.chairs[PLACES[from].desk||PLACES[from].chair] = CHAIR_TUCKED; if (['desk','chair'].includes(PLACES[place].kind)) st.chairs[PLACES[place].desk||PLACES[place].chair] = 0; }
  if (verb !== 'continue') p.since = now;
  p.place = place; p.activity = activity; p.activityUntil = p.busyUntil = now + (travel + dwell) * 1000; p.seq += 1; p.lastNeeds = now; st.seq += 1;
  if(verb!=='continue'){cancelPurchases(st,id,now);reservePurchase(st,id,activity,p.seq,now);}
  else {const oldKey=`${id}:${p.seq-1}`,reservation=st.economy.reservations[oldKey];if(reservation){delete st.economy.reservations[oldKey];reservation.seq=p.seq;st.economy.reservations[`${id}:${p.seq}`]=reservation;}}
  if(place==='diningChair')st.diningChairLease={owner:id,phase:'claimed'};
  else if(st.diningChairLease?.owner===id)st.diningChairLease.phase='departing';
  if (move) p.arriveAt = now + travel * 1000;
  if(activity==='sleep_desk'){startSleep(p,'sleep-'+id+'-'+p.seq,now,source,PLACES[place].kind==='chair'?'chair':'desk');p.busyUntil=now+60000;}
  if(id==='heroine'||['smoke','smoke_coffee'].includes(activity)||activity==='lunch'||activity==='sleep_desk'||activity==='read_wire'||p.executionGate || (pair&&!['continue','social_style','social_intent','social_relation','conversation'].includes(verb)))p.executionGate={seq:p.seq,requestedAt:now,expectedStart:Math.max(now,p.arriveAt||0)};
  if (REG[activity]?.effect === 'tv_music') { const from = now + (travel + 6) * 1000; st.tvMusic = { ch: 'jazz', at: now, from, until: from + TV_MUSIC_MIN * 60000 }; }   // the knob turns ~4 s after he crouches
  if (supports(id,'work') && activity === 'work' && !taskOf(id) && waiting()[0]) waiting()[0].by = id;       // he sits down to the next story on the wire
  if (verb === 'invite' && PEOPLE[variant]) startInvite(id, variant, now);
  if(verb==='social_invite'||verb==='social_join') {const o=verb==='social_invite'?variant:st.social.deferred[variant]?.from;startInvite(id,o,now);st.invite.kind='social';st.invite.proposal=structuredClone(proposed);st.invite.proposal.actorRevisions[id]=p.seq;if(verb==='social_join')delete st.social.deferred[variant];}
  if (verb === 'smoke' && st.deferredInvites[id]?.place === place) delete st.deferredInvites[id];
  const t = taskOf(id), talk = p.entry?.talk && now - p.entry.talk.at < 6000 ? p.entry.talk : undefined;   // the last words stay while their bubble runs
  p.entry = { talk, from: target(from), cmd: move ? target(place) : null, at: now, label: labelOf(id, activity, place), activity, source, confidence, action:selectedAction, meal:activity==='lunch'?resolved.meal:null, fatigue: before,
    story: activity === 'work' && t ? { id: t.id, en: WIRE_EN[t.title] || '' } : undefined };
  if ((verb === 'social_invite'||verb==='social_join') && st.invite) {p.entry.talk={at:now,to:st.invite.to,icon:'social',mark:'q'};p.busyUntil=now+60000;}
  if (verb === 'invite' && PEOPLE[variant]) { p.entry.talk = { at: now, to: variant, icon: 'smoke', mark: 'q' }; p.busyUntil = now + 60000; }   // his next step comes from the answer
  serviceCommandChanged(st,id,selectedAction,now);
  st.world = composeWorld(now);
  save();
  log(`${PEOPLE[id].name} #${p.seq} ${action} (${source}${confidence != null ? ' ' + Math.round(confidence * 100) + '%' : ''}) → ${p.entry.label}; fatigue ${before}; next in ${Math.round(travel + dwell)} s`);
}

// ---------- relay
// ---------- viewers move the scales on the page (relay /settings/needs → /director/nudges; owner 30.09):
// the value is set, and the person decides again soon (not before he arrives, not sooner than 8 s after his last choice — Jev is not flooded)
async function pollNudges(now, status) {
  if (st.nudgeBoot !== status.boot) { st.nudgeBoot = status.boot; st.nudgeSeq = 0; }               // the relay restarted: its count starts over
  if (!(status.nudge > (st.nudgeSeq || 0))) return;
  const r = await relay('/director/nudges?since=' + (st.nudgeSeq || 0)), moved = new Set();
  for (const n of r.items || []) {
    st.nudgeSeq = Math.max(st.nudgeSeq || 0, n.seq);
    if (r.now - n.at > 60000) continue;                                                              // an old command (nobody was listening): the viewer has moved on
    if(n.kind==='model_retry'){if(retryModelRequest(st,n.person,n.requestKind,n.requestId,now))moved.add(n.person);continue;}
    const p = st.chars[n.person]; if (!p || !PEOPLE[n.person] || typeof n.value !== 'number') continue;
    const v = Math.max(0, Math.min(100, n.value));
    if (n.need === 'fatigue') {p.fatigue=v;requireSleep(p,now);} else if (n.need in PEOPLE[n.person].grow) p.needs[n.need] = v; else continue;
    p.busyUntil = Math.min(p.busyUntil, Math.max(now, (p.arriveAt || 0) + 500, (p.since || 0) + 8000));
    log(`nudge: ${PEOPLE[n.person].name} · ${n.need} → ${v}`); moved.add(n.person);
  }
  if (moved.size) { st.world = composeWorld(now); save(); await relay('/director/world', st.world); }   // the panel shows the new values at once
  else save();
}

let worldSend=Promise.resolve();
async function relay(path, body) {
  const payload=body?JSON.stringify(path==='/director/world'?projectWorld(body):body):undefined;
  const request=async()=>{const r=await fetch(RELAY+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,...(body?{'Content-Type':'application/json'}:{})},body:payload});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'relay_http_'+r.status);return j;};
  if(path==='/director/world'){worldSend=worldSend.catch(()=>{}).then(request);return worldSend;}
  return request();
}

let executionCapabilities=null, executionSeq=0, heroineFeedbackRunning=null;
const SOCIAL_STYLES=[...JSON.parse(fs.readFileSync(new URL('./social-repertoire.json',import.meta.url),'utf8')).styles,...HER_SOCIAL_CATALOG.styles.filter(s=>s.entries.every(id=>HER_SOCIAL_CATALOG.entries.some(e=>e.id===id&&e.available)))];
function socialReady(id,now) {const a=executionCapabilities?.actors?.[id];return a?.loaded===true&&a.seq===st.chars[id]?.seq&&now-executionCapabilities.at<3500;}
function socialInput(a,b,now) {
 const actors={},capabilities={};for(const [id,p]of Object.entries(st.chars)){const x=executionCapabilities?.actors?.[id],fresh=socialReady(id,now);actors[id]={seq:p.seq,place:p.place,goal:p.entry?.cmd||p.entry?.from,activity:p.activity,mode:fresh?x.mode:null,seat:fresh?x.seat:null,x:x?.x,z:x?.z};capabilities[id]={profiles:fresh?x.profiles||[]:[]};}
 return {members:[a,b],actors,capabilities,reservations:[...st.steps.map(x=>({place:x.place,owner:x.id})),...Object.entries(st.sleepDeskLeases).map(([place,l])=>({place,owner:l.owner})),...(st.diningChairLease?[{place:'diningChair',owner:st.diningChairLease.owner}]:[])],intent:'auto'};
}
function socialProposal(a,b,now){if(committedPerformance(st,a)||committedPerformance(st,b))return null;if(Object.values(st.sleepDeskLeases).some(l=>[a,b].includes(l.owner)))return null;if(st.chars[a]?.sleep||st.chars[b]?.sleep||st.chars[a]?.sleepPending||st.chars[b]?.sleepPending)return null;if(st.diningChairLease?.phase==='departing'&&[a,b].includes(st.diningChairLease.owner))return null;if(!supports(a,'conversation')||!supports(b,'conversation'))return null;if(!st.chars[b]||pairOf(st,a)||pairOf(st,b)||st.steps.some(x=>x.id===a||x.id===b))return null;return conversationPlaceProposals(socialInput(a,b,now)).proposals.find(p=>p.supported)||null;}
function socialFree(a,b,now){return !!socialProposal(a,b,now);}
function socialPose(pair,id){const p=pair?.assignments?.[id]?.playbackProfile||'stand';return p==='stand'?'standing':p;}
function actorStyles(id){return executionCapabilities?.actors?.[id]?.styles|| (id==='heroine'?[]:executionCapabilities?.styles)||[];}
function socialIntentReady(id,intent,now){const pair=pairOf(st,id);return !!pair&&socialReady(id,now)&&availableIntents(st,pair,id).some(x=>x.id===intent)&&actorStyles(id).includes(expressionStyle(pair,id,intent,actorStyles(id)));}
function socialStyleReady(id,style,now){const pair=pairOf(st,id),partner=pair?.members.find(x=>x!==id),intent=currentIntent(pair,id),r=partner&&st.chars[id].relationships[partner];return !!pair&&pair.phase==='active'&&socialReady(id,now)&&(intent.intent!=='flirt'||flirtPermitted(r,partner))&&actorStyles(id).includes(style)&&SOCIAL_STYLES.some(x=>x.id===style)&&styleAllowed(style,intent.intent,r.stance,socialPose(pair,id),{actorKind:id==='heroine'?'heroine-her':'motus',flirtAllowed:true});}
function proposalText(proposal){return Object.values(proposal.assignments).map(a=>PEOPLE[a.actor].name+': '+PLACES[a.place].name+(a.preserveSeated?' (сохраняет посадку)':'')).join('; ');}
function socialActions(id) {
  const now=Date.now(),p=st.chars[id],pair=pairOf(st,id),out=[];
  if(pair) {out.push({id:'social_leave',description:'Завершить своё участие в разговоре; собеседник узнает о твоём уходе'});
    if(pair.phase==='active'){
      const partner=pair.members.find(x=>x!==id),relation=p.relationships[partner],intent=currentIntent(pair,id);
      for(const option of courtshipActions(st,pair,id))if(socialIntentReady(id,option.intent,now))out.push({id:option.id,description:option.description});
      for(const option of availableIntents(st,pair,id))if(socialIntentReady(id,option.id,now)&&option.id!==intent.intent)out.push({id:'social_intent@'+option.id,description:'Своё намерение: '+INTENT_TEXT[option.id]+'. Основание: '+JSON.stringify(option.basis)+'. Это не чужие мысли и не тема разговора.'});
      for(const x of SOCIAL_STYLES)if(socialStyleReady(id,x.id,now))out.push({id:'social_style@'+x.id,description:'Выразить текущее собственное намерение «'+INTENT_TEXT[intent.intent]+'»: '+x.title+' (полный диапазон 1×). Отношение: '+RELATION_TEXT[relation.stance]+'.'});
    }return out;}
  for(const [o,q] of Object.entries(st.chars))if(o!==id&&!st.invite&&!busyWith(p)&&!busyWith(q)&&now>=(p.arriveAt||0)&&now>=(q.arriveAt||0)&&socialFree(id,o,now))out.push({id:'social_invite@'+o,description:'Предложить '+PEOPLE[o].name.toLowerCase()+'у поговорить: '+proposalText(socialProposal(id,o,now))+'. Он независимо согласится, откажет или отложит; приглашение и путь не снижают общение.'});
  for(const [key,v] of Object.entries(st.social.deferred))if(v.to===id&&now>=v.notBefore&&now<v.expires&&socialFree(id,v.from,now)&&!busyWith(st.chars[v.from])&&!st.invite)out.push({id:'social_join@'+key,description:'Вернуться к отложенному предложению поговорить с '+PEOPLE[v.from].name.toLowerCase()+'ом: он ещё раз решит сам.'});
  return out;
}
async function answerSocialInvite(now) {
  const v=st.invite,a=v.from,b=v.to,pa=st.chars[a],pb=st.chars[b],key='invitation-'+v.n;
  const avail=['accept','decline','defer'].map(answer=>({id:answer+':'+key,description:{accept:'Согласиться поговорить с '+PEOPLE[a].name+': '+(v.proposal?proposalText(v.proposal):'места не подтверждены')+'. Сначала исполнить указанный подход/посадку; сохранить указанную посадку.',decline:'Отказаться и продолжать своё занятие',defer:'Отложить: продолжать занятие, затем самостоятельно вернуться к предложению'}[answer]}));
  const diagnosticId=newTraceId();
  trace(diagnosticId,'choice_started',{actorId:b,revision:st.seq,choiceKinds:offeredKinds(avail),optionCount:avail.length,offered:avail});
  inviteNote[b]=PEOPLE[a].name+' предлагает поговорить с тобой';let d=null,source='jev';
  if(process.env.NO_JEV||st.jevToday>=DAILY){requestFailed(st,b,'physical',diagnosticId,new Error(process.env.NO_JEV?'model_disabled':'daily_limit'),Date.now());await publishModelStatus();delete inviteNote[b];return;}else try{d=await askJev(b,avail,null,diagnosticId);st.jevToday++;}catch{delete inviteNote[b];trace(diagnosticId,'application',{actorId:b,source:'none',status:'request_failed',physicalExecution:'existing_command_preserved'});return;}
  delete inviteNote[b];if(st.invite!==v||pa.sleepPending||pb.sleepPending||pa.sleep||pb.sleep){trace(diagnosticId,'application',{actorId:b,action:d?.action??null,source,status:'stale_rejected',revisionAfter:st.seq,physicalExecution:'not_confirmed_by_response'});return;}if(!d||!avail.some(x=>x.id===d.action)){source='rule';d={action:((pb.needs.social??0)>=45?'accept:':'decline:')+key};}
  const answer=d.action.split(':')[0];let t=Date.now();
  for(const id of [a,b]){const p=st.chars[id];p.memory.push({event:id===a?'social_invitation':'social_invited',partner:id===a?b:a,answer,source,at:t});p.memory=p.memory.slice(-12);}
  talkOn(pb,{at:t,to:a,icon:'social',mark:{accept:'yes',decline:'no',defer:'later'}[answer]});
  st.invite=null;
  if(answer==='accept') {try{const r=await relay('/director/execution?since='+executionSeq);executionCapabilities=r.capabilities||null;}catch{executionCapabilities=null;}}
  t=Date.now();
  const valid=answer==='accept'&&v.proposal&&revalidateConversationPlace(v.proposal,socialInput(a,b,t));
  if(valid?.ok&&!pairOf(st,a)&&!pairOf(st,b)) {
    const proposal=valid.proposal,places=Object.fromEntries(Object.entries(proposal.assignments).map(([id,x])=>[id,x.place])),pair=beginConversation(st,a,b,places,t,source);
    if(pair){pair.assignments=structuredClone(proposal.assignments);pair.placeKind=proposal.kind;delete pa.beforeSocialInvite;applyDecision(a,'conversation@'+places[a],'invitation',null);applyDecision(b,'conversation@'+places[b],'invitation',null);}
  }else {
    if(answer==='defer')st.social.deferred[key]={from:a,to:b,notBefore:t+16000,expires:t+600000};
    updatePersonNeeds(a,t);const prior=pa.beforeSocialInvite;
    if(prior && typeof prior==='object'){Object.assign(pa,prior);pa.busyUntil=Math.max(t+8000,prior.busyUntil);}
    else {pa.activity='wait';pa.activityUntil=t;pa.busyUntil=t+8000;pa.entry={...pa.entry,activity:'wait'};}
    delete pa.beforeSocialInvite;delete pa.purchasePending;pa.seq++;rebindExecutionGate(pa,t);
    if(prior?.purchasePending&&!reservePurchase(st,a,pa.activity,pa.seq,t)){pa.activity='wait';pa.busyUntil=t;pa.entry={...pa.entry,activity:'wait',label:labelOf(a,'wait',pa.place)};}
    if(answer==='accept'){pa.memory.push({event:'conversation_cancelled',partner:b,source:'executor',reason:'place_or_executor_unavailable',participatingSeconds:0,at:t});}
  }
  trace(diagnosticId,'application',{actorId:b,action:d.action,source,status:answer==='accept'?(pairOf(st,b)?'conversation_commands_created':'place_or_executor_rejected'):'invitation_response_recorded',revisionAfter:st.seq+1,physicalExecution:'not_confirmed_by_response'});
  if(answer==='accept'&&pairOf(st,b))for(const id of [a,b])traceCommands.set(id,{traceId:diagnosticId,seq:st.chars[id].seq,signature:null});
  st.seq++;st.world=composeWorld(t);save();log('social invitation',a,b,answer,source);
}
function releaseDiningChair(now){
 const lease=st.diningChairLease,p=lease&&st.chars[lease.owner],a=lease&&executionCapabilities?.actors?.[lease.owner];
 if(lease?.phase!=='departing'||!p||p.place==='diningChair'||!settledForSleep(lease.owner,now)||a.executing!==true||a.diningChairClear!==true)return false;
 // This matching witness has completed the departure at the current destination.
 // Normalize its replay origin before another actor can move the same shared chair.
 p.entry={...p.entry,from:target(p.place),cmd:null,at:now};delete p.chairsAtStart.D;delete st.diningChairLease;return true;
}
// A restored invitation command has a new revision. Await its own receipt;
// the superseded command can never acknowledge it, even after a restart.
function rebindExecutionGate(p,now){
 if(!p.executionGate||p.executionGate.seq===p.seq)return false;
 p.executionGate={seq:p.seq,requestedAt:now,expectedStart:Math.max(now,p.arriveAt||0)};
 return true;
}
const traceCommands=new Map();
async function pollParticipation(now,status) {
  if(!status.execution){resetConsumption(st);resetWorkWitness(st);executionCapabilities=null;teletypeDirty=true;return;}
  if(['dance','drinks'].includes(status.hostessMode)&&st.hostessMode!==status.hostessMode){st.hostessMode=status.hostessMode;st.seq++;teletypeDirty=true;}
  try {if(st.executionBoot!==status.boot){executionSeq=0;for(const p of Object.values(st.chars))if(p.consumption){p.consumption.observation=-1;p.consumption.at=null;}st.executionBoot=status.boot;pauseParticipation(st,now);for(const p of Object.values(st.chars))if(p.sleep){p.sleep.lastObservation=0;p.sleep.lastSampleAt=null;}for(const p of Object.values(st.social.pairs))p.reportSeq=0;}
    const r=await relay('/director/execution?since='+executionSeq);executionCapabilities=r.capabilities||null;now=Date.now();
    captureChronicle(danceObserver.observe(st,executionCapabilities,now,FAST));
    let gateChanged=clearDeliveredService(st,executionCapabilities,PLACES,now);gateChanged=releaseDiningChair(now)||gateChanged;gateChanged=releaseSleepDesks(now)||gateChanged; // Settle actual receipts before sleep can cancel an unfinished command.
    for(const p of Object.values(st.chars))if(rebindExecutionGate(p,now))gateChanged=true;
    for(const [id,p]of Object.entries(st.chars))if(usesConsumption(id,p.activity)&&acceptConsumption(p,executionCapabilities?.actors?.[id],executionCapabilities?.at,now,REG[p.activity]?.needs||{},rateOf(id,p.activity))>0)gateChanged=true;
    if(st.economy.config.enabled){const revision=st.economy.revision;observePerformances(st,executionCapabilities,now);observeServices(st,executionCapabilities,now);confirmPurchases(st,executionCapabilities,now);for(const id of IDS)updatePersonNeeds(id,now,workInterval(st,id,executionCapabilities,now));gateChanged=gateChanged||revision!==st.economy.revision;}
    for(const [id,p]of Object.entries(st.chars)){const a=executionCapabilities?.actors?.[id];if((id==='heroine'||['smoke','smoke_coffee'].includes(p.activity)||p.activity==='lunch')&&a?.loaded&&a.seq===p.seq&&a.activity===p.activity&&executionCapabilities&&now-executionCapabilities.at<3500&&a.executionEnd?.seq===p.seq&&a.executionEnd.outcome==='completed'&&(p.activity!=='heroine_serve'||!st.economy.services.some(s=>s.id===p.entry?.service?.id&&s.status==='running'))&&(['smoke','smoke_coffee'].includes(p.activity)||p.activity==='lunch'||p.activity.startsWith('heroine_')||usesConsumption(id,p.activity))&&['idle','seated'].includes(a.mode)&&(!p.place.startsWith('bench')||a.seat===p.place)){
      updatePersonNeeds(id,now);p.lastExecution={seq:p.seq,activity:p.activity,outcome:'completed',replayed:a.executionEnd.replayed===true,receivedAt:now};
      if(p.activity==='heroine_serve'&&a.serviceWitness?.trayOnTable===true){p.place='trayTable';st.trayDelivery={id:p.entry.service.id,recipients:p.entry.service.recipients,poured:a.serviceWitness.poured,at:now};}
      p.activity='wait';p.since=p.arriveAt=p.activityUntil=p.busyUntil=now;delete p.executionGate;p.seq++;
      p.entry={from:target(p.place),cmd:null,at:now,label:labelOf(id,'wait',p.place),activity:'wait',source:'executor_completion',fatigue:p.fatigue};gateChanged=true;
    }else if(p.executionGate && a?.loaded===true && a.seq===p.seq && a.seq===p.executionGate.seq && a.activity===p.activity && executionCapabilities.at<=now && now-executionCapabilities.at<3500 && (a.executing===true||(p.activity==='conversation'&&a.conversationReady&&a.conversationId===pairOf(st,id)?.id))){updatePersonNeeds(id,now);const delay=Math.max(0,now-p.executionGate.expectedStart);p.activityUntil+=delay;p.busyUntil=p.activityUntil;p.arriveAt=now;delete p.executionGate;gateChanged=true;}}
    if(st.chars.heroine){const running=activityRunning('heroine',now);if(running!==heroineFeedbackRunning){updatePersonNeeds('heroine',now);heroineFeedbackRunning=running;gateChanged=true;}}
    const before=JSON.stringify(st.social);for(const report of r.items||[]){executionSeq=Math.max(executionSeq,report.seq);for(const id of Object.keys(report.actors||{}))if(st.chars[id])updatePersonNeeds(id,now);applyParticipation(st,report,now,FAST);}
    for(const [id,p]of Object.entries(st.chars)){const was=p.sleep;if(was&&executionCapabilities&&now-executionCapabilities.at<3500&&acceptSleepSample(p,executionCapabilities.actors?.[id],now,FAST,executionCapabilities.at)){gateChanged=true;if(!p.sleep){p.activity=PLACES[p.place].kind==='chair'?'rest_lounge':'rest_desk';p.since=now;p.busyUntil=now;p.arriveAt=now;delete p.executionGate;p.seq++;p.entry={from:target(p.place),cmd:null,at:now,label:(id==='heroine'?'проснулась ':'проснулся ')+sleepPlaceText(p.place),activity:p.activity,source:'sleep_executor',fatigue:p.fatigue};}}}
    gateChanged=mandatorySleep(now)||gateChanged;
    gateChanged=advancePerformances(st,now,performanceInput(now),(id,a)=>applyDecision(id,a,'performance_executor',null,null,true))||gateChanged;
    for(const [id,command]of traceCommands){
      const actor=executionCapabilities?.actors?.[id];
      if(!actor||actor.loaded!==true||actor.seq!==command.seq||!Number.isFinite(executionCapabilities.at)||executionCapabilities.at>now||now-executionCapabilities.at>=3500)continue;
      const observed={actorId:id,actorSeq:actor.seq,activity:actor.activity,executing:actor.executing===true,observedAt:now};
      const signature=JSON.stringify([actor.seq,actor.activity,actor.executing]);
      if(command.signature!==signature){trace(command.traceId,'execution_observed',observed);command.signature=signature;}
    }
    expireParticipation(st,now);
    if(gateChanged||before!==JSON.stringify(st.social)){st.seq++;st.world=composeWorld(now);save();await relay('/director/world',st.world);}
  }catch{resetConsumption(st);executionCapabilities=null;teletypeDirty=true;}
}

let collecting=false;
async function collectParticipation(status=null) {
  if(collecting)return;collecting=true;
  try {status??=await relay('/director/status');if(!status.viewers){resetConsumption(st);resetWorkWitness(st);pauseParticipation(st,Date.now());return;}await pollParticipation(Date.now(),status);}
  catch {resetConsumption(st);executionCapabilities=null;}finally{collecting=false;}
}
let busy = false, lastViewers = -1, warned = {}, turn = 0;
async function tick() {
  if (busy) return; busy = true;
  try {
    const now = Date.now();
    const moneyRevision=st.economy.revision;tickEconomy(st,now);tickPerformances(st,now);tickServices(st,now);if(moneyRevision!==st.economy.revision){st.seq++;teletypeDirty=true;}
    if (st.day !== new Date().toDateString()) { st.day = new Date().toDateString(); st.jevToday = 0; }
    let status;
    try { status = await relay('/director/status'); if (warned.relay) { log('relay back'); warned.relay = false; } }
    catch (e) { resetConsumption(st);if (!warned.relay) { log('relay unreachable:', e.message); warned.relay = true; } for (const p of Object.values(st.chars)) p.lastNeeds = now; st.lastWire = now; pauseParticipation(st,now);return; }
    await cityClock(now);
    if (status.viewers) tickNeeds(now); else { for (const p of Object.values(st.chars)) p.lastNeeds = now; st.lastWire = now; }   // the newsroom's time runs only while someone watches
    try { await pollNudges(now, status); } catch (e) { log('nudges:', e.message); }
    if (!st.world?.chars || status.seq !== st.world.seq || teletypeDirty) { teletypeDirty = false; st.world = composeWorld(now); save(); await relay('/director/world', st.world); }   // relay restarted, a story came in, someone took one
    if (status.viewers !== lastViewers) { log('viewers', status.viewers); lastViewers = status.viewers; }
    if (!status.viewers) {resetConsumption(st);resetWorkWitness(st);pauseParticipation(st,now);return;}
    await collectParticipation(status);
    if(mandatorySleep(Date.now())){st.seq++;st.world=composeWorld(Date.now());save();await relay('/director/world',st.world);}
    ownerCalls(now);                                                 // the owner's call rings once someone watches
    if (stepsDue(now)) { await relay('/director/world', st.world); return; }
    if (st.invite && now >= st.invite.answerAt && requestAllowed(st,st.invite.to,'physical',now)) { await answerInvite(now); await relay('/director/world', st.world); return; }
    if (st.invite && now - st.invite.at > 60000) st.invite = null;     // never stuck
    // one decision per tick, the people in turn; they may walk at the same time — the page walks them together (crowd, keep right; owner 30.09)
    const ids = Object.keys(st.chars).filter((k) => PEOPLE[k] && !(st.invite && (k === st.invite.from || k === st.invite.to)) && !st.steps.some((x) => x.id === k));
    let id = null, nextTurn = turn; for (let k = 0; k < ids.length; k++) { const c = ids[(turn + k) % ids.length]; if (requestAllowed(st,c,'physical',now)&&!st.chars[c].sleep&&!st.chars[c].sleepPending&&!Object.values(st.sleepDeskLeases).some(l=>l.owner===c)&&!(st.diningChairLease?.owner===c&&st.diningChairLease.phase==='departing')&&now >= st.chars[c].busyUntil) { id = c; nextTurn = (turn + k + 1) % ids.length; break; } }
    if((!id||!st.reflection?.yieldPhysical)&&await reflectRelationships(now)){st.reflection.yieldPhysical=true;save();await relay('/director/world',st.world);return;}
    if (!id) return;
    turn=nextTurn;
    if(st.reflection)st.reflection.yieldPhysical=false;
    const allAvailable=actions(id),avail = urgentOnly(id, allAvailable),diagnosticId=newTraceId();
    trace(diagnosticId,'choice_started',{actorId:id,revision:st.seq,actorSeq:st.chars[id].seq,
      choiceKinds:offeredKinds(avail),optionCount:avail.length,offered:avail,beforeUrgentFilter:allAvailable});
    const expectedDecision=decisionContext(id);
    let d = null, source = 'jev';
    if (process.env.NO_JEV || st.jevToday >= DAILY) {requestFailed(st,id,'physical',diagnosticId,new Error(process.env.NO_JEV?'model_disabled':'daily_limit'),Date.now());await publishModelStatus();return;}
    else {
      try { d = await askJev(id, avail, null, diagnosticId); st.jevToday += 1; if (warned.jev) { log('Jev back'); warned.jev = false; } }
      catch (e) {trace(diagnosticId,'application',{actorId:id,source:'none',status:'request_failed',physicalExecution:'existing_command_preserved'});log('Jev request unavailable; existing command preserved');return;}
    }
    if (!d || !avail.some((a) => a.id === d.action)) { source = 'rule'; d = fallback(id, avail); }
    const beforeApply=decisionContext(id),beforeSeq=st.seq,beforeActorSeq=st.chars[id].seq;
    const applied=applyDecision(id, d.action, source, d.confidence ?? null, expectedDecision);
    const effectiveExpected=d.action.startsWith('money_')?expectedDecision:{...expectedDecision,economyRevision:beforeApply.economyRevision};
    const stale=applied===false&&JSON.stringify(effectiveExpected)!==JSON.stringify(beforeApply);
    trace(diagnosticId,'application',{actorId:id,action:d.action,source,confidence:d.confidence??null,
      fallbackReason:source==='rule'?(process.env.NO_JEV?'NO_JEV':st.jevToday>=DAILY?'daily_limit':'request_failed_or_invalid_action'):null,
      status:stale?'stale_rejected':applied===false?'precondition_rejected':st.seq!==beforeSeq?'applied':'no_state_change',
      expected:expectedDecision,before:beforeApply,revisionAfter:st.seq,actorSeq:st.chars[id].seq,
      entry:st.chars[id].entry,activity:st.chars[id].activity,place:st.chars[id].place,
      physicalExecution:'not_confirmed_by_application'});
    if(st.chars[id].seq!==beforeActorSeq)traceCommands.set(id,{traceId:diagnosticId,seq:st.chars[id].seq,signature:null});
    await relay('/director/world', st.world);
  } catch (e) { log('tick error', e.message); }
  finally { busy = false; }
}
if (!TOKEN) { console.error('DIRECTOR_TOKEN is required'); process.exit(1); }
trace(newTraceId(),'diagnostics_enabled',{actors:IDS});
log(`director: relay ${RELAY}, Jev ${JEV}, state ${STATE}, people ${IDS.join(', ')}`);
save(); tick(); setInterval(tick, 2000);setInterval(collectParticipation,1000);setInterval(deliverChronicle,3000);
process.on('SIGTERM', () => { save(); if (sid) session('pause').catch(() => {}).finally(() => process.exit(0)); else process.exit(0); });
