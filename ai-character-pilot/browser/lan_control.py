"""In-memory pairing and one shared behavior lease. No provider credentials here."""
import hashlib,hmac,re,secrets,time,threading

class ControlError(Exception):
    def __init__(self,status,code):self.status=status;self.code=code

MAX_BEHAVIOR_SECONDS=600

class BehaviorControl:
    def __init__(self,clock=time.monotonic):
        self.clock=clock;self.lock=threading.RLock();self.pair=None;self.tokens={};self.attempts=[];self.session=None;self.cancelled={}
    def issue_code(self):
        with self.lock:
            code=f'{secrets.randbelow(1000000):06d}'
            self.pair={'digest':hashlib.sha256(code.encode()).digest(),'expires':self.clock()+300}
            return {'code':code,'expires_in':300}
    def pair_device(self,code,peer):
        with self.lock:
            now=self.clock();self.attempts=[a for a in self.attempts if a[0]>now-300]
            if len(self.attempts)>=20 or sum(p==peer for _,p in self.attempts)>=5:raise ControlError(429,'pairing_rate_limit')
            self.attempts.append((now,peer))
            if not isinstance(code,str) or not re.fullmatch(r'\d{6}',code) or not self.pair or now>=self.pair['expires'] or not hmac.compare_digest(hashlib.sha256(code.encode()).digest(),self.pair['digest']):raise ControlError(403,'pairing_code_invalid')
            self.pair=None
            token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
            self.tokens[digest]={'peer':peer,'expires':now+3600}
            return {'token':token,'expires_in':3600}
    def principal(self,token,peer,local=False):
        if local:return 'local'
        if not isinstance(token,str) or len(token)>128:raise ControlError(401,'pairing_required')
        with self.lock:
            now=self.clock();self.tokens={k:v for k,v in self.tokens.items() if v['expires']>now}
            digest=hashlib.sha256(token.encode()).hexdigest();entry=self.tokens.get(digest)
            if not entry or entry['peer']!=peer:raise ControlError(401,'pairing_required')
            return 'lan:'+digest
    def _refresh(self):
        s=self.session
        if not s:return
        now=self.clock()
        if s['state']=='running' and s['elapsed']+now-s['resumedAt']>=s['max_seconds']:s['state']='expired';s['elapsed']=s['max_seconds']
        if s['state']=='paused' and now-s['pausedAt']>=600:s['state']='expired'
    def summary(self):
        with self.lock:
            self._refresh();s=self.session
            return None if not s else {'state':s['state'],'active':s['state'] in {'running','paused'},'controller':'Mac' if s['principal']=='local' else 'LAN','calls':s['calls'],'max_calls':1000,'max_seconds':s['max_seconds']}
    def active(self):return bool((self.summary() or {}).get('active'))
    def start(self,principal,client):
        if not isinstance(client,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,120}',client):raise ControlError(400,'invalid_client_id')
        with self.lock:
            self._refresh()
            self.cancelled={k:v for k,v in self.cancelled.items() if v>self.clock()}
            if (principal,client) in self.cancelled:raise ControlError(409,'session_cancelled')
            if self.active():
                if self.session['principal']==principal and self.session['client']==client:return self.view()
                raise ControlError(409,'another_session_active')
            self.session={'id':secrets.token_urlsafe(24),'principal':principal,'client':client,'state':'running','calls':0,'elapsed':0,'max_seconds':MAX_BEHAVIOR_SECONDS,'resumedAt':self.clock(),'generation':0,'requests':set()}
            return self.view()
    def view(self):
        return {'session_id':self.session['id'],**self.summary()}
    def _owned(self,principal,session_id):
        self._refresh();s=self.session
        if not s or s['principal']!=principal or s['id']!=session_id:raise ControlError(409,'session_not_owned')
        return s
    def act(self,principal,session_id,action):
        with self.lock:
            s=self._owned(principal,session_id);now=self.clock()
            if action=='stop':s['state']='stopped';s['generation']+=1
            elif action=='pause' and s['state']=='running':s['elapsed']+=now-s['resumedAt'];s['state']='paused';s['pausedAt']=now;s['generation']+=1
            elif action=='resume' and s['state']=='paused':s['state']='running';s['resumedAt']=now
            else:raise ControlError(409,'session_not_'+('paused' if action=='resume' else 'running'))
            return self.view()
    def cancel_client(self,principal,client):
        if not isinstance(client,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,120}',client):raise ControlError(400,'invalid_client_id')
        with self.lock:
            if len(self.cancelled)>=256:self.cancelled.pop(next(iter(self.cancelled)))
            self.cancelled[(principal,client)]=self.clock()+300
            if self.session and self.session['principal']==principal and self.session['client']==client:self.session['state']='stopped';self.session['generation']+=1
            return {'state':'stopped'}
    def admit(self,principal,session_id,client,request_id):
        with self.lock:
            s=self._owned(principal,session_id)
            if s['client']!=client:raise ControlError(409,'session_client_mismatch')
            if s['state']!='running':raise ControlError(409,'session_'+s['state'])
            if not isinstance(request_id,str) or not re.fullmatch(r'request-\d{1,12}',request_id):raise ControlError(400,'invalid_request_id')
            if request_id in s['requests']:raise ControlError(409,'duplicate_request')
            if s['calls']>=1000:raise ControlError(429,'pilot_call_limit')
            s['calls']+=1;s['requests'].add(request_id)
            return s['calls'],s['generation']
    def validate_result(self,principal,session_id,generation):
        with self.lock:
            s=self._owned(principal,session_id)
            if s['state']!='running' or s['generation']!=generation:raise ControlError(409,'session_changed')
    def revoke(self):
        with self.lock:
            self.tokens.clear();self.pair=None
            if self.session and self.session['principal'].startswith('lan:'):self.session['state']='stopped';self.session['generation']+=1
