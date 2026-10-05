"""Local scene server; optional LAN listener exposes previews, never model credentials."""
import json,os,sys,threading,urllib.parse,ipaddress,re,hashlib
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent))
sys.path.insert(0,str(ROOT))
from lan_control import BehaviorControl,ControlError,MAX_BEHAVIOR_SECONDS
CONTROL=BehaviorControl()
from openrouter_client import choose,DEFAULT_MODEL,QWEN_MODELS
from memory_maintenance import consolidate,validate_batch
from jev_request_context import (ContextError,VERSION as JEV_CONTEXT_VERSION,
    estimate_request_tokens,ESTIMATE_METHOD,ESTIMATE_TARGET,
    ESTIMATE_CONTEXT_LIMIT,ESTIMATE_REQUEST_LIMIT)
from decision_trace import trace_id,emit
from credential_store import MacKeychain,CredentialError
def startup_model():
    config=ROOT/'behavior-provider.json'
    if not config.exists():return os.environ.get('OPENROUTER_MODEL',DEFAULT_MODEL)
    data=json.loads(config.read_text());model=data.get('model')
    if data.get('version')!=1 or model not in {DEFAULT_MODEL,*QWEN_MODELS}:raise ValueError('invalid_behavior_provider_config')
    return model
CONFIG={'model':startup_model(),'key':os.environ.get('OPENROUTER_API_KEY','')}
CREDENTIAL_STORE=None
CREDENTIAL_STATE={'backend':'macos_keychain','saved':False,'error':None}
LOCK=threading.Lock()
CALL_LOCK=threading.Lock()
CALLS=0
# Owner accepted estimated admission with a reserve on 2026-10-04.
# No HTTP setting or client-supplied token count can enable provider admission.
CONTEXT_TOKEN_MEASURE=estimate_request_tokens
MAX_PILOT_CALLS=10
MAX_BEHAVIOR_CALLS=1000
PORT=int(os.environ.get('CINEMA_PILOT_PORT','8765'))
BIND=os.environ.get('CINEMA_PILOT_BIND','127.0.0.1')
BIND_IP=ipaddress.ip_address(BIND)
if BIND_IP.version!=4 or BIND_IP.is_unspecified or not BIND_IP.is_private:
    raise ValueError('Use a specific local IPv4 address')
LOCAL_ADMIN=BIND_IP.is_loopback
ALLOWED_HOSTS=({f'127.0.0.1:{PORT}',f'localhost:{PORT}'} if LOCAL_ADMIN else {f'{BIND}:{PORT}'})
ACTION_IDS={'finish_work','go_rest','return_work','type','wait','accept_work'}

def context_guard_status():
    available=callable(CONTEXT_TOKEN_MEASURE)
    estimated=getattr(CONTEXT_TOKEN_MEASURE,'measurement_method',None)==ESTIMATE_METHOD
    return {'version':'newsroom-qwen-chat-v1' if CONFIG['model'] in QWEN_MODELS else JEV_CONTEXT_VERSION,'strict':not estimated,'enforced':True,
            'mode':'estimated' if estimated else 'exact',
            'measurement':ESTIMATE_METHOD if estimated else 'native_systemone_counter_callback',
            'exact_token_count':available and not estimated,'counter_available':available,
            'ready':available,'state_and_longest_question_limit':32000,'request_limit':64000,
            'admission_context_limit':ESTIMATE_CONTEXT_LIMIT if estimated else 32000,
            'admission_request_limit':ESTIMATE_REQUEST_LIMIT if estimated else 64000,
            'target':ESTIMATE_TARGET if estimated else 26000,'safety_reserve_percent':20 if estimated else 0,
            'error':None if available else 'jev_context_token_counter_unavailable'}

def initialize_credentials(store=None):
    """Called only at service startup, never on import by tests/tools."""
    global CREDENTIAL_STORE
    try:
        CREDENTIAL_STORE=store if store is not None else MacKeychain()
        key=CREDENTIAL_STORE.load_unattended()
        if key:
            CONFIG['key']=key
        CREDENTIAL_STATE.update(saved=bool(key),error=None)
    except CredentialError as e:
        CREDENTIAL_STATE.update(saved=False,error=str(e))

def credential_change(action,data):
    """Caller holds CALL_LOCK and LOCK; failures don't replace runtime key."""
    if CREDENTIAL_STORE is None:raise CredentialError('keychain_unavailable')
    if action=='forget':
        CREDENTIAL_STORE.delete()
        CONFIG['key']=''
        CREDENTIAL_STATE.update(saved=False,error=None)
    elif action=='load':
        key=CREDENTIAL_STORE.load()
        if not key:raise CredentialError('saved_key_missing')
        CONFIG['key']=key
        CREDENTIAL_STATE.update(saved=True,error=None)
    else:
        key=data.get('key','').strip() or CONFIG['key']
        if not key:raise CredentialError('invalid_config')
        CREDENTIAL_STORE.save(key)
        if CREDENTIAL_STORE.load()!=key:raise CredentialError('keychain_operation_failed')
        CONFIG.update(model=data['model'].strip(),key=key)
        CREDENTIAL_STATE.update(saved=True,error=None)

def valid_behavior_actions(snapshot):
    actions=snapshot.get('available_actions')
    if snapshot.get('scope')!='behavior-two-v01' or not isinstance(snapshot.get('self'),dict) or not re.fullmatch(r'[a-z][a-z0-9_]{0,30}', str(snapshot['self'].get('id') or '')):   # any person the director names (format only)
        return False
    if not isinstance(actions,list) or not 1<=len(actions)<=256:return False
    ids=[]
    for a in actions:
        if not isinstance(a,dict) or not isinstance(a.get('id'),str):return False
        key=a['id'].split('@')
        if len(key)>2 or (len(key)==2 and not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',key[1])):return False
        parts=key[0].split(':')
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,39}',parts[0]):return False   # any verb the director offers; the director is the source of truth (it reads the animation registry)
        if parts[0] in {'accept','decline','defer'}:
            if len(parts)!=2 or not re.fullmatch(r'invitation-\d{1,9}',parts[1]):return False
        elif len(parts)!=1:return False
        if not isinstance(a.get('description'),str) or len(a['description'])>500:return False
        ids.append(a['id'])
    return len(set(ids))==len(ids)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'public'),**kwargs)
    def log_message(self,*args):pass
    def send_json(self,status,data):
        body=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def valid_host(self):return self.headers.get('Host') in getattr(getattr(self,'server',None),'allowed_hosts',ALLOWED_HOSTS)
    def local_admin(self):
        return getattr(getattr(self,'server',None),'local_admin',LOCAL_ADMIN) and ipaddress.ip_address(getattr(self,'client_address',('127.0.0.1',0))[0]).is_loopback
    def trusted_lan(self):
        network=getattr(getattr(self,'server',None),'trusted_lan_network',None)
        peer=ipaddress.ip_address(getattr(self,'client_address',('0.0.0.0',0))[0])
        return bool(network and not peer.is_loopback and peer in network)
    def principal(self):
        peer=getattr(self,'client_address',('127.0.0.1',0))[0]
        if not ipaddress.ip_address(peer).is_private:raise ControlError(403,'private_network_only')
        if self.trusted_lan():return 'trusted-lan:'+peer
        header=self.headers.get('Authorization','')
        return CONTROL.principal(header[7:] if header.startswith('Bearer ') else '',peer,self.local_admin())
    def control_error(self,error):return self.send_json(error.status,{'error':error.code})
    def do_GET(self):
        if not self.valid_host():return self.send_json(403,{'error':'invalid_host'})
        path=urllib.parse.urlsplit(self.path).path
        if path=='/api/status':
            try:self.principal();authorized=True
            except ControlError:authorized=False
            with LOCK:data={'configured':authorized and bool(CONFIG['model'] and CONFIG['key']),'model':CONFIG['model'] if authorized else '', 'calls':CALLS if authorized else 0,'max_calls':MAX_PILOT_CALLS,'behavior_max_calls':MAX_BEHAVIOR_CALLS,'behavior_max_seconds':MAX_BEHAVIOR_SECONDS,'local_admin':self.local_admin(),'authorized':authorized,'lan_control':not bool(getattr(getattr(self,'server',None),'trusted_lan_network',None)),'trusted_lan':bool(getattr(getattr(self,'server',None),'trusted_lan_network',None)),'session_control':True,'session':CONTROL.summary() if authorized else None}
            if self.local_admin():
                with LOCK:data['credential_storage']=dict(CREDENTIAL_STATE)
            data['jev_context_guard']=context_guard_status()
            return self.send_json(200,data)
        if path=='/openrouter-settings':
            if not self.local_admin():return self.send_json(403,{'error':'local_only'})
            body=(ROOT/'openrouter-settings.html').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        if path=='/api/character-rules':
            raw=(ROOT.parents[1]/'behavior-system/CHARACTER_RULES.md').read_bytes();text=raw.decode();version=re.search(r'^Версия:\s*(\S+)',text,re.M)
            if not version:return self.send_json(503,{'error':'rules_version_missing'})
            return self.send_json(200,{'source':'behavior-system/CHARACTER_RULES.md','version':version.group(1),'sha256':hashlib.sha256(raw).hexdigest(),'text':text})
        if path.startswith('/behavior-system/'):
            name=path.removeprefix('/behavior-system/')
            if name not in {'prototype/world.mjs','prototype/catalog.mjs','prototype/test-policy.mjs','two-character-v01/browser-world.mjs'}:return self.send_error(404)
            file=ROOT.parents[1]/'behavior-system'/name
            body=file.read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        if path.startswith('/vendor/'):
            relative=urllib.parse.unquote(path[len('/vendor/'):])
            file=(ROOT/'node_modules/three'/relative).resolve()
            if not file.is_relative_to((ROOT/'node_modules/three').resolve()) or not file.is_file():return self.send_error(404)
            body=file.read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        return super().do_GET()
    def do_POST(self):
        global CALLS
        if not self.valid_host():return self.send_json(403,{'error':'invalid_host'})
        origin=self.headers.get('Origin')
        if origin and origin!=f"http://{self.headers.get('Host')}":return self.send_json(403,{'error':'invalid_origin'})
        if self.headers.get_content_type()!='application/json':return self.send_json(415,{'error':'json_required'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            limit=262144 if self.path in {'/api/behavior-decide','/api/memory-consolidate'} else 16384
            if not 0<length<=limit:raise ValueError()
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict):raise ValueError()
        except (ValueError,TypeError):return self.send_json(400,{'error':'invalid_request'})
        if self.path in {'/api/config','/api/credentials/load','/api/credentials/forget','/api/new-test','/api/decide','/api/pair-code','/api/pair-revoke'} and not self.local_admin():return self.send_json(403,{'error':'local_only'})
        if self.path=='/api/pair-code':return self.send_json(200,CONTROL.issue_code())
        if self.path=='/api/pair-revoke':
            CONTROL.revoke();return self.send_json(200,{'revoked':True})
        if self.path=='/api/pair':
            peer=getattr(self,'client_address',('127.0.0.1',0))[0]
            if not ipaddress.ip_address(peer).is_private:return self.send_json(403,{'error':'private_network_only'})
            try:return self.send_json(200,CONTROL.pair_device(data.get('code'),peer))
            except ControlError as e:return self.control_error(e)
        principal=None
        if self.path in {'/api/behavior-session','/api/behavior-decide','/api/memory-consolidate'}:
            try:principal=self.principal()
            except ControlError as e:return self.control_error(e)
        if self.path=='/api/behavior-session':
            action=data.get('action')
            try:
                if action=='start':
                    if not CALL_LOCK.acquire(blocking=False):return self.send_json(409,{'error':'request_in_progress'})
                    try:
                        with LOCK:
                            if not CONFIG['key']:return self.send_json(409,{'error':'configure_openrouter'})
                            old=CONTROL.session['id'] if CONTROL.session else None
                            result=CONTROL.start(principal,data.get('client_id'))
                            if result['session_id']!=old:CALLS=0
                    finally:CALL_LOCK.release()
                elif action=='stop' and not data.get('session_id'):result=CONTROL.cancel_client(principal,data.get('client_id'))
                elif action in {'pause','resume','stop'}:result=CONTROL.act(principal,data.get('session_id'),action)
                else:return self.send_json(400,{'error':'invalid_session_action'})
                return self.send_json(200,result)
            except ControlError as e:return self.control_error(e)
        if self.path=='/api/new-test':
            if not CALL_LOCK.acquire(blocking=False):
                return self.send_json(409,{'error':'request_in_progress'})
            try:
                with LOCK:
                    if CONTROL.active():return self.send_json(409,{'error':'another_session_active'})
                    CALLS=0
                return self.send_json(200,{'calls':0,'max_calls':MAX_PILOT_CALLS,'behavior_max_calls':MAX_BEHAVIOR_CALLS})
            finally:CALL_LOCK.release()
        if self.path in {'/api/config','/api/credentials/load','/api/credentials/forget'}:
            model=data.get('model','');key=data.get('key','')
            if self.path=='/api/config' and (not isinstance(model,str) or not 3<len(model)<200 or '/' not in model or not isinstance(key,str) or len(key)>1000):
                return self.send_json(400,{'error':'invalid_config'})
            if self.path=='/api/config' and any(c.isspace() or ord(c)<32 or ord(c)==127 for c in key.strip()):return self.send_json(400,{'error':'invalid_config'})
            if not CALL_LOCK.acquire(blocking=False):return self.send_json(409,{'error':'request_in_progress'})
            try:
                with LOCK:
                    if CONTROL.active():return self.send_json(409,{'error':'another_session_active'})
                    try:credential_change(self.path.rsplit('/',1)[-1],data)
                    except CredentialError as e:
                        code=str(e)
                        CREDENTIAL_STATE['error']=code
                        return self.send_json(503,{'error':code})
                    return self.send_json(200,{'configured':bool(CONFIG['key']),'model':CONFIG['model'],'credential_storage':dict(CREDENTIAL_STATE)})
            finally:CALL_LOCK.release()
        if self.path not in {'/api/decide','/api/behavior-decide','/api/memory-consolidate'}:return self.send_json(404,{'error':'not_found'})
        snapshot=data.get('snapshot')
        if not isinstance(snapshot,dict) or type(snapshot.get('revision')) is not int or not isinstance(snapshot.get('available_actions'),list):
            return self.send_json(400,{'error':'invalid_snapshot'})
        actions=snapshot['available_actions']
        maintenance=self.path=='/api/memory-consolidate'
        behavior=self.path in {'/api/behavior-decide','/api/memory-consolidate'}
        if maintenance:
            try:validate_batch(snapshot)
            except (ValueError,TypeError):return self.send_json(400,{'error':'memory_invalid_batch'})
        if (behavior and not valid_behavior_actions(snapshot)) or (not behavior and (not 1<=len(actions)<=3 or any(not isinstance(a,dict) or a.get('id') not in ACTION_IDS for a in actions))):
            return self.send_json(400,{'error':'invalid_actions'})
        if not CALL_LOCK.acquire(blocking=False):return self.send_json(409,{'error':'request_in_progress'})
        try:
            with LOCK:
                model,key=CONFIG['model'],CONFIG['key']
                if maintenance and model not in QWEN_MODELS:return self.send_json(400,{'error':'memory_model_not_supported'})
                if behavior and model not in QWEN_MODELS and not model.startswith('typesafe/jev'):
                    return self.send_json(400,{'error':'behavior_model_not_supported'})
                if not model or not key:return self.send_json(409,{'error':'configure_openrouter'})
                if behavior:
                    try:CALLS,generation=CONTROL.admit(principal,data.get('session_id'),snapshot.get('sessionId'),snapshot.get('requestId'))
                    except ControlError as e:return self.control_error(e)
                else:
                    if CONTROL.active():return self.send_json(409,{'error':'another_session_active'})
                    if CALLS>=MAX_PILOT_CALLS:return self.send_json(429,{'error':'pilot_call_limit'})
                    CALLS+=1
            diagnostic_id=trace_id(data.get('diagnostic_id'))
            decision=(consolidate if maintenance else choose)(snapshot,model,key,diagnostic_id=diagnostic_id,context_token_measure=CONTEXT_TOKEN_MEASURE)
            if behavior:
                try:
                    CONTROL.validate_result(principal,data.get('session_id'),generation)
                except ControlError as e:
                    emit(diagnostic_id,'server_result_rejected',requestId=snapshot.get('requestId'),error=e.code)
                    return self.control_error(e)
            emit(diagnostic_id,'server_response_ready',requestId=snapshot.get('requestId'),actorId=snapshot.get('self',{}).get('id') if isinstance(snapshot.get('self'),dict) else None,revision=snapshot['revision'])
            return self.send_json(200,{'revision':snapshot['revision'],'calls':CALLS,'diagnostic_id':diagnostic_id,**decision})
        except ContextError as e:
            status=503 if str(e) in {'jev_context_token_counter_unavailable','jev_context_token_measurement_failed','jev_context_invalid_token_measurement'} else 413
            return self.send_json(status,{'error':str(e),'context_budget':e.report})
        except (ValueError,RuntimeError) as e:
            code=str(e)
            safe=code if code in {'jev_context_provider_limit','qwen_context_provider_limit','qwen_context_estimate_limit','openrouter_connection_failed','invalid_systemone_response','invalid_choice_probabilities','action_not_available','invalid_provider_response','invalid_decision_json','invalid_decision_shape','incomplete_model_response','memory_invalid_selection','memory_unknown_source','memory_summary_limit','memory_invalid_batch','memory_model_not_supported','memory_batch_limit'} or re.fullmatch(r'openrouter_http_[1-5]\d\d',code) else 'provider_response_failed'
            return self.send_json(502,{'error':safe})
        except Exception:
            return self.send_json(502,{'error':'provider_response_failed'})
        finally:CALL_LOCK.release()

def trusted_lan_network():
    config=ROOT/'lan-access.json'
    if not config.exists():return None
    value=json.loads(config.read_text()).get('trustedSubnet')
    if not value:return None
    network=ipaddress.ip_network(value,strict=True)
    if network.version!=4 or not network.is_private or network.is_loopback or network.prefixlen<24:
        raise ValueError('Trusted LAN must be an explicit private IPv4 subnet /24 or narrower')
    return network

def make_server(bind,port):
    address=ipaddress.ip_address(bind)
    if address.version!=4 or address.is_unspecified or not address.is_private:raise ValueError('Use a specific private IPv4 address')
    network=trusted_lan_network()
    if network and not address.is_loopback and address not in network:raise ValueError('LAN listener is outside configured trusted subnet')
    http=ThreadingHTTPServer((bind,port),Handler)
    http.trusted_lan_network=network
    http.local_admin=address.is_loopback
    http.allowed_hosts={f'{bind}:{port}'}|({f'localhost:{port}'} if address.is_loopback else set())
    return http

if __name__=='__main__':
    lan=os.environ.get('CINEMA_PILOT_LAN_BIND','')
    if lan and (not BIND_IP.is_loopback or ipaddress.ip_address(lan).is_loopback):raise ValueError('Combined mode needs loopback primary and private LAN secondary')
    listeners=[]
    try:
        listeners.append(make_server(BIND,PORT))
        if lan:listeners.append(make_server(lan,PORT))
    except Exception:
        for http in listeners:http.server_close()
        raise
    initialize_credentials()
    emit(trace_id(),'diagnostics_enabled',model=CONFIG['model'])
    for http in listeners[1:]:threading.Thread(target=http.serve_forever,daemon=True).start()
    print(f'Cinema pilot: http://{BIND}:{PORT}',flush=True)
    if lan:print(f'LAN control: http://{lan}:{PORT} (trusted subnet)' if listeners[-1].trusted_lan_network else f'LAN pairing required: http://{lan}:{PORT}',flush=True)
    try:listeners[0].serve_forever()
    finally:
        for http in listeners:http.server_close()
