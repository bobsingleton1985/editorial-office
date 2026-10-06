// Semantic affect is independent of available actor-compatible gesture clips.
export const EMOTION_INSTRUCTIONS={neutral:'Спокойствие',irritation:'Раздражение',anger:'Злость',surprise:'Удивление',flirt:'Флирт',amusement:'Веселье',joy:'Радость',gratitude:'Благодарность',thoughtful:'Задумчивость',sadness:'Грусть',unease:'Неловкость',fear:'Страх',respect:'Уважение'};
export function parseDeclaredEmotion(reaction){
 const label=typeof reaction==='string'?reaction.split(':',1)[0].trim():'';
 return Object.keys(EMOTION_INSTRUCTIONS).find(k=>EMOTION_INSTRUCTIONS[k]===label)||null;
}
export const PHONE_EMOTION_CLIPS={
 motus:{irritation:'mixamo-gap/mxg_annoyed_shake',anger:'mixamo-gap/mxg_angry_gesture',surprise:'mixamo-gap/mxg_surprised',amusement:'mixamo-gap/mxg_laughing',joy:'mixamo-gap/mxg_victory_idle',gratitude:'mixamo-gap/mxg_thoughtful_nod',thoughtful:'mixamo-gap/mxg_thinking',sadness:'mixamo-gap/mxg_disappointed',unease:'mixamo-gap/mxg_look_away'},
 heroine:{irritation:'heroine-native/HM-ANNOYED-SHAKE',anger:'heroine-native/HM-ANGRY-GESTURE',flirt:'heroine-native/HER-LOVE1',amusement:'heroine-native/HM-LAUGHING',joy:'heroine-native/XS-JOY',gratitude:'heroine-native/MX-NOD',thoughtful:'heroine-native/HM-THINKING',unease:'heroine-native/HM-BASHFUL'}
};
// Extend before phone_stop, keeping the current segment/time and a bounded tail.
// Explicit wrapUp still has the original pickup and return segments to use.
export function maintainPhone(ch,duration){
 const g=ch.g;if(ch.activity!=='phone'||!g?.phone||g.wrapped)return false;
 const u=ch.clk-g.t0,stop=g.segs.find(s=>/phone_stop$/.test(s.n));
 if(!stop||u<stop.s-2)return false;
 const prefix=g.kind==='stand'?'stand_':'',names=[1,2,3].map(i=>prefix+'phone_0'+i);
 const ds=names.map(duration);if(ds.some(d=>!Number.isFinite(d)||d<=.35))return false;
 const ends=g.segs.filter(s=>s.s>=stop.s),kept=g.segs.filter(s=>s.s<stop.s&&(/phone_start$/.test(s.n)||s.s+s.d>=u-.7));
 const cycleDuration=ds.reduce((sum,d)=>sum+d-.35,0);
 let s=u>stop.s+cycleDuration?stop.s+Math.floor((u-stop.s)/cycleDuration)*cycleDuration-cycleDuration:stop.s;
 while(s<u+60)for(let i=0;i<names.length;i++){kept.push({n:names[i],s,d:ds[i],o:0});s+=ds[i]-.35;}
 for(const end of ends){kept.push({...end,s});s+=end.d-.35;}
 g.segs=kept;g.T=s+.35;return true;
}
// Only free right arm/fingers, neck and head. Pelvis, trunk, legs and the
// handset arm remain under the original phone executor/IK.
export const phoneBone=name=>/^(?:head|neck_01|clavicle_r|upperarm_r|lowerarm_r|hand_r|(?:thumb|index|middle|ring|pinky)_\d+_r)$/.test(name);
export function samplePhoneEmotion({id,bones,gestures,ch,command,turn,now}){
 if(ch.activity!=='phone'||!ch.g?.phone||ch.g.wrapped||!command||turn?.replyActorSeq!==command.seq||turn.status!=='answered')return null;
 const u=ch.clk-ch.g.t0,start=ch.g.segs.find(s=>/phone_start$/.test(s.n));
 if(start&&u<start.s+start.d)return null;
 // Parse the source declaration, including legacy turns misclassified as neutral.
 const emotion=parseDeclaredEmotion(turn.reaction),clipId=PHONE_EMOTION_CLIPS[id==='heroine'?'heroine':'motus'][emotion];
 const clip=clipId&&gestures['social_'+clipId.replace(/[^a-zA-Z0-9]/g,'_')]?.clip;
 if(!clip)return null;
 const elapsed=(now-turn.answeredAt)/1000,span=Math.min(18,Math.max(5,(turn.reply?.length||0)/14));
 if(elapsed<0||elapsed>=span)return null;
 const w=Math.min(1,elapsed/.45,(span-elapsed)/.55)*.9,t=elapsed%clip.duration;
 let count=0;
 for(const track of clip.tracks){const name=track.name.replace(/\.quaternion$/,'');if(track.name!==name+'.quaternion'||!phoneBone(name)||!bones[name])continue;
  const interpolant=track.__phoneInterpolant??=track.createInterpolant();
  const q=bones[name].quaternion.clone().fromArray(interpolant.evaluate(t)).normalize();bones[name].quaternion.slerp(q,w);count++;
 }
 return count?{dialogueId:turn.id,emotion,clipId,weight:w,tracks:count}:null;
}
if(typeof window!=='undefined'){
 let world=null;
 window.__ownerPhoneWorld=w=>{world=w;};
 window.__ownerPhoneMaintain=maintainPhone;
 window.__ownerPhoneEmotion=(id,bones,gestures,ch,command)=>{
  if(!window.__SERVER_SIMULATION)return; // Viewers render the authority pose stream.
  const turn=world?.chars?.[id]?.ownerDialogue?.findLast(t=>t.status==='answered'&&t.replyActorSeq===command?.seq);
  const witness=samplePhoneEmotion({id,bones,gestures,ch,command,turn,now:window.__simNow??Date.now()});
  (window.__ownerPhoneEmotionWitness??={})[id]=witness;
 };
}
