// Shared setting, confirmed by the relay; never pretend a failed POST changed the room.
export function createHostessMenu(panel,relay,token){
 const box=panel.section('Танцы и обслуживание','hostess'),label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('p');
 label.textContent='Режим редакции ';select.id='hostess-mode';select.setAttribute('aria-label','Танцы и обслуживание');
 for(const [value,text]of [['dance','С танцами'],['drinks','Без танцев']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}label.append(select);box.append(label,status);
 let current=null,pending=false;const base=relay==='/'?'':relay;
 function sync(s){if(!['dance','drinks'].includes(s?.mode))return;current=s.mode;select.value=current;status.textContent=current==='drinks'?'Героиня предлагает напитки: по $1 с каждого обслуженного гостя.':'Выступление — по договорённости, $3 целиком. Обычные танцы бесплатны.';select.disabled=pending;}
 select.disabled=true;status.textContent='Загрузка общего режима…';
 select.onchange=async()=>{const mode=select.value;pending=true;select.disabled=true;try{const r=await fetch(base+'/settings/hostess',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({mode})});if(!r.ok)throw Error(r.status===403?'Недостаточно прав':r.status===429?'Повторите через пару секунд':'Не удалось сохранить');const s=await r.json();pending=false;sync(s);}catch(e){pending=false;select.value=current;select.disabled=false;status.textContent=e.message;}};
 fetch(base+'/settings/hostess').then(r=>{if(!r.ok)throw Error('Настройка пока недоступна');return r.json();}).then(sync).catch(e=>{status.textContent=e.message;});
 return {sync};
}
