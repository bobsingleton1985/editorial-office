export const OUTFITS=Object.freeze([
 {id:'red',label:'Красное — исходное',description:'Красное платье с открытыми плечами.'},
 {id:'dress33',label:'№33 — бордовое миди',description:'Бордовое платье миди с воротом халтер.'},
 {id:'dress13',label:'№13 — тёмное с кружевом',description:'Тёмное платье с кружевом и короткими рукавами.'},
 {id:'dress05',label:'№5 — с воланом',description:'Асимметричное платье с воланом на плече.'},
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
 return OUTFITS.filter(o=>o.id!==w.selected).map(o=>({id:'wardrobe_select@'+o.id,description:`Выбрать ${o.label}: ${o.description} По собственному текущему настроению и желанию. Мгновенная визуальная смена без прерывания занятия, анимации переодевания и изменения потребностей; бесплатно. Можно сохранить нынешнее платье, выбрав обычное действие.`}));
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
