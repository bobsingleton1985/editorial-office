export const OUTFITS=Object.freeze([
 {
  "id": "red",
  "label": "Красное — исходное",
  "description": "Красное платье с открытыми плечами."
 },
 {
  "id": "dress01",
  "label": "№1 — флаппер",
  "description": "Флаппер."
 },
 {
  "id": "dress02",
  "label": "№2 — бэби-долл с вязкой",
  "description": "Бэби-долл с вязкой."
 },
 {
  "id": "dress03",
  "label": "№3 — халтер с платками",
  "description": "Халтер с платками."
 },
 {
  "id": "dress04",
  "label": "№4 — стилизованное ципао",
  "description": "Стилизованное ципао."
 },
 {
  "id": "dress05",
  "label": "№5 — с воланом",
  "description": "С воланом."
 },
 {
  "id": "dress06",
  "label": "№6 — кожаное с бахромой",
  "description": "Кожаное с бахромой."
 },
 {
  "id": "dress07",
  "label": "№7 — открытые плечи с бахромой",
  "description": "Открытые плечи с бахромой."
 },
 {
  "id": "dress08",
  "label": "№8 — халтер до колен",
  "description": "Халтер до колен."
 },
 {
  "id": "dress09",
  "label": "№9 — халтер мини",
  "description": "Халтер мини."
 },
 {
  "id": "dress10",
  "label": "№10 — платье 60-х",
  "description": "Платье 60-х."
 },
 {
  "id": "dress11",
  "label": "№11 — модное платье 1",
  "description": "Модное платье 1."
 },
 {
  "id": "dress12",
  "label": "№12 — модное платье 2",
  "description": "Модное платье 2."
 },
 {
  "id": "dress13",
  "label": "№13 — тёмное с кружевом",
  "description": "Тёмное с кружевом."
 },
 {
  "id": "dress14",
  "label": "№14 — бирюзовое на бретелях",
  "description": "Бирюзовое на бретелях."
 },
 {
  "id": "dress15",
  "label": "№15 — белое с золотым поясом",
  "description": "Белое с золотым поясом."
 },
 {
  "id": "dress16",
  "label": "№16 — чёрное с короткой юбкой",
  "description": "Чёрное с короткой юбкой."
 },
 {
  "id": "dress17",
  "label": "№17 — фиолетовое с открытыми плечами",
  "description": "Фиолетовое с открытыми плечами."
 },
 {
  "id": "dress18",
  "label": "№18 — бирюзовое с чёрным халтером",
  "description": "Бирюзовое с чёрным халтером."
 },
 {
  "id": "dress19",
  "label": "№19 — шахматный верх и чёрная юбка",
  "description": "Шахматный верх и чёрная юбка."
 },
 {
  "id": "dress20",
  "label": "№20 — красное с перекрёстными бретелями",
  "description": "Красное с перекрёстными бретелями."
 },
 {
  "id": "dress21",
  "label": "№21 — чёрное длинное с открытыми плечами",
  "description": "Чёрное длинное с открытыми плечами."
 },
 {
  "id": "dress22",
  "label": "№22 — зелёное с разрезами",
  "description": "Зелёное с разрезами."
 },
 {
  "id": "dress23",
  "label": "№23 — серое клетчатое",
  "description": "Серое клетчатое."
 },
 {
  "id": "dress24",
  "label": "№24 — чёрное коктейльное",
  "description": "Чёрное коктейльное."
 },
 {
  "id": "dress25",
  "label": "№25 — вечернее длинное",
  "description": "Вечернее длинное."
 },
 {
  "id": "dress26",
  "label": "№26 — ципао средней длины",
  "description": "Ципао средней длины."
 },
 {
  "id": "dress27",
  "label": "№27 — платье-трубка",
  "description": "Платье-трубка."
 },
 {
  "id": "dress28",
  "label": "№28 — корсаж с кружевной юбкой",
  "description": "Корсаж с кружевной юбкой."
 },
 {
  "id": "dress29",
  "label": "№29 — на бретелях с пышной юбкой",
  "description": "На бретелях с пышной юбкой."
 },
 {
  "id": "dress30",
  "label": "№30 — платье с вырезами",
  "description": "Платье с вырезами."
 },
 {
  "id": "dress31",
  "label": "№31 — многоярусная юбка",
  "description": "Многоярусная юбка."
 },
 {
  "id": "dress32",
  "label": "№32 — халтер до колен toigo",
  "description": "Халтер до колен toigo."
 },
 {
  "id": "dress33",
  "label": "№33 — бордовое миди",
  "description": "Бордовое миди."
 },
 {
  "id": "dress34",
  "label": "№34 — халтер с расклешённой юбкой",
  "description": "Халтер с расклешённой юбкой."
 },
 {
  "id": "dress35",
  "label": "№35 — вырез-капля",
  "description": "Вырез-капля."
 },
 {
  "id": "dress36",
  "label": "№36 — прямое платье",
  "description": "Прямое платье."
 },
 {
  "id": "dress37",
  "label": "№37 — без бретелей с оборкой",
  "description": "Без бретелей с оборкой."
 }
]);
export const outfitById=id=>OUTFITS.find(o=>o.id===id);
export function wardrobeState(p){
 const w=p?.wardrobe||{};
 return {selected:outfitById(w.selected)?.id||'red',autonomous:w.autonomous!==false,revision:Number.isSafeInteger(w.revision)?w.revision:0,selectedAt:w.selectedAt??null,source:w.source??null};
}
export function wardrobeContext(p){
 const declared=(p.ownerDialogue||[]).filter(t=>t.status==='answered'&&t.emotion&&Number.isFinite(t.answeredAt)).at(-1);
 return {...wardrobeState(p),outfits:OUTFITS,recentDeclaredFeeling:declared?{emotion:declared.emotion,reaction:declared.reaction,at:declared.answeredAt,source:'own_spoken_reply'}:null,
  choice:'You may choose another dress to suit how you currently feel, or keep this one and choose an ordinary action. No fixed mood-to-dress mapping, obligation to change, random rotation or need satisfaction. A past declared feeling is historical evidence, not a claim about your current mood. Outfit selection is an immediate visual change; it preserves your current activity, pose, location and props. No dressing animation or changing room is implemented.'};
}
export function wardrobeActions(p,{ready=false,awake=true}={}){
 const w=wardrobeState(p);
 if(!ready||!awake||!w.autonomous)return [];
 return OUTFITS.filter(o=>o.id!==w.selected).map(o=>({id:'wardrobe_select@'+o.id,description:`${o.label}. Бесплатная мгновенная смена наряда по своему желанию; текущие занятие, поза, место, предметы и потребности сохраняются.`}));
}
export function selectOutfit(p,id,{source='owner_menu',now=Date.now(),expectedRevision=null}={}){
 const w=wardrobeState(p);
 if(!outfitById(id)||expectedRevision!==null&&expectedRevision!==w.revision)return false;
 if(w.selected===id)return true;
 p.wardrobe={...w,selected:id,revision:w.revision+1,selectedAt:now,source};
 return true;
}
export function setWardrobeAutonomy(p,value,expectedRevision=null){
 const w=wardrobeState(p);
 if(typeof value!=='boolean'||expectedRevision!==null&&expectedRevision!==w.revision)return false;
 if(w.autonomous===value)return true;
 p.wardrobe={...w,autonomous:value,revision:w.revision+1};return true;
}
