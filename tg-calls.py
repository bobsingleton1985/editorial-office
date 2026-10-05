#!/usr/bin/env python3
"""Bound owner channel -> phone calls or explicit, idempotent owner bonuses.
Importing this module is side-effect free. Secrets are loaded only by main().
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.parse
import urllib.request

from tg_bot import BotMenu

HERE = Path(__file__).resolve().parent
ALIASES = {'всем':'all', 'всем сотрудникам':'all', 'колумнисту':'columnist',
           'репортеру':'reporter', 'редактору':'newspaper_editor', 'героине':'heroine'}
TARGET = '|'.join(sorted(ALIASES, key=len, reverse=True))
VERB = r'(?:выдай|выдать|выпиши|выписать|начисли|начислить)'
BONUS = re.compile(rf'(?:(?:арчи[, ]+)?)?(?P<verb>{VERB}\s+)?(?P<premium>преми[яю]\s+)?'
                   rf'(?P<target>{TARGET})\s+(?:по\s+)?(?P<before>\$\s*)?'
                   r'(?P<amount>\d+(?:[.,]\d{1,2})?)(?:\s*(?P<currency>\$|usd|доллар(?:а|ов)?))?[.!]?')
EXPLICIT = re.compile(rf'^(?:арчи[, ]+)?(?:{VERB}\s+)?преми[яю](?:\s|$)')
MAX_CENTS = 9007199254740991

class InvalidBonus(ValueError):
    pass

class InvalidCall(ValueError):
    pass

CALL_ALIASES = {key:value for key,value in ALIASES.items() if value in ['columnist','reporter','newspaper_editor','heroine']}
CALL_ALIASES.update({'колумнист':'columnist','репортер':'reporter','редактор':'newspaper_editor',
                     'columnist':'columnist','reporter':'reporter','newspaper_editor':'newspaper_editor','героиня':'heroine','heroine':'heroine'})
CALL_PATTERN = re.compile(r'^(?:арчи[, ]+)?(?:(?:позвони|позвонить|звонок)\s+)?([^:\n]+):\s*([\s\S]*)$',re.IGNORECASE)
CALL_EXPLICIT = re.compile(r'^(?:арчи[, ]+)?(?:позвони|позвонить|звонок)(?:\s|$)',re.IGNORECASE)

def parse_call(text):
    """An explicit colon prefix selects the recipient without changing the message."""
    match = CALL_PATTERN.fullmatch(text.strip())
    if match:
        name = ' '.join(match[1].casefold().replace('ё','е').split())
        target = CALL_ALIASES.get(name)
        if target:
            body = match[2].strip()
            if not body: raise InvalidCall('missing_call_text')
            return target,body[:500]
        if name in ['героиня','героине','heroine'] or CALL_EXPLICIT.match(text.strip()):
            raise InvalidCall('unsupported_call_recipient')
    elif CALL_EXPLICIT.match(text.strip()):
        raise InvalidCall('format: позвони репортёру: текст сообщения')
    return None


def parse_bonus(text):
    """Return an exact command only. Embedded requests, examples and quotes are prose."""
    if len(text)>500:
        return None
    normalized = ' '.join(text.casefold().replace('ё','е').split())
    match = BONUS.fullmatch(normalized)
    if not match:
        if EXPLICIT.match(normalized):
            raise InvalidBonus('format: премия всем по 5 долларов / премия колумнисту 10 долларов')
        return None
    if not (match['premium'] or match['verb'] or match['currency'] or match['before']):
        return None
    if match['before'] and match['currency']:
        raise InvalidBonus('currency specified twice')
    amount = match['amount'].replace(',','.')
    whole, _, fraction = amount.partition('.')
    cents = int(whole)*100 + int(fraction.ljust(2,'0'))
    if cents <= 0 or cents > MAX_CENTS:
        raise InvalidBonus('amount must be positive USD with at most two decimals')
    return ALIASES[match['target']], f'{cents//100}.{cents%100:02d}'


def bonus_id(channel, message):
    if not isinstance(message,int) or isinstance(message,bool) or message <= 0:
        raise InvalidBonus('missing message identity')
    return 'tg-bonus-' + hashlib.sha256(f'{channel}:{message}'.encode()).hexdigest()


def call_id(channel, message, posted_at=None):
    if not isinstance(message,int) or isinstance(message,bool) or message <= 0:
        raise InvalidCall('missing message identity')
    # Timestamp/message prefixes preserve channel order when the director sorts
    # call filenames; identity remains stable across retries and bridge restarts.
    timestamp = posted_at*1000 if isinstance(posted_at,int) and not isinstance(posted_at,bool) and posted_at>0 else 0
    channel_hash = hashlib.sha256(str(channel).encode()).hexdigest()[:16]
    return f'{timestamp:013d}-tg-{channel_hash}-{message:020d}'


def atomic_text(file, text):
    file = Path(file)
    tmp = file.with_name(file.name + f'.{os.getpid()}.tmp')
    try:
        with open(tmp,'w',encoding='utf8') as stream:
            os.chmod(tmp,0o600)
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp,file)
        fd = os.open(file.parent,os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally:
        tmp.unlink(missing_ok=True)


def durable_command(here, command_id):
    # The Telegram cursor must never acknowledge a bonus before its local queue
    # record is durable. Director separately fsyncs the actual ledger before ack.
    file = here/'owner-commands'/f'{command_id}.json'
    with file.open('rb') as stream: os.fsync(stream.fileno())
    fd = os.open(file.parent,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


def legacy_bonus_received(here, command_id):
    if not (here/'owner-commands'/f'{command_id}.json').exists():return False
    durable_command(here,command_id)
    return True


def queue_bonus(here, target, dollars, command_id):
    node = shutil.which('node')
    if node is None:
        node = next((p for p in ['/opt/homebrew/bin/node','/usr/local/bin/node'] if os.access(p,os.X_OK)),None)
    if node is None: raise RuntimeError('node unavailable')
    result = subprocess.run([node,str(here/'bonus.mjs'),target,dollars,'--id',command_id],capture_output=True,text=True,timeout=15)
    if result.returncode:
        if result.stderr.strip() == 'command_id_conflict': raise InvalidBonus('command_id_conflict')
        raise RuntimeError('bonus queue unavailable')
    receipt = json.loads(result.stdout)
    if receipt.get('id') != command_id or receipt.get('status') not in ['queued','applied','rejected']:
        raise RuntimeError('invalid queue receipt')
    durable_command(here,command_id)
    return receipt['status']


def queue_call(here, text, target, command_id, command=None, instruction_eligible=True):
    args = [str(here/'ring.sh'),'--id',command_id]+(['--to',target] if target else [])+(['--command',json.dumps(command,ensure_ascii=False)] if command else [])+([] if instruction_eligible else ['--untrusted'])+['--',text]
    result = subprocess.run(args,capture_output=True,text=True,timeout=15)
    if result.returncode:
        if result.stderr.strip() in ['call_id_conflict','unsupported_call_recipient','invalid_call_id','invalid_dialogue_command']:
            raise InvalidCall(result.stderr.strip())
        raise RuntimeError('phone queue unavailable')
    receipt = json.loads(result.stdout)
    if receipt.get('id') != command_id or receipt.get('status') != 'queued' or receipt.get('target') != target:
        raise RuntimeError('invalid phone queue receipt')
    return receipt


def process_update(update, channel, since, *, enqueue_bonus, enqueue_call, save_offset, report, track_call=None, conversation_target=None, is_own_reply=None, replay_target=None, legacy_bonus_received=None):
    """Advance only after a durable bonus/call; retries retain message identity."""
    next_offset = update['update_id'] + 1
    post = update.get('channel_post')
    if not post or str(post.get('chat',{}).get('id')) != channel:
        save_offset(next_offset)
        return 'ignored'
    # Preserve immutable queue identities from the old bridge across an unacked
    # update at migration. This only checks existing records; no keyword parsing.
    if legacy_bonus_received:
        try: old_id=bonus_id(channel,post.get('message_id'))
        except InvalidBonus: old_id=None
        if old_id and legacy_bonus_received(old_id):
            save_offset(next_offset)
            return 'legacy_bonus_received'
    text = (post.get('text') or post.get('caption') or '').strip()
    if is_own_reply and is_own_reply(post.get('message_id'),text):
        save_offset(next_offset)
        return 'own_reply'
    if not text:
        save_offset(next_offset)
        return 'empty'
    # Only new plain posts in the existing bound channel can transfer money.
    # Forwarded material and captions retain their ordinary phone behavior.
    forwarded = any(post.get(k) for k in ['forward_origin','forward_from','forward_from_chat','is_automatic_forward','via_bot'])
    eligible = (isinstance(post.get('date'),int) and post['date'] >= since and
                isinstance(post.get('text'),str) and not forwarded and
                not any(e.get('type') in ['blockquote','expandable_blockquote','pre','code'] for e in post.get('entities',[])))
    # Natural owner instructions are interpreted by Qwen in the director.
    # The bridge routes text only; it never infers a payment from keywords.
    try:
        addressed = parse_call(text) if eligible else None
    except InvalidCall as error:
        report('phone rejected',str(error))
        save_offset(next_offset)
        return 'rejected'
    target,body = addressed if addressed else (conversation_target if eligible else None,text[:500])
    try:
        command_id = call_id(channel,post.get('message_id'),post.get('date'))
        if replay_target: target=replay_target(command_id,target)
        if eligible: enqueue_call(body,target,command_id)
        else: enqueue_call(body,target,command_id,None,False)
        if track_call: track_call(command_id,post.get('message_id'),target,body)
    except InvalidCall as error:
        report('phone rejected',str(error))
        save_offset(next_offset)
        return 'rejected'
    save_offset(next_offset)
    report('phone queued',command_id)
    return 'call'


NAMES={'heroine':'Героиня','columnist':'Колумнист','reporter':'Репортёр','newspaper_editor':'Редактор'}

class DialogueDelivery:
    """Durable receipt/outbox for this already bound owner channel only."""
    def __init__(self, file):
        self.file=Path(file)
        try: self.state=json.loads(self.file.read_text())
        except FileNotFoundError: self.state={'version':1,'calls':{},'outgoing':[],'target':None}
        if self.state.get('version') != 1: raise RuntimeError('unsupported dialogue state')
        # An interrupted send may already have reached Telegram; never auto-resend it.
        for item in self.state['calls'].values():
            if item.get('status')=='sending': item['status']='uncertain'

    def save(self): atomic_text(self.file,json.dumps(self.state,ensure_ascii=False))

    @property
    def target(self): return self.state.get('target')

    def track(self, call_id, message_id, target, text):
        old=self.state['calls'].get(call_id)
        fingerprint=hashlib.sha256(json.dumps([message_id,target,text],ensure_ascii=False).encode()).hexdigest()
        if old:
            if old['fingerprint'] != fingerprint: raise InvalidCall('call_id_conflict')
            self.save()  # A previous in-memory insert may have failed durable saving.
            return
        self.state['calls'][call_id]={'messageId':message_id,'fingerprint':fingerprint,'status':'waiting','target':target,'ending':text.casefold() in ['/конец','/hangup']}
        if target: self.state['target']=target
        self.save()

    def is_own_reply(self,message_id,text):
        digest=hashlib.sha256(text.encode()).hexdigest()
        return message_id in self.state['outgoing'] or any(r.get('replyHash')==digest for r in self.state['calls'].values())

    def collect(self,snapshot):
        changed=False
        for actor,p in snapshot.get('chars',{}).items():
            for turn in p.get('ownerDialogue',[]):
                call_id=turn.get('id','').removeprefix('ph_')
                item=self.state['calls'].get(call_id)
                if not item or turn.get('source')!='phone': continue
                if item['status']=='waiting':
                    if self.state.get('target') is None: self.state['target']=actor;changed=True
                    if turn.get('status') in ['answered','closed','cancelled']:
                        reply=('☎ Звонок завершён по вашей команде.' if turn.get('status')=='closed' else '☎ Ответ на эту реплику отменён: вы завершили звонок.' if turn.get('status')=='cancelled' else f"☎ {NAMES.get(actor,actor)}\n{turn['reply']}\n\nРеакция: {turn['reaction']}")
                        if turn.get('effect',{}): reply+='\n\n'+turn['effect'].get('summary','')
                        item.update(status='ready',reply=reply,replyHash=hashlib.sha256(reply.encode()).hexdigest(),actor=actor)
                        changed=True
        if changed: self.save()

    def flush(self,send,report):
        for call_id,item in self.state['calls'].items():
            if item['status']!='ready': continue
            item['status']='sending';self.save()
            try: result=send(item['reply'],item['messageId'])
            except DefiniteSendFailure:
                item['status']='ready';self.save();report('dialogue reply rejected; will retry');break
            except Exception:
                item['status']='uncertain';self.save();report('dialogue reply delivery uncertain; no automatic resend');break
            if not isinstance(result.get('message_id'),int):
                item['status']='uncertain';self.save();report('dialogue reply receipt invalid');break
            self.state['outgoing'].append(result['message_id']);self.state['outgoing']=self.state['outgoing'][-2048:]
            item['status']='sent';item['outgoingMessageId']=result['message_id']
            if item.get('ending') and self.state.get('target')==item.get('actor'): self.state['target']=None
            self.save();report('dialogue reply delivered',call_id)

class DefiniteSendFailure(RuntimeError): pass


def log(*args): print(time.strftime('%d.%m %H:%M:%S'),*args,flush=True)


def main():
    # Existing private channel binding is required; never auto-bind a new sender.
    if not (HERE/'.tg-channel').is_file():
        log('configured channel required'); return 1
    lock = (HERE/'.tg-calls.lock').open('a')
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        log('bridge already running'); return 1
    def read(name, default=None):
        try: return (HERE/name).read_text().strip() or default
        except OSError: return default
    channel = read('.tg-channel')
    token = read('.tg-token')
    if not channel or not token:
        log('existing channel and token required'); return 1
    api = 'https://api.telegram.org/bot' + token + '/'
    def call(method, **params):
        data = urllib.parse.urlencode({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in params.items()}).encode()
        with urllib.request.urlopen(api+method,data,timeout=70) as response: result = json.load(response)
        if not result.get('ok'): raise DefiniteSendFailure('Telegram request failed')
        return result
    # Polling must not silently remove a webhook owned by another integration.
    if call('getWebhookInfo')['result'].get('url'):
        log('webhook configured; bridge not started'); return 1
    offset = read('.tg-offset')
    if offset is None:
        old = call('getUpdates',offset=-1,timeout=0).get('result',[])
        offset = old[-1]['update_id']+1 if old else 0
        atomic_text(HERE/'.tg-offset',str(offset))
    offset = int(offset)
    since = read('.tg-bonus-since')
    if since is None:
        since = int(time.time())+1
        atomic_text(HERE/'.tg-bonus-since',str(since))
    since = int(since)
    def save_offset(value):
        nonlocal offset
        atomic_text(HERE/'.tg-offset',str(value))
        offset = value
    dialogue=DialogueDelivery(HERE/'.tg-dialogue-state.json')
    private=DialogueDelivery(HERE/'.tg-bot-dialogue-state.json')
    bot=BotMenu(HERE/'.tg-bot-state.json',atomic_text)
    def authorized(user):
        return call('getChatMember',chat_id=channel,user_id=user)['result'].get('status')=='creator'
    def answer_callback(id,text):
        try:call('answerCallbackQuery',callback_query_id=id,text=text)
        except Exception:pass # Expired UI acknowledgements cannot replay a command.
    def bot_world():
        try: state=json.loads((HERE/'director/director-state.json').read_text())
        except (OSError,ValueError):return {}
        return {'phoneTarget':next((id for id,p in state.get('chars',{}).items() if p.get('ownerPhoneSession') or p.get('pendingOwnerCall')),None),
                'chars':{id:{'actions':p.get('ownerActions',[]),'commands':p.get('ownerCommands',[]),'canWork':p.get('finances',{}).get('canWork',False),'label':p.get('label') or p.get('state',{}).get('label') or p.get('activity','Нет данных')} for id,p in state.get('world',{}).get('chars',{}).items()}}
    def replies():
        try: snapshot=json.loads((HERE/'director/phone-dialogue-replies.json').read_text())
        except (OSError,ValueError): return
        dialogue.collect(snapshot)
        dialogue.flush(lambda text,message:call('sendMessage',chat_id=channel,text=text,reply_parameters={'message_id':message,'allow_sending_without_reply':True})['result'],log)
        private.collect(snapshot)
        if bot.state.get('chat') and authorized(bot.state['owner']):
            private.flush(lambda text,message:call('sendMessage',chat_id=bot.state['chat'],text=text,reply_parameters={'message_id':message,'allow_sending_without_reply':True},reply_markup=bot.keyboard())['result'],log)
    log('bridge ready: existing channel; two-way phone dialogue + private owner bot menu')
    while True:
        try:
            replies()
            updates = call('getUpdates',offset=offset,timeout=5,allowed_updates=['channel_post','message','callback_query']).get('result',[])
            for update in updates:
                if update['update_id'] < offset: continue
                if bot.process(update,authorized=authorized,send=lambda chat,text,keyboard:call('sendMessage',chat_id=chat,text=text,**({'reply_markup':keyboard} if keyboard else {})),answer_callback=answer_callback,enqueue=lambda *args:queue_call(HERE,*args),track=private.track,world=bot_world,save_offset=save_offset):continue
                process_update(update,channel,since,enqueue_bonus=lambda *a:queue_bonus(HERE,*a),
                               enqueue_call=lambda *a:queue_call(HERE,*a),save_offset=save_offset,report=log,
                               track_call=dialogue.track,conversation_target=dialogue.target,is_own_reply=dialogue.is_own_reply,
                               replay_target=lambda id,target:dialogue.state['calls'].get(id,{}).get('target',target),
                               legacy_bonus_received=lambda id:legacy_bonus_received(HERE,id))
            replies()
        except Exception as error:
            # urllib errors may contain the bot token in their URL: never log str(error).
            log('bridge retry',type(error).__name__)
            time.sleep(10)


if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception as error:
        log('bridge startup failed',type(error).__name__)
        raise SystemExit(1)
