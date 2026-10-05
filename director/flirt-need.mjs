// One canonical need. Encounters are factual history, not a second attraction meter.
export const FLIRT = Object.freeze({start:15,grow:.35,drunkGrow:1.4,relief:6,spark:8,showRelief:35,recentMinutes:10,financialSpark:60,financialGrow:4});
const clamp=n=>Math.max(0,Math.min(100,Number.isFinite(n)?n:0));
export function financialFlirtPressure(availableCents,mealCents){
 if(!Number.isFinite(availableCents)||!Number.isFinite(mealCents)||mealCents<=0)return 0;
 const shortage=Math.max(0,Math.min(1,1-availableCents/mealCents));return shortage*shortage;
}
export function ensureFlirt(p){
 p.needs??={};p.needs.flirt??=FLIRT.start;
 p.flirtExperience??={minutes:0,encounters:[],shows:[]};
 return p.flirtExperience;
}
export function flirtGrowth(p,personality={},financialPressure=0){
 if(p.sleep||p.sleepPending)return 0;
 const temperament=.75+.5*(personality.sociability??.5);
 return FLIRT.grow*temperament+FLIRT.drunkGrow*clamp(p.needs?.drunk??0)/100+FLIRT.financialGrow*Math.max(0,Math.min(1,financialPressure));
}
export function advanceFlirtNeed(p,minutes,personality={},drunkRate=0,financialPressure=0){
 const experience=ensureFlirt(p);if(minutes<0||!Number.isFinite(minutes))return;
 advanceFlirtClock(p,minutes);
 if(p.sleep||p.sleepPending)return;
 const pressure=Number.isFinite(financialPressure)?Math.max(0,Math.min(1,financialPressure)):0;
 // Remember the previous wallet-derived pressure, not another need. A stable empty
 // wallet adds no repeated impulse on ticks, snapshots or reloads.
 const rise=Math.max(0,pressure-(experience.lastFinancialPressure??0));
 p.needs.flirt=clamp(p.needs.flirt+FLIRT.financialSpark*rise);
 experience.lastFinancialPressure=pressure;
 const drunk=clamp(p.needs.drunk??0),rate=Number.isFinite(drunkRate)?drunkRate:0;
 // Integrate linear sobering exactly, including reaching zero, for equal simulated time.
 const edge=rate<0?-drunk/rate:rate>0?(100-drunk)/rate:minutes;
 const linear=Math.min(minutes,Math.max(0,edge));
 const integral=(drunk+clamp(drunk+rate*linear))*linear/2+clamp(drunk+rate*linear)*(minutes-linear);
 const base=flirtGrowth({...p,needs:{drunk:0}},personality,pressure);
 p.needs.flirt=clamp(p.needs.flirt+base*minutes+FLIRT.drunkGrow*integral/100);
}
const recency=(f,e)=>Math.max(0,1-(f.minutes-(e.lastMinute??e.minute))/FLIRT.recentMinutes);
export function advanceFlirtClock(p,minutes){
 const f=ensureFlirt(p);if(!Number.isFinite(minutes)||minutes<=0)return;
 f.minutes+=minutes;
 f.encounters=f.encounters.filter(e=>f.minutes-e.lastMinute<FLIRT.recentMinutes).slice(-32);
 f.shows=f.shows.filter(e=>f.minutes-e.minute<FLIRT.recentMinutes).slice(-32);
}
function mutual(st,pair){
 if(pair.members.length!==2)return false;
 return pair.members.every(id=>{
  const partner=pair.members.find(x=>x!==id),intent=pair.intents?.[id];
  const event=pair.intentEvents?.find(e=>e.actor===id&&e.revision===intent?.revision&&e.intent==='flirt'&&Number.isFinite(e.confirmedAt));
  const c=st.chars[id]?.relationships?.[partner]?.courtship;
  return intent?.intent==='flirt'&&event&&!c?.boundaries?.[partner]&&!c?.boundaries?.[id];
 });
}
// Called only inside social-core's fresh, matching, joint renderer receipt path.
export function satisfyMutualFlirt(st,pair,seconds){
 if(!(seconds>0)||!Number.isFinite(seconds)||pair.phase!=='active'||!mutual(st,pair))return false;
 pair.flirtEpisodes??={};
 for(const id of pair.members){
  const p=st.chars[id],partner=pair.members.find(x=>x!==id),f=ensureFlirt(p);
  let episode=pair.flirtEpisodes[id];
  if(!episode){
   const repeats=f.encounters.filter(e=>e.partner===partner).reduce((n,e)=>n+recency(f,e),0);
   episode=pair.flirtEpisodes[id]={before:p.needs.flirt,seconds:0,relief:0,spark:FLIRT.spark/(1+repeats),repeats};
   p.needs.flirt=clamp(p.needs.flirt+episode.spark);
   f.encounters.push({id:pair.id,partner,lastMinute:f.minutes});
  }
  const encounter=f.encounters.find(e=>e.id===pair.id);
  if(encounter)encounter.lastMinute=f.minutes;
  else f.encounters.push({id:pair.id,partner,lastMinute:f.minutes});
  episode.seconds+=seconds;
  // Diminishing returns depend on actual participation, never number of gestures.
  const factor=1/(1+episode.repeats);
  const relief=FLIRT.relief*seconds/60*factor;
  const before=p.needs.flirt;p.needs.flirt=clamp(before-relief);episode.relief+=before-p.needs.flirt;
 }
 return true;
}
// Called only after the complete witnessed performance has settled successfully.
export function satisfyFlirtPerformance(st,contract,now){
 if(contract.status!=='paid'||contract.performer!=='heroine'||!st.chars[contract.payer]||!Number.isFinite(now))return false;
 if(contract.flirtSatisfied)return false;
 const p=st.chars[contract.payer],f=ensureFlirt(p),repeats=f.shows.filter(e=>e.performer===contract.performer).reduce((n,e)=>n+recency(f,e),0);
 const before=p.needs.flirt;p.needs.flirt=clamp(before-FLIRT.showRelief/(1+repeats));
 contract.flirtSatisfied=true;
 f.shows.push({id:contract.id,performer:contract.performer,minute:f.minutes,before,after:p.needs.flirt});return true;
}
export function flirtContext(st,id){
 const p=st.chars[id],f=ensureFlirt(p);
 const pair=Object.values(st.social?.pairs||{}).find(c=>c.phase==='active'&&c.members.includes(id));
 return {
  need:'flirt',value:p.needs.flirt,
  ...(pair?{contactMeaning:'Обычный дружеский разговор не удовлетворяет флирт и не приносит доход. Продолжение сохраняет текущее намерение. Можно уйти к другому доступному контакту; отказы не обходить. Заказ выступления — отдельное рабочее предложение, без романтического согласия.'}:{}),
  recentMutual:f.encounters.map(e=>({partner:e.partner,conversationId:e.id,minutesAgo:+Math.max(0,f.minutes-e.lastMinute).toFixed(2)})),
  recentShows:f.shows.map(e=>({performer:e.performer,contractId:e.id,minutesAgo:+Math.max(0,f.minutes-e.minute).toFixed(2)})),
  meaning:'Одна потребность: личный флирт и просмотр платного выступления. Полный просмотр снижает её на 35; недавние повторы слабее. Взаимный флирт сначала подогревает интерес, затем удовлетворяет при фактическом участии. Актуальность взаимности проходит; долговременные отношения оцениваешь сам.',
  choice:'Учитывай характер, отношения, усталость, дела, цену, свой бюджет, недавний просмотр и фактические отказы. Высокая потребность не обязывает покупать; чужие чувства неизвестны.',
  alcohol:'Фактическое опьянение ускоряет рост; предложение/оплата угощения не меняют опьянение и не создают взаимность.',
  ...(id==='heroine'?{financialMotive:'Когда доступных денег меньше цены одной порции еды, твоя единая потребность во флирте резко усиливается как мотив привлечь заказчиков; у нуля эффект максимален. Кошелёк и цена уже указаны в self.finances. Это не означает личную влюблённость или согласие клиента.',initiative:st.economy?.config.enabled&&st.hostessMode!=='drinks'?'Для заработка выбирай свободного коллегу с canAffordPerformance=true в self.finances.livelihood.potentialCustomers: адресный флирт, его реальная реакция, предложение танца. Точный чужой баланс и потребности неизвестны. Платёжеспособность не обещает согласия; отказы и границы сохраняют силу. Личный флирт с другими не считай заработком. При дружеском ответе не повторяй романтическую попытку; можешь закончить разговор и обратиться к другому доступному коллеге. Для нового коммерческого предложения предварительный разговор не обязателен. Необязательно ждать голода. Угощение оплачиваешь сама; порядок действий выбирай самостоятельно.':st.economy?.config.enabled&&st.hostessMode==='drinks'?'В режиме напитков заработок — доставка по 1 USD каждому согласившемуся гостю. Доступные действия и условия указаны в self.finances.livelihood; платёжеспособность для танцев здесь не применяется. Личный флирт выбирай с учётом ответов и границ.':'Общение и личный флирт выбирай самостоятельно с учётом подтверждённых ответов и границ собеседника.'}:{}),
 };
}
