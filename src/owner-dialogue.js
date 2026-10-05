const NAMES={heroine:'Героиня',columnist:'Колумнист',reporter:'Репортёр',newspaper_editor:'Редактор'};
export function createOwnerDialogue({url,token=()=>null,now=()=>Date.now(),people=()=>window.__people,camera=()=>window.__dialogueCamera,enabled=()=>true}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const style=el('style');style.textContent=`
 .owner-dialogue-button{position:fixed;right:14px;bottom:16px;z-index:10001;padding:10px 14px;background:#fff6dc;color:#30271e;border:1px solid #887559;border-radius:20px;font:14px system-ui;cursor:pointer}
 .owner-dialogue{position:fixed;right:12px;bottom:64px;width:min(390px,calc(100vw - 24px));max-height:65vh;overflow:auto;z-index:10001;background:#fff6e6;color:#30271e;border:1px solid #887559;border-radius:14px;padding:16px;box-sizing:border-box;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0005}
 .owner-dialogue[hidden],.owner-reaction[hidden]{display:none}
 .owner-dialogue header{display:flex;justify-content:space-between;font-weight:700}.owner-dialogue select,.owner-dialogue textarea{display:block;box-sizing:border-box;width:100%;margin:8px 0;padding:9px;font:inherit;background:white;color:#30271e}.owner-dialogue textarea{min-height:72px;resize:vertical}.owner-dialogue button{font:inherit;cursor:pointer}.owner-dialogue-history{max-height:30vh;overflow:auto}.owner-dialogue-turn{border-top:1px solid #d8c7ab;padding:10px 0}.owner-dialogue-turn p{margin:3px 0;white-space:pre-wrap}.owner-dialogue-turn small{color:#66543e}
 .owner-reaction{position:fixed;z-index:9000;max-width:min(280px,70vw);background:#fff9ed;color:#2b241e;border:1px solid #8a7659;border-radius:18px;padding:9px 12px;font:13px/1.4 system-ui;box-shadow:0 3px 12px #0003;transform:translate(-50%,-100%);cursor:pointer;white-space:pre-wrap}.owner-reaction::after{content:'';position:absolute;bottom:-7px;left:48%;width:12px;height:12px;background:#fff9ed;border-bottom:1px solid #8a7659;border-right:1px solid #8a7659;transform:rotate(45deg)}
 `;document.head.append(style);
 const button=el('button','☎ Диалог'),panel=el('section');button.className='owner-dialogue-button';panel.className='owner-dialogue';panel.hidden=true;panel.setAttribute('aria-label','Диалог с персонажем');
 const header=el('header','Звонок в редакцию'),close=el('button','Закрыть');header.append(close);
 const label=el('label','С кем говорить'),select=el('select');for(const [id,name]of Object.entries(NAMES)){const o=el('option',name);o.value=id;select.append(o);}label.append(select);
 const history=el('div');history.className='owner-dialogue-history';
 const form=el('form'),inputLabel=el('label','Ваша реплика'),input=el('textarea');input.maxLength=500;input.required=true;input.placeholder='Напишите персонажу…';inputLabel.append(input);const send=el('button','Сказать');send.type='submit';const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(inputLabel,send,status);
 panel.append(header,label,history,form);document.body.append(button,panel);
 let world=null,offset=0,connected=false,signature='',submission=null;const bubbles=new Map();
 const open=id=>{if(id)select.value=id;panel.hidden=false;button.setAttribute('aria-expanded','true');render();input.focus();};button.onclick=()=>panel.hidden?open():close.click();close.onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};select.onchange=()=>{signature='';render();};button.setAttribute('aria-expanded','false');
 function render(){
  const turns=world?.chars?.[select.value]?.ownerDialogue||[],sig=JSON.stringify([select.value,turns]);if(signature===sig)return;signature=sig;history.replaceChildren();
  if(!turns.length)history.append(el('p','Реплик пока нет. Вы — владелец газеты. Личные сведения герои узнают из ваших слов.'));
  for(const t of turns){const row=el('div');row.className='owner-dialogue-turn';row.append(el('small',`${new Date(t.at).toLocaleTimeString('ru-RU')} · ${t.source==='phone'?'Телефонный звонок':'Диалог'}`),el('p','Вы: '+t.text));if(t.status==='answered'){row.append(el('p',NAMES[select.value]+': '+t.reply),el('small','Реакция: '+t.reaction));}else row.append(el('p','Ожидает ответа персонажа'));history.append(row);}
  history.scrollTop=history.scrollHeight;
 }
 form.onsubmit=async e=>{
  e.preventDefault();const text=input.value.trim(),person=select.value;if(!text)return;if(!connected){status.textContent='Нет связи с редакцией. Реплика сохранена в поле.';return;}
  if(!submission||submission.text!==text||submission.person!==person)submission={id:crypto.randomUUID(),text,person};
  send.disabled=true;select.disabled=true;input.disabled=true;status.textContent='Отправляю…';
  try{const auth=token();const r=await fetch(url.replace(/\/$/,'')+'/settings/dialogue',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(submission)});if(!r.ok){const err=Error();err.status=r.status;throw err;}const receipt=await r.json();if(receipt.id!==submission.id)throw Error();status.textContent='Реплика доставлена в очередь. Ждём ответа персонажа.';input.value='';submission=null;}
  catch(e){status.textContent=e.status===403?'Диалог доступен владельцу. Откройте редакцию с вашим действующим доступом владельца.':e.status===429?'Подождите секунду и повторите отправку.':'Доставка не подтверждена. Можно повторить; та же реплика не задвоится.';}
  finally{send.disabled=false;select.disabled=false;input.disabled=false;input.focus();}
 };
 const timer=setInterval(()=>{
  for(const [id,p]of Object.entries(world?.chars||{})){
   let b=bubbles.get(id);if(!b){b=el('button');b.type='button';b.className='owner-reaction';b.hidden=true;b.onclick=()=>open(id);document.body.append(b);bubbles.set(id,b);}
   const t=[...(p.ownerDialogue||[])].reverse().find(t=>t.status==='answered'),ed=people()?.[id]?.ed,cam=camera();
   if(!connected||!enabled()||!t||now()+offset-t.answeredAt>30000||!ed||!cam){b.hidden=true;continue;}
   const h=ed.root?.getObjectByName('head');if(!h){b.hidden=true;continue;}ed.holder.updateMatrixWorld(true);const pos=h.getWorldPosition(new window.__THREE.Vector3());pos.y+=.28;pos.project(cam);if(pos.z < -1||pos.z>1||Math.abs(pos.x)>1||Math.abs(pos.y)>1){b.hidden=true;continue;}
   b.textContent=`${NAMES[id]} · реакция на ${t.source==='phone'?'звонок':'реплику'}\n${t.reaction}\n«${t.reply}»`;b.style.left=(pos.x*.5+.5)*innerWidth+'px';b.style.top=(-pos.y*.5+.5)*innerHeight+'px';b.hidden=false;
  }
 },100);
 return {update(w){world=w;offset=Number.isFinite(w.now)?w.now-Date.now():0;connected=true;render();},connection(value){connected=value;if(!value)status.textContent='Нет связи. Показана последняя история.';},open,destroy(){clearInterval(timer);button.remove();panel.remove();style.remove();for(const b of bubbles.values())b.remove();}};
}
