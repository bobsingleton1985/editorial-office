// Explicit meal choices use the existing food/utensil rigs. Hunger, prices and
// occupancy remain properties of the canonical lunch activity.
export const MEAL_CHOICES = Object.freeze([
  {id:'soup',dish:'soup',title:'суп'},
  {id:'steak',dish:'steak',title:'стейк'},
  {id:'noodles',dish:'noodles',title:'лапшу'},
  {id:'burger',dish:'burger',title:'бургер'},
  {id:'sandwich',dish:'sandwich',title:'сэндвич'},
  {id:'sweets',dish:'sweets',title:'пончики и печенье'},
  {id:'sweets_left',dish:'sweets',title:'пончики и печенье — второй вариант левой рукой',
    recipe:['fr_start','fr_1','fr_2','fr_stop','fl_start','fl_2','fl_stop']},
].map(x=>Object.freeze({...x,...(x.recipe?{recipe:Object.freeze(x.recipe)}:{})})));
const byId=new Map(MEAL_CHOICES.map(x=>[x.id,x]));
export function availableMeals(dishes) {
  const permitted = new Set(dishes || []);
  return MEAL_CHOICES.filter(x=>permitted.has(x.dish)).map(x=>x.id);
}
// A report carries explicitly playable choice IDs (not merely an actor name).
// No report means keep the pre-existing generic lunch compatibility action.
export function expandMealActions(actions, reportedMeals) {
  if(!Array.isArray(reportedMeals))return actions;
  const meals=[...new Set(reportedMeals)].map(id=>byId.get(id)).filter(Boolean);
  return actions.flatMap(a=>{
    const m=/^lunch@(bench[SMN])$/.exec(a.id);
    return m?meals.map(x=>({...a,id:`${a.id}:${x.id}`,description:`${a.description} Выбрать блюдо: ${x.title}.`})): [a];
  });
}
// null rejects a malformed/unsupported explicit choice instead of silently
// showing a different dish. Generic historical actions stay valid.
export function resolveMealAction(action, reportedMeals) {
  if(typeof action!=='string')return null;
  if(!action.startsWith('lunch@')||!action.includes(':'))return {action,meal:null};
  const m=/^lunch@(bench[SMN]):([a-z_]+)$/.exec(action), c=m&&byId.get(m[2]);
  return c&&Array.isArray(reportedMeals)&&reportedMeals.includes(c.id)
    ? {action:`lunch@${m[1]}`,meal:c.id} : null;
}
export function selectMeal(requested,seq,dishes) {
  if(!Array.isArray(dishes)||!dishes.length)return null;
  if(requested!=null){const c=byId.get(requested);return c&&dishes.includes(c.dish)?c:null;}
  const i=((Number.isFinite(seq)?Math.trunc(seq):0)%dishes.length+dishes.length)%dishes.length;
  return byId.get(dishes[i])||null;
}
export function mealRecipe(dish,selection,recipes) {
  const c=byId.get(selection??dish);
  if(!c||c.dish!==dish||!recipes[dish])return null;
  return [...(c.recipe||recipes[dish])];
}
