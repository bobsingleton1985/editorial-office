const NAMES={heroine:'Героиня',columnist:'Колумнист',reporter:'Репортёр',newspaper_editor:'Редактор'};
const REASONS={openrouter_http_429:'Провайдер ограничил частоту запросов',request_interrupted:'Запрос прерван перезапуском сервиса',jev_context_core_exceeds_limit:'Обязательная часть запроса превышает допустимый размер',jev_context_token_counter_unavailable:'Недоступен измеритель размера запроса',jev_context_provider_limit:'Провайдер отклонил слишком большой запрос',session_unavailable:'Не удалось открыть сеанс модели',action_not_available:'Модель вернула недоступное действие',daily_limit:'Достигнут дневной предел запросов',model_disabled:'Модель отключена',request_failed:'Запрос к модели завершился ошибкой'};
export function requestStatusText(item,now=Date.now()){
 const name=NAMES[item.actor]||'Персонаж',kind=item.kind==='reflection'?'оценка отношений':'выбор действия';
 const reason=REASONS[item.error]||(item.error==='qwen_context_provider_limit'?'Провайдер отклонил слишком большой запрос':/^(?:jev|qwen)_context_/.test(item.error||'')?'Запрос заблокирован проверкой контекста':'Не удалось получить ответ модели');
 if(item.status==='ok')return `${name} · ${kind}: ответ получен`;
 if(item.status==='pending'||item.status==='retry_requested')return `${name} · ${kind}: ${item.error?reason+'. Повторный запрос':'ожидание ответа'}`;
 const time=new Date(item.failedAt).toLocaleTimeString('ru-RU');
 return `${name} · ${kind} · ${time}: ${reason}. ${item.blocked?'Автоповтор остановлен.':`Повтор через ${Math.max(0,Math.ceil((item.retryAt-now)/1000))} с.`} Новое решение не принято.`;
}
export function createModelStatus(url){
 const style=document.createElement('style');style.textContent=`
 .model-status{position:fixed;left:12px;bottom:48px;z-index:10000;max-width:min(500px,calc(100vw - 24px));background:#211d1b;color:#fff4e2;border:1px solid #756c62;border-radius:8px;font:13px/1.45 system-ui;box-shadow:0 3px 14px #0007}
 .model-status>summary{padding:10px;cursor:pointer;user-select:none}
 .model-status>summary:focus-visible{outline:2px solid #fff4e2;outline-offset:3px;border-radius:8px}
 .model-status-light{display:inline-block;width:9px;height:9px;margin:0 7px 0 3px;border-radius:50%;background:#67d98a;box-shadow:0 0 7px #67d98a80;animation:model-status-pulse 1.6s ease-in-out infinite}
 .model-status[data-state="error"]{border-color:#e87878}
 .model-status[data-state="error"] .model-status-light{background:#ff7373;box-shadow:0 0 7px #ff737380}
 .model-status-body{padding:0 10px 10px;max-height:40vh;overflow:auto}
 @keyframes model-status-pulse{50%{opacity:.35}}
 @media(prefers-reduced-motion:reduce){.model-status-light{animation:none}}
 `;document.head.append(style);
 const panel=document.createElement('details');panel.className='model-status';panel.setAttribute('aria-label','Запросы к модели');
 const toggle=document.createElement('summary'),light=document.createElement('span'),label=document.createElement('span');light.className='model-status-light';light.setAttribute('aria-hidden','true');toggle.append(light,label);
 const body=document.createElement('div');body.className='model-status-body';
 const headline=document.createElement('div');headline.setAttribute('role','status');headline.setAttribute('aria-live','polite');
 const rows=document.createElement('div'),details=document.createElement('details'),summary=document.createElement('summary'),history=document.createElement('div');summary.textContent='Журнал запросов';details.append(summary,history);body.append(headline,rows,details);panel.append(toggle,body);document.body.append(panel);
 let state=null,connected=true,timer=null,signature='';
 const render=()=>{
  const current=Object.values(state?.current||{}),errors=current.filter(x=>x.error&&x.status!=='ok');
  panel.dataset.state=errors.length||!connected||!state?'error':'ok';
  label.textContent=errors.length?`Модель · ошибок: ${errors.length}`:!connected?'Модель · нет связи':!state?'Модель · нет данных':'Модель';
  const title=errors.length?`Ошибки модели: ${errors.length}`:current.some(x=>x.status==='pending'||x.status==='retry_requested')?'Модель принимает решение':current.length?'Последние запросы выполнены':state?'Запросы ещё не отправлены':'Данные о запросах ещё не получены';
  headline.textContent=title+(connected?'':' · связь потеряна, показаны последние данные');
  const visible=errors.length?errors:current.filter(x=>x.status==='pending');
  const next=JSON.stringify([visible,connected]);
  if(next!==signature){signature=next;rows.replaceChildren();for(const item of visible){const row=document.createElement('div'),text=document.createElement('div');row.style.marginTop='6px';text.dataset.key=item.actor+':'+item.kind;text.textContent=requestStatusText(item);row.append(text);
   if(item.status==='error'&&item.blocked){const button=document.createElement('button');button.textContent='Повторить запрос';button.disabled=!connected;button.onclick=async()=>{button.disabled=true;try{const r=await fetch(url.replace(/\/$/,'')+'/settings/model-retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:item.actor,requestKind:item.kind,requestId:item.id})});if(!r.ok)throw Error();button.textContent='Запрос на повтор отправлен';}catch{button.textContent='Повтор не отправлен — попробовать ещё';button.disabled=false;}};row.append(button);}rows.append(row);}}
  for(const item of visible){const text=[...rows.querySelectorAll('[data-key]')].find(x=>x.dataset.key===item.actor+':'+item.kind);if(text)text.textContent=requestStatusText(item);}
  history.replaceChildren();for(const item of [...(state?.history||[])].reverse()){const row=document.createElement('div');row.textContent=requestStatusText(item);row.style.marginTop='6px';history.append(row);}
 };
 render();
 timer=setInterval(render,1000);
 return {update(value){state=value;render();},connection(value){connected=value;render();},destroy(){clearInterval(timer);panel.remove();style.remove();}};
}
