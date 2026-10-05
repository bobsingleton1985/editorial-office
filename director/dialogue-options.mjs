// Lossless transport representation; public action labels and canonical state stay untouched.
const bytes=s=>new TextEncoder().encode(s).length;
export function compactDialogueOptions(dialogue){
 const options=dialogue?.physicalOptions;
 if(!Array.isArray(options)||options.some(a=>typeof a.description!=='string'||/@P\d+;/.test(a.description))||dialogue.optionText)return dialogue;
 const original=structuredClone(dialogue),out=structuredClone(dialogue),counts=new Map();
 for(const a of options){
  const words=[...a.description.matchAll(/\S+/g)],seen=new Set();
  for(let i=0;i<words.length;i++)for(let j=i+1;j<Math.min(words.length,i+24);j++){
   const phrase=a.description.slice(words[i].index,words[j].index+words[j][0].length);
   if(phrase.length>=24)seen.add(phrase);
  }
  for(const phrase of seen)counts.set(phrase,(counts.get(phrase)||0)+1);
 }
 const candidates=[...counts].filter(([,n])=>n>1).map(([phrase,n])=>({phrase,score:(n-1)*bytes(phrase)-n*6-24})).filter(x=>x.score>64).sort((a,b)=>b.score-a.score||b.phrase.length-a.phrase.length);
 const dictionary={};
 for(const {phrase}of candidates){
  if(Object.keys(dictionary).length>=96)break;
  const parts=out.physicalOptions.map(a=>a.description.split(/(@P\d+;)/));
  const occurrences=parts.reduce((n,p)=>n+p.reduce((n,s,i)=>n+(i%2?0:s.split(phrase).length-1),0),0);
  const key='P'+(Object.keys(dictionary).length+1),marker='@'+key+';';
  if(occurrences<2||(occurrences-1)*bytes(phrase)-occurrences*bytes(marker)-24<64)continue;
  dictionary[key]=phrase;
  out.physicalOptions.forEach((a,i)=>{a.description=parts[i].map((s,j)=>j%2?s:s.split(phrase).join(marker)).join('');});
 }
 if(!Object.keys(dictionary).length)return original;
 out.optionText=dictionary;
 out.optionTextFormat='In physicalOptions.description, each @P1; style marker is an exact literal fragment from optionText.P1. Expand fragments to recover the complete action meaning. These are context possibilities; the response still selects only owner_reply.';
 for(let i=0;i<options.length;i++)if(out.physicalOptions[i].description.replace(/@(P\d+);/g,(_,k)=>dictionary[k])!==options[i].description)throw Error('dialogue_option_roundtrip_failed');
 if(options.every(a=>Object.keys(a).every(k=>['id','description'].includes(k))))out.physicalOptions={context_table:{columns:['id','description'],defaults:{},rows:out.physicalOptions.map(a=>[a.id,a.description])}};
 return bytes(JSON.stringify(out))<bytes(JSON.stringify(original))?out:original;
}
export function compactPerformanceMetadata(finances){
 const out=structuredClone(finances),rows=out.performances;if(!Array.isArray(rows))return out;
 if(rows.some(r=>['sequence','consent','duration'].some(k=>typeof r[k]==='string'&&/^@S\d+;$/.test(r[k])))||out.performanceMetadata)return out;
 const groups=new Map();for(const r of rows)for(const key of ['sequence','consent','duration']){const value=r[key];if(!value||typeof value!=='object')continue;const encoded=JSON.stringify(value);const g=groups.get(encoded)||{value,count:0};g.count++;groups.set(encoded,g);}
 const lookup=new Map(),dictionary={};for(const [encoded,g]of groups)if(g.count>=2&&(g.count-1)*bytes(encoded)-g.count*8-30>64){const id='S'+(lookup.size+1);lookup.set(encoded,id);dictionary[id]=g.value;}
 if(!lookup.size)return out;
 for(const r of rows)for(const key of ['sequence','consent','duration']){const id=lookup.get(JSON.stringify(r[key]));if(id)r[key]='@'+id+';';}
 out.performanceMetadata=dictionary;out.performanceMetadataFormat='A sequence, consent or duration value @S1; means the full literal value in performanceMetadata.S1. Expand this reference before interpreting the contract.';
 return bytes(JSON.stringify(out))<bytes(JSON.stringify(finances))?out:structuredClone(finances);
}
