// This is a veto on an already model-interpreted payment, never authorization.
// Unsupported wording asks for clarification instead of inventing an amount.
const words = new Map();
for (const [value, names] of [
 [1,'one один одна одно'],[2,'two два две'],[3,'three три'],[4,'four четыре'],
 [5,'five пять'],[6,'six шесть'],[7,'seven семь'],[8,'eight восемь'],[9,'nine девять'],
 [10,'ten десять'],[11,'eleven одиннадцать'],[12,'twelve двенадцать'],
 [13,'thirteen тринадцать'],[14,'fourteen четырнадцать'],[15,'fifteen пятнадцать'],
 [16,'sixteen шестнадцать'],[17,'seventeen семнадцать'],[18,'eighteen восемнадцать'],
 [19,'nineteen девятнадцать'],[20,'twenty двадцать'],[30,'thirty тридцать'],
 [40,'forty сорок'],[50,'fifty пятьдесят'],[60,'sixty шестьдесят'],
 [70,'seventy семьдесят'],[80,'eighty восемьдесят'],[90,'ninety девяносто'],
 [100,'сто'],[200,'двести'],[300,'триста'],[400,'четыреста'],[500,'пятьсот'],
 [600,'шестьсот'],[700,'семьсот'],[800,'восемьсот'],[900,'девятьсот']
]) for (const name of names.split(' ')) words.set(name,value);
const dollar = t => /^(?:usd|dollars?|bucks?|доллар(?:а|ов)?|долл(?:ар)?\.?|бакс(?:а|ов)?)$/.test(t);
const cent = t => /^(?:cents?|цент(?:а|ов)?)$/.test(t);
function numeric(t){
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(t))return null;
 const [whole,fraction='']=t.replace(',','.').split('.');
 const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(n)?n:null;
}
function amountBefore(tokens,end){
 const n=numeric(tokens[end-1]??'');if(n!==null)return n;
 let value=0,prev=Infinity,count=0;
 // Russian descending cardinal words and English tens/units.
 // Read forwards after locating the beginning; reject unsupported grammar.
 let start=end;while(start>0&&words.has(tokens[start-1]))start--;
 for(let i=start;i<end;i++){
  const next=words.get(tokens[i]);if(next>=prev||count&&prev<20)return null;
  value+=next;prev=next;count++;
 }
 return count?value*100:null;
}
export function groundedUsdAmount(quote,cents){
 if(typeof quote!=='string'||!Number.isSafeInteger(cents)||cents<=0)return false;
 const tokens=quote.toLowerCase().match(/[+-]?\d+(?:[.,]\d+)?|[\p{L}]+|\$/gu)||[];
 for(let i=0;i<tokens.length;i++){
  const symbol=tokens[i]==='$';
  if(!symbol&&!dollar(tokens[i])&&!cent(tokens[i]))continue;
  let amount=symbol?numeric(tokens[i+1]??''):amountBefore(tokens,i);if(amount===null)continue;
  if(cent(tokens[i]))amount/=100;
  // A separately stated cents part belongs to the preceding dollar amount.
  if(symbol||dollar(tokens[i])){
   let j=i+(symbol?2:1);if(['and','и'].includes(tokens[j]))j++;
   let end=j;while(end<tokens.length&&(words.has(tokens[end])||/^[+-]?\d/.test(tokens[end])))end++;
   if(cent(tokens[end])){
    const fractional=amountBefore(tokens,end);
    if(fractional===null||fractional/100>=100||!Number.isInteger(fractional/100))continue;
    amount+=fractional/100;
   }
  }
  if(amount===cents)return true;
 }
 return false;
}
