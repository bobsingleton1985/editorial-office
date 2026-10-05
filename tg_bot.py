"""Private Telegram owner menu. No secrets, network or startup side effects."""
import copy
import hashlib
import json
import re
import time
from pathlib import Path

NAMES = {'heroine':'Героиня','columnist':'Колумнист','reporter':'Репортёр','newspaper_editor':'Редактор'}
MAX_CENTS = 9007199254740991

def dollars(cents):return f'{cents//100}.{cents%100:02d}'

def amount(text, zero=False):
    text=text.strip().replace(',','.')
    if not re.fullmatch(r'\d+(?:\.\d{1,2})?',text): raise ValueError('Введите сумму в USD, например 5 или 2,50.')
    whole,_,fraction=text.partition('.')
    cents=int(whole)*100+int(fraction.ljust(2,'0'))
    if cents<(0 if zero else 1) or cents>MAX_CENTS: raise ValueError('Сумма вне допустимого диапазона.')
    return cents

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
        back=[button('↩ Меню','menu')]
        if not s.get('target') or s.get('mode')=='choose':
            return {'inline_keyboard':[[button(NAMES[a],'to:'+a) for a in pair] for pair in [('heroine','columnist'),('reporter','newspaper_editor')]]}
        if s.get('mode')=='confirm':return {'inline_keyboard':[[button('✅ Подтвердить','confirm'),button('Отменить','menu')]]}
        if s.get('mode')=='actions':
            page=s.get('page',0);actions=s.get('options',[]);rows=[]
            for index in range(page*8,min(len(actions),(page+1)*8)):
                description=actions[index]['description'].split(' Финансы:')[0]
                rows.append([button(description[:60],'action:'+str(index))])
            nav=[]
            if page>0:nav.append(button('←','page:'+str(page-1)))
            if (page+1)*8<len(actions):nav.append(button('→','page:'+str(page+1)))
            if nav:rows.append(nav)
            return {'inline_keyboard':rows+[back]}
        if s.get('mode')!='talk':return {'inline_keyboard':[back]}
        return {'inline_keyboard':[[button('💬 Разговор','talk'),button('💵 Деньги','money')],
                                  [button('📝 Задание','task'),button('🎯 Просьба','request')],
                                  [button('📋 Статус','status'),button('👥 Адресат','choose')],
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
            return note or f"☎ {NAMES.get(s.get('target'),'Редакция')}\nНапишите реплику или выберите действие. Ответ придёт, когда герой возьмёт трубку. Для работы модели держите редакцию открытой."
        def call(body,target=None,command=None):
            if not target:target=s.get('target')
            identity=hashlib.sha256(f"{message['chat']['id']}:{update['update_id']}:{len(event['calls'])}".encode()).hexdigest()[:24]
            event['calls'].append({'id':f"{int(time.time()*1000):013d}-bot-{update['update_id']:012d}-{len(event['calls']):02d}-{identity}",'text':body,'target':target,'command':command})
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
            elif action=='money':s.update(mode='money',draft={});note=f"Сколько USD передать персонажу «{NAMES[s['target']]}»? Например: 5 или 2,50. Начисление произойдёт только после подтверждения и доставки звонка."
            elif action=='task':
                if not world.get('chars',{}).get(s['target'],{}).get('canWork'):
                    note=menu('Этот персонаж пока не выполняет редакционные задания. Выберите другого адресата.')
                else:s.update(mode='title',draft={});note='Введите название задания (до 160 символов).'
            elif action=='request':
                options=world.get('chars',{}).get(s['target'],{}).get('actions',[])
                s.update(mode='actions',draft={},options=options,page=0)
                note='Выберите реально доступное действие. Персонаж сам решит, выполнять ли просьбу; к моменту доставки доступность может измениться.' if options else 'Сейчас нет доступных действий. Можно продолжить разговор.'
            elif action.startswith('page:') and s.get('mode')=='actions':
                try:page=int(action[5:])
                except ValueError:page=-1
                if page<0 or page*8>=len(s.get('options',[])):raise ValueError('Откройте список действий снова.')
                s['page']=page;note='Доступные действия:'
            elif action.startswith('action:') and s.get('mode')=='actions':
                try:option=s['options'][int(action[7:])];assert int(action[7:])>=0
                except (ValueError,IndexError,AssertionError):raise ValueError('Откройте список действий снова.')
                s.update(mode='confirm',draft={'command':{'type':'request','action':option['id']},'text':('Прошу: '+option['description'])[:500]})
                note='Передать просьбу?\n'+option['description']
            elif action=='status':
                p=world.get('chars',{}).get(s['target'],{});note=NAMES[s['target']]+': '+p.get('label','Нет данных о текущем занятии.')
                note+='\n\n'+('\n'.join(r.get('summary','') for r in p.get('commands',[])[-5:]) or 'Поручений и передач пока нет.')
                note=menu(note)
            elif action=='hangup':call('/конец');note=menu('Команда завершить звонок поставлена в очередь. Подтверждение придёт после исполнения.')
            elif action=='confirm' and s.get('mode')=='confirm' and s.get('draft',{}).get('command'):
                draft=s['draft'];call(draft['text'],command=draft['command']);note=menu('Подтверждённая команда поставлена в очередь. Квитанция и ответ придут после доставки персонажу.')
            else:raise ValueError('Откройте актуальное меню: /menu.')
        elif not text:note='Пришлите текст. Голосовые сообщения пока не распознаются.'
        elif not s.get('target'):s['mode']='choose';note='Выберите адресата кнопкой, затем напишите ему.'
        elif text.startswith('/'):note='Команды: /menu, /status, /hangup. Для разговора напишите обычную реплику.'
        elif s['mode']=='money':
            cents=amount(text);s.update(mode='confirm',draft={'command':{'type':'money','cents':cents},'text':f'Передаю вам {dollars(cents)} USD.'});note=f"Передать {dollars(cents)} USD персонажу «{NAMES[s['target']]}»?"
        elif s['mode']=='title':
            if len(text)>160:raise ValueError('Название должно быть не длиннее 160 символов.')
            s['draft']['title']=text;s['mode']='brief';note='Опишите задание (до 500 символов).'
        elif s['mode']=='brief':
            if len(text)>500:raise ValueError('Описание должно быть не длиннее 500 символов.')
            s['draft']['brief']=text;s['mode']='deadline';note='Срок: через сколько минут? Введите число или «без срока».'
        elif s['mode']=='deadline':
            if text.casefold() in ['без срока','нет','0']:deadline=None
            elif re.fullmatch(r'\d{1,7}',text) and 0<int(text)<=525600:deadline=int(time.time()*1000)+int(text)*60000
            else:raise ValueError('Введите число минут (до 525600) или «без срока».')
            s['draft']['deadlineAt']=deadline;s['mode']='reward';note='Дополнительная премия после фактического завершения задания, USD? Введите сумму или 0.'
        elif s['mode']=='reward':
            cents=amount(text,True);draft=s['draft'];command={'type':'task',**draft,'rewardCents':cents}
            s.update(mode='confirm',draft={'command':command,'text':f"Поручаю: {draft['title']}. {draft['brief']}"[:500]})
            deadline='без срока' if command['deadlineAt'] is None else 'срок через '+str(max(0,round((command['deadlineAt']-time.time()*1000)/60000)))+' мин.'
            note=f"Передать задание «{command['title']}»?\n{command['brief']}\n{deadline}\nПремия после исполнения: {dollars(cents)} USD."
        elif s['mode']=='talk':
            if len(text)>500:raise ValueError('Реплика должна быть не длиннее 500 символов.')
            call(text);note=menu('Реплика поставлена в очередь звонка. Ожидаем, пока персонаж возьмёт трубку.')
        else:note='Выберите кнопку или вернитесь в /menu.'
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
            enqueue(command['text'],command['target'],command['id'],command['command'])
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
