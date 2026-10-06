import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createWardrobeMesh} from './wardrobe-mesh.mjs';
import {OUTFITS,wardrobeState} from './wardrobe.mjs';
const query=new URLSearchParams(location.search),relay=(query.get('relay')||'https://135-106-229-50.sslip.io').replace(/\/$/,''),assetBase=query.get('charbase')||relay+'/';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let world=null,mesh=null,root=null,pending=null,connected=false,commandError=null;
let section,select,autonomy,message,retry;
function mount(){
 const host=document.querySelector('#settings-group-people [data-section="director"]');
 const tabs=host?.querySelector('.ptabs'),card=host?.querySelector('.rep');if(!host||!tabs||!card)return false;
 section=document.createElement('details');section.className='sec person-wardrobe';section.open=true;section.hidden=true;section.dataset.section='wardrobe';
 const title=document.createElement('summary');title.textContent='Платья';section.append(title);
 const label=document.createElement('label');label.textContent='Платье ';select=document.createElement('select');select.setAttribute('aria-label','Платье героини');
 for(const o of OUTFITS){const option=document.createElement('option');option.value=o.id;option.textContent=o.label;select.append(option);}label.append(select);section.append(label);
 const autoLabel=document.createElement('label');autoLabel.style.cssText='display:block;margin-top:10px';autonomy=document.createElement('input');autonomy.type='checkbox';autonomy.setAttribute('aria-label','Героиня сама выбирает платье по настроению');autoLabel.append(autonomy,' Сама выбирает по настроению');section.append(autoLabel);
 const hint=document.createElement('p');hint.textContent='Выбор общий для всех зрителей. Чтобы оставить выбранное вами платье, выключите самостоятельный выбор.';hint.style.cssText='font-size:12px;opacity:.8';section.append(hint);
 const credits=document.createElement('p');credits.style.cssText='font-size:11px;opacity:.7';credits.textContent='№33: MargaretToigo · CC0. №13: Mindfront · CC BY 4.0. №5: Elvaerwyn · CC-BY. Адаптированы к героине. ';const link=document.createElement('a');link.href=assetBase+'assets/heroine-wardrobe-20261006/credits.json';link.textContent='Источники и лицензии';link.target='_blank';link.rel='noopener';credits.append(link);section.append(credits);
 message=document.createElement('p');message.setAttribute('role','status');message.style.fontSize='12px';section.append(message);
 retry=document.createElement('button');retry.textContent='Повторить загрузку платья';retry.hidden=true;retry.onclick=()=>{mesh?.select(wardrobeState(world?.chars?.heroine).selected);};section.append(retry);
 select.onchange=()=>send({selected:select.value});autonomy.onchange=()=>send({autonomous:autonomy.checked});host.insertBefore(section,card);
 const syncCard=()=>{section.hidden=!tabs.querySelector('[data-people-focus="actor:heroine"][aria-pressed="true"]');};
 new MutationObserver(syncCard).observe(tabs,{subtree:true,attributes:true,childList:true,attributeFilter:['aria-pressed']});syncCard();return true;
}
async function send(change){
 const p=world?.chars?.heroine;if(!p||pending)return;
 commandError=null;const command={...change,expectedRevision:wardrobeState(p).revision,at:Date.now()};pending=command;paint();
 try{const response=await fetch(relay+'/settings/wardrobe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const b=await response.json();if(!response.ok)throw Error(b.error||'HTTP '+response.status);
  // The relay queued the command; canonical world confirms its application.
  if(pending===command){pending.seq=b.seq;pending.at=Date.now();}paint();
 }catch(e){if(pending!==command)return;pending=null;commandError='Не удалось изменить гардероб: '+e.message;paint();}
}
function paint(updateMessage=true){
 if(!section)return;
 const p=world?.chars?.heroine,w=wardrobeState(p),status=mesh?.status();
 if(pending&&((pending.selected===undefined||pending.selected===w.selected)&&(pending.autonomous===undefined||pending.autonomous===w.autonomous)))pending=null;
 if(pending&&Date.now()-pending.at>15000){pending=null;commandError='Команда не подтверждена. Проверьте соединение и повторите.';}
 select.value=pending?.selected||w.selected;autonomy.checked=pending?.autonomous??w.autonomous;
 select.disabled=autonomy.disabled=!connected||!p||!!pending;
 retry.hidden=!status?.error;
 if(updateMessage)message.textContent=commandError||(!connected?'Нет соединения с редакцией':!p?'Героиня ещё не появилась':pending?'Применяем общий выбор…':status?.error?'Платье не загрузилось: '+status.error:status?.busy?'Загружаем выбранное платье…':status?.selected===w.selected?'На героине: '+OUTFITS.find(o=>o.id===w.selected).label:'Ждём загрузки героини…');
}
window.addEventListener('editorial-world',e=>{world=e.detail;connected=true;paint();});
window.addEventListener('editorial-connection',e=>{connected=e.detail;paint();});
const timer=setInterval(()=>{
 if(!section)mount();
 const r=window.__people?.heroine?.ed?.root;
 if(r&&r!==root){root=r;try{mesh=createWardrobeMesh(root,id=>loader.loadAsync(assetBase+'assets/heroine-wardrobe-20261006/'+id+'.glb'));}catch(e){if(message)message.textContent=e.message;}}
 const id=wardrobeState(world?.chars?.heroine).selected;
 if(mesh&&mesh.status().wanted!==id)mesh.select(id);
 paint();
},250);
window.__wardrobeInspect=()=>({canonical:world?.chars?.heroine?.wardrobe||null,presentation:mesh?.status()||null,connected,pending:!!pending});
