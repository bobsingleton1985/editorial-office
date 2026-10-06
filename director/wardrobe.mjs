export const OUTFITS=Object.freeze([
 {
  "id": "red",
  "label": "Красное — исходное",
  "description": "Original red off-shoulder dress"
 },
 {
  "id": "dress01",
  "label": "№1 — флаппер",
  "description": "Flapper"
 },
 {
  "id": "dress02",
  "label": "№2 — бэби-долл с вязкой",
  "description": "Knitted babydoll"
 },
 {
  "id": "dress03",
  "label": "№3 — халтер с платками",
  "description": "Scarf halter"
 },
 {
  "id": "dress04",
  "label": "№4 — стилизованное ципао",
  "description": "Stylized cheongsam"
 },
 {
  "id": "dress05",
  "label": "№5 — с воланом",
  "description": "Ruffled party dress"
 },
 {
  "id": "dress06",
  "label": "№6 — кожаное с бахромой",
  "description": "Fringed leather dress"
 },
 {
  "id": "dress07",
  "label": "№7 — открытые плечи с бахромой",
  "description": "Off-shoulder fringed dress"
 },
 {
  "id": "dress08",
  "label": "№8 — халтер до колен",
  "description": "Knee-length halter"
 },
 {
  "id": "dress09",
  "label": "№9 — халтер мини",
  "description": "Mini halter"
 },
 {
  "id": "dress10",
  "label": "№10 — платье 60-х",
  "description": "Sixties dress"
 },
 {
  "id": "dress11",
  "label": "№11 — модное платье 1",
  "description": "Fashion dress 1"
 },
 {
  "id": "dress12",
  "label": "№12 — модное платье 2",
  "description": "Fashion dress 2"
 },
 {
  "id": "dress13",
  "label": "№13 — тёмное с кружевом",
  "description": "Dark lace dress"
 },
 {
  "id": "dress14",
  "label": "№14 — бирюзовое на бретелях",
  "description": "Turquoise strap dress"
 },
 {
  "id": "dress15",
  "label": "№15 — белое с золотым поясом",
  "description": "White dress with gold belt"
 },
 {
  "id": "dress16",
  "label": "№16 — чёрное с короткой юбкой",
  "description": "Black dress with short skirt"
 },
 {
  "id": "dress17",
  "label": "№17 — фиолетовое с открытыми плечами",
  "description": "Purple off-shoulder dress"
 },
 {
  "id": "dress18",
  "label": "№18 — бирюзовое с чёрным халтером",
  "description": "Turquoise dress with black halter"
 },
 {
  "id": "dress19",
  "label": "№19 — шахматный верх и чёрная юбка",
  "description": "Checked top with black skirt"
 },
 {
  "id": "dress20",
  "label": "№20 — красное с перекрёстными бретелями",
  "description": "Red dress with crossed straps"
 },
 {
  "id": "dress21",
  "label": "№21 — чёрное длинное с открытыми плечами",
  "description": "Long black off-shoulder dress"
 },
 {
  "id": "dress22",
  "label": "№22 — зелёное с разрезами",
  "description": "Green dress with slits"
 },
 {
  "id": "dress23",
  "label": "№23 — серое клетчатое",
  "description": "Grey checked dress"
 },
 {
  "id": "dress24",
  "label": "№24 — чёрное коктейльное",
  "description": "Black cocktail dress"
 },
 {
  "id": "dress25",
  "label": "№25 — вечернее длинное",
  "description": "Long evening dress"
 },
 {
  "id": "dress26",
  "label": "№26 — ципао средней длины",
  "description": "Mid-length cheongsam"
 },
 {
  "id": "dress27",
  "label": "№27 — платье-трубка",
  "description": "Tube dress"
 },
 {
  "id": "dress28",
  "label": "№28 — корсаж с кружевной юбкой",
  "description": "Corset with lace skirt"
 },
 {
  "id": "dress29",
  "label": "№29 — на бретелях с пышной юбкой",
  "description": "Strap dress with full skirt"
 },
 {
  "id": "dress30",
  "label": "№30 — платье с вырезами",
  "description": "Cutout dress"
 },
 {
  "id": "dress31",
  "label": "№31 — многоярусная юбка",
  "description": "Tiered skirt dress"
 },
 {
  "id": "dress32",
  "label": "№32 — халтер до колен toigo",
  "description": "Toigo knee-length halter"
 },
 {
  "id": "dress33",
  "label": "№33 — бордовое миди",
  "description": "Burgundy midi"
 },
 {
  "id": "dress34",
  "label": "№34 — халтер с расклешённой юбкой",
  "description": "Halter with flared skirt"
 },
 {
  "id": "dress35",
  "label": "№35 — вырез-капля",
  "description": "Keyhole neckline"
 },
 {
  "id": "dress36",
  "label": "№36 — прямое платье",
  "description": "Straight dress"
 },
 {
  "id": "dress37",
  "label": "№37 — без бретелей с оборкой",
  "description": "Strapless dress with ruffle"
 }
]);
export const outfitById=id=>OUTFITS.find(o=>o.id===id);
export function wardrobeState(p){
 const w=p?.wardrobe||{};
 return {selected:outfitById(w.selected)?.id||'red',autonomous:w.autonomous!==false,revision:Number.isSafeInteger(w.revision)?w.revision:0,selectedAt:w.selectedAt??null,source:w.source??null};
}
export function wardrobeContext(p){
 const declared=(p.ownerDialogue||[]).filter(t=>t.status==='answered'&&t.emotion&&Number.isFinite(t.answeredAt)).at(-1);
 return {...wardrobeState(p),outfits:Object.fromEntries(OUTFITS.map(o=>[o.id,o.description])),recentDeclaredFeeling:declared?{emotion:declared.emotion,reaction:declared.reaction,at:declared.answeredAt,source:'own_spoken_reply'}:null,
  choice:'Free; needs unchanged. You may choose another dress to suit how you currently feel, or keep this one and choose an ordinary action. No fixed mood-to-dress mapping, obligation to change, random rotation or need satisfaction. A past declared feeling is historical evidence, not a claim about your current mood. Outfit selection is an immediate visual change; it preserves your current activity, pose, location and props. No dressing animation or changing room is implemented.'};
}
export function wardrobeActions(p,{ready=false,awake=true}={}){
 const w=wardrobeState(p);
 if(!ready||!awake||!w.autonomous)return [];
 return OUTFITS.filter(o=>o.id!==w.selected).map(o=>({id:'wardrobe_select@'+o.id,description:`Select ${o.id}. Garment: self.wardrobe.outfits.${o.id}; all effects and constraints: self.wardrobe.choice.`}));
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
