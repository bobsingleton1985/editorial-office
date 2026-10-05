"""Private Telegram owner menu. No secrets, network or startup side effects."""
import copy
import hashlib
import json
import time
from pathlib import Path

NAMES = {'heroine':'Героиня','columnist':'Колумнист','reporter':'Репортёр','newspaper_editor':'Редактор'}
class BotMenu:
    def __init__(self,file,atomic_write):
        self.file=Path(file);self.atomic_write=atomic_write
        try:self.state=json.loads(self.file.read_text())
        except FileNotFoundError:self.state={'version':1,'revision':0,'target':None,'mode':'talk','draft':{},'events':{}}
        if self.state.get('version')!=1:raise RuntimeError('unsupported bot state')
        for event in self.state['events'].values():
            if event.get('delivery')=='sending':event['delivery']='uncertain'

    def save(self):self.atomic_write(self.file,json.dumps(self.state,ensure_ascii=False))

    def keyboard(self,state=None):
        s=state or self.state;rev=s['revision']
        def button(text,action):return {'text':text,'callback_data':f'b:{rev}:{action}'}
        if not s.get('target') or s.get('mode')=='choose':
            return {'inline_keyboard':[[button(NAMES[a],'to:'+a) for a in pair] for pair in [('heroine','columnist'),('reporter','newspaper_editor')]]}
        return {'inline_keyboard':[[button('📋 Статус','status'),button('👥 Адресат','choose')],
                                  [button('☎ Завершить звонок','hangup')]]}

    def plan(self,update,world):
        s=copy.deepcopy(self.state);s['events']={};s['revision']+=1
        message=update.get('message') or update.get('callback_query',{}).get('message',{})
        event={'id':str(update['update_id']),'delivery':'ready','messageId':message.get('message_id'),'calls':[]}
        text=(update.get('message',{}).get('text') or '').strip()
        cb=update.get('callback_query');action=None
        slash=text.split()[0].split('@')[0] if text else ''
        def menu(note=None):
            s.update(mode='talk',draft={})
            return note or f"☎ {NAMES.get(s.get('target'),'Редакция')}\nПишите своими словами: вопрос, просьбу, поручение или передачу денег. Модель поймёт намерение и уточнит, если что-то неясно. Для работы модели держите редакцию открытой."
        def call(body,target=None,command=None):
            if not target:target=s.get('target')
            identity=hashlib.sha256(f"{message['chat']['id']}:{update['update_id']}:{len(event['calls'])}".encode()).hexdigest()[:24]
            untrusted=any(message.get(k) for k in ['forward_origin','forward_from','forward_from_chat','via_bot']) or any(e.get('type') in ['blockquote','expandable_blockquote','pre','code'] for e in message.get('entities',[]))
            event['calls'].append({'id':f"{int(time.time()*1000):013d}-bot-{update['update_id']:012d}-{len(event['calls']):02d}-{identity}",'text':body,'target':target,'command':command,'instructionEligible':not untrusted})
        if cb:
            data=cb.get('data','').split(':',2)
            if len(data)!=3 or data[0]!='b' or data[1]!=str(self.state['revision']):
                event.update(text='Это старое меню. Откройте /menu.',next=None);return event
            action=data[2]
        elif slash in ['/start','/menu','/help']:
            action='menu' if s.get('target') else 'choose'
        elif text.lower() in ['/конец','/hangup']:action='hangup'
        elif slash=='/status':action='status'
        if action:
            if action=='choose':s.update(mode='choose',draft={});note='С кем хотите поговорить?'
            elif action.startswith('to:') and action[3:] in NAMES:
                target=action[3:]
                if s.get('target') and s['target']!=target:
                    pending=world.get('phoneTarget')
                    if pending==s['target']:call('/конец',s['target'])
                s['target']=target;note=menu()
            elif not s.get('target'):s['mode']='choose';note='Сначала выберите персонажа.'
            elif action in ['menu','talk']:note=menu()
            elif action=='status':
                p=world.get('chars',{}).get(s['target'],{});note=NAMES[s['target']]+': '+p.get('label','Нет данных о текущем занятии.')
                note+='\n\n'+('\n'.join(r.get('summary','') for r in p.get('commands',[])[-5:]) or 'Поручений и передач пока нет.')
                note=menu(note)
            elif action=='hangup':call('/конец');note=menu('Команда завершить звонок поставлена в очередь. Подтверждение придёт после исполнения.')
            else:raise ValueError('Откройте актуальное меню: /menu.')
        elif not text:note='Пришлите текст. Голосовые сообщения пока не распознаются.'
        elif not s.get('target'):s['mode']='choose';note='Выберите адресата кнопкой, затем напишите ему.'
        elif text.startswith('/'):note='Команды: /menu, /status, /hangup. Для разговора напишите обычную реплику.'
        else:
            if len(text)>500:raise ValueError('Реплика должна быть не длиннее 500 символов.')
            s.update(mode='talk',draft={})
            call(text);note=menu('Реплика поставлена в очередь звонка. Ожидаем, пока персонаж возьмёт трубку.')
        event.update(text=note[:4000],next=s,keyboard=self.keyboard(s));return event

    def process(self,update,*,authorized,send,answer_callback,enqueue,track,world,save_offset):
        cb=update.get('callback_query');message=update.get('message') or (cb or {}).get('message',{})
        if not message or message.get('chat',{}).get('type')!='private':return False
        sender=(cb or message).get('from',{}).get('id');chat=message['chat'].get('id')
        if not isinstance(sender,int) or chat!=sender or not authorized(sender):
            if cb:answer_callback(cb['id'],'Доступен только владельцу подключённого канала.')
            save_offset(update['update_id']+1);return True
        existing=self.state.get('owner')
        if existing not in [None,sender]:raise RuntimeError('owner binding changed; explicit rebind required')
        self.state.update(owner=sender,chat=chat)
        key=str(update['update_id']);event=self.state['events'].get(key)
        if event is None:
            try:event=self.plan(update,world())
            except ValueError as error:event={'id':key,'text':str(error),'messageId':message.get('message_id'),'calls':[],'next':None,'keyboard':self.keyboard(),'delivery':'ready'}
            self.state['events'][key]=event;self.save()
        self.save() # Retry a failed initial plan save before any durable side effect.
        for command in event['calls']:
            enqueue(command['text'],command['target'],command['id'],command['command'],command.get('instructionEligible',True))
            track(command['id'],event['messageId'],command['target'],command['text'])
        if event.get('next') is not None:
            events=self.state['events'];self.state=copy.deepcopy(event['next']);self.state['events']=events;event['next']=None
        self.save() # All queue/tracking/state records precede Telegram cursor ack.
        if event['delivery']=='ready':
            event['delivery']='sending';self.save()
            try:send(chat,event['text'],event.get('keyboard'))
            except Exception:
                event['delivery']='uncertain';self.save() # Never duplicate an uncertain menu send.
            else:event['delivery']='sent';self.save()
        if cb:answer_callback(cb['id'],'Принято')
        # Telegram offsets and callback revisions make prior events irrelevant.
        if len(self.state['events'])>128:
            keys=list(self.state['events']);self.state['events']={k:self.state['events'][k] for k in keys[-128:]};self.save()
        save_offset(update['update_id']+1);return True
