const NAMES={heroine:'Героиня',columnist:'Колумнист',reporter:'Репортёр',newspaper_editor:'Редактор'};
const REASONS={request_interrupted:'Запрос прерван перезапуском сервиса',jev_context_core_exceeds_limit:'Обязательная часть запроса превышает допустимый размер',jev_context_token_counter_unavailable:'Недоступен измеритель размера запроса',jev_context_provider_limit:'Провайдер отклонил слишком большой запрос',session_unavailable:'Не удалось открыть сеанс модели',action_not_available:'Модель вернула недоступное действие',daily_limit:'Достигнут дневной предел запросов',model_disabled:'Модель отключена',request_failed:'Запрос к модели завершился ошибкой'};
export function requestStatusText(item,now=Date.now()){
 const name=NAMES[item.actor]||'Персонаж',kind=item.kind==='reflection'?'оценка отношений':'выбор действия';
 const reason=REASONS[item.error]||(item.error?.startsWith('jev_context_')?'Запрос заблокирован проверкой контекста':'Не удалось получить ответ модели');
 if(item.status==='ok')return `${name} · ${kind}: ответ получен`;
 if(item.status==='pending'||item.status==='retry_requested')return `${name} · ${kind}: ${item.error?reason+'. Повторный запрос':'ожидание ответа'}`;
 const time=new Date(item.failedAt).toLocaleTimeString('ru-RU');
 return `${name} · ${kind} · ${time}: ${reason}. ${item.blocked?'Автоповтор остановлен.':`Повтор через ${Math.max(0,Math.ceil((item.retryAt-now)/1000))} с.`} Новое решение не принято.`;
}
export function createModelStatus(url){
 const panel=document.createElement('section');panel.setAttribute('aria-label','Запросы к модели');panel.style.cssText='position:fixed;left:12px;bottom:48px;z-index:10000;max-width:min(500px,calc(100vw - 24px));max-height:40vh;overflow:auto;background:#211d1b;color:#fff4e2;border:1px solid #d79a51;border-radius:8px;padding:10px;font:13px/1.45 system-ui;box-shadow:0 3px 14px #0007';
 const headline=document.createElement('div');headline.setAttribute('role','status');headline.setAttribute('aria-live','polite');
 const rows=document.createElement('div'),details=document.createElement('details'),summary=document.createElement('summary'),history=document.createElement('div');summary.textContent='Журнал запросов';details.append(summary,history);panel.append(headline,rows,details);document.body.append(panel);panel.hidden=true;
 let state=null,connected=true,timer=null,signature='';
 const render=()=>{
  if(!state){panel.hidden=true;return;}
  const current=Object.values(state.current||{}),errors=current.filter(x=>x.error&&x.status!=='ok');
  panel.hidden=current.length===0;if(panel.hidden)return;
  const title=errors.length?`Ошибки модели: ${errors.length}`:current.some(x=>x.status==='pending')?'Модель принимает решение':'Последние запросы выполнены';
  headline.textContent=title+(connected?'':' · связь потеряна, показаны последние данные');
  const visible=errors.length?errors:current.filter(x=>x.status==='pending');
  const next=JSON.stringify([visible,connected]);
  if(next!==signature){signature=next;rows.replaceChildren();for(const item of visible){const row=document.createElement('div'),text=document.createElement('div');row.style.marginTop='6px';text.dataset.key=item.actor+':'+item.kind;text.textContent=requestStatusText(item);row.append(text);
   if(item.status==='error'&&item.blocked){const button=document.createElement('button');button.textContent='Повторить запрос';button.disabled=!connected;button.onclick=async()=>{button.disabled=true;try{const r=await fetch(url.replace(/\/$/,'')+'/settings/model-retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:item.actor,requestKind:item.kind,requestId:item.id})});if(!r.ok)throw Error();button.textContent='Запрос на повтор отправлен';}catch{button.textContent='Повтор не отправлен — попробовать ещё';button.disabled=false;}};row.append(button);}rows.append(row);}}
  for(const item of visible){const text=[...rows.querySelectorAll('[data-key]')].find(x=>x.dataset.key===item.actor+':'+item.kind);if(text)text.textContent=requestStatusText(item);}
  history.replaceChildren();for(const item of [...(state.history||[])].reverse()){const row=document.createElement('div');row.textContent=requestStatusText(item);row.style.marginTop='6px';history.append(row);}
 };
 timer=setInterval(render,1000);
 return {update(value){state=value;render();},connection(value){connected=value;render();},destroy(){clearInterval(timer);panel.remove();}};
}
