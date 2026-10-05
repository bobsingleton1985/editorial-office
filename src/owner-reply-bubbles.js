const NAMES={heroine:'Героиня',columnist:'Колумнист',reporter:'Репортёр',newspaper_editor:'Редактор'};
export const replyDurationMs=t=>Math.min(90000,Math.max(45000,((t.reply?.length||0)+(t.reaction?.length||0))*90));
export function recentOwnerReply(person,now){
 const t=[...(person?.ownerDialogue||[])].reverse().find(t=>t.source==='phone'&&t.status==='answered'&&typeof t.reply==='string'&&t.reply.trim()&&Number.isFinite(t.answeredAt));
 if(!t||now<t.answeredAt-3000||now-t.answeredAt>replyDurationMs(t))return null;return t;
}
// Read-only replies to Telegram phone calls. No message form or chat opener.
export function createOwnerReplyBubbles({now=()=>Date.now(),people=()=>window.__people,camera=()=>window.__dialogueCamera,enabled=()=>true}={}){
 const make=(tag,className,text)=>{const e=document.createElement(tag);e.className=className;if(text)e.textContent=text;return e;};
 const style=make('style','');style.textContent=`
 .owner-phone-reply{position:fixed;z-index:9000;width:max-content;max-width:min(310px,calc(100vw - 24px));box-sizing:border-box;background:rgba(255,249,237,.94);color:#2b241e;border:1px solid #8a7659;border-radius:18px;padding:10px 13px;font:14px/1.4 system-ui;box-shadow:0 3px 12px #0003;white-space:pre-wrap;pointer-events:none}
 .owner-phone-reply[hidden]{display:none}.owner-phone-reply strong{display:block;font-size:12px;color:#66543e}.owner-phone-reply p{margin:5px 0}.owner-phone-reaction{font-size:12px;color:#66543e}
 .owner-phone-reply::after{content:'';position:absolute;bottom:-7px;left:var(--tail,50%);width:12px;height:12px;background:#fff9ed;border-bottom:1px solid #8a7659;border-right:1px solid #8a7659;transform:rotate(45deg)}
 `;document.head.append(style);
 let world=null,offset=0,connected=false;const bubbles=new Map();
 const updatePositions=()=>{
  for(const [id,p]of Object.entries(world?.chars||{})){
   let item=bubbles.get(id);if(!item){const box=make('aside','owner-phone-reply'),name=make('strong','',NAMES[id]||p.name||id),words=make('p',''),reaction=make('p','owner-phone-reaction');box.hidden=true;box.setAttribute('aria-label','Ответ '+(NAMES[id]||p.name||id)+' на звонок');box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.append(name,words,reaction);document.body.append(box);item={box,words,reaction,key:null};bubbles.set(id,item);}
   const {box}=item,t=recentOwnerReply(p,now()+offset),ed=people()?.[id]?.ed,cam=camera(),Vector3=window.__THREE?.Vector3;
   box.dataset.displayReason=!connected?'disconnected':!enabled()?'disabled':!t?'no_recent_reply':!ed||!cam||!Vector3?'scene_loading':'anchor_pending';
   if(!connected||!enabled()||!t||!ed||!cam||!Vector3){box.hidden=true;continue;}
   const head=ed.root?.getObjectByName('head');if(!head){box.dataset.displayReason='head_missing';box.hidden=true;continue;}
   ed.holder.updateMatrixWorld(true);const pos=head.getWorldPosition(new Vector3());pos.y+=.28;pos.project(cam);
   if(pos.z < -1||pos.z>1||Math.abs(pos.x)>1||Math.abs(pos.y)>1){box.dataset.displayReason='offscreen';box.hidden=true;continue;}
   const key=JSON.stringify([t.id,t.reply,t.reaction]);if(item.key!==key){item.key=key;item.words.textContent=t.reply;item.reaction.textContent=t.reaction?'Реакция: '+t.reaction:'';item.reaction.hidden=!t.reaction;}
   box.hidden=false;box.dataset.displayReason='shown';
   const x=(pos.x*.5+.5)*innerWidth,y=(-pos.y*.5+.5)*innerHeight,width=box.offsetWidth,height=box.offsetHeight;
   const left=Math.max(12,Math.min(innerWidth-width-12,x-width/2)),top=Math.max(12,Math.min(innerHeight-height-12,y-height-12));
   box.style.left=left+'px';box.style.top=top+'px';box.style.setProperty('--tail',Math.max(12,Math.min(width-24,x-left))+'px');
  }
 };
 const timer=setInterval(updatePositions,100);
 return {update(w){world=w;offset=Number.isFinite(w.now)?w.now-Date.now():0;connected=true;updatePositions();},connection(value){connected=value;updatePositions();},destroy(){clearInterval(timer);style.remove();for(const b of bubbles.values())b.box.remove();bubbles.clear();}};
}
