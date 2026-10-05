import unittest,sys,io,json,importlib.util,threading
from pathlib import Path
from types import SimpleNamespace
from email.message import Message
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from lan_control import BehaviorControl,ControlError
spec=importlib.util.spec_from_file_location('lan_test_server',root/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)

class LanControl(unittest.TestCase):
 def setUp(self):
  self.now=0;server.CONTROL=BehaviorControl(lambda:self.now);server.CONFIG={'model':'typesafe/jev-1.13','key':'dummy-provider-secret'};server.CALLS=0
 def req(self,path,data=None,local=False,token=None,peer=None,origin=None,host=None,trusted=None):
  peer=peer or ('127.0.0.1' if local else '192.168.1.42');expected='127.0.0.1:8765' if local else '192.168.1.196:8765'
  h=object.__new__(server.Handler);h.path=path;h.server=SimpleNamespace(local_admin=local,allowed_hosts={expected});h.client_address=(peer,1)
  if trusted:
   import ipaddress
   h.server.trusted_lan_network=ipaddress.ip_network(trusted)
  h.headers=Message();h.headers['Host']=host or expected;h.headers['Origin']=origin or 'http://'+expected
  if token:h.headers['Authorization']='Bearer '+token
  if data is not None:
   raw=json.dumps(data).encode();h.rfile=io.BytesIO(raw);h.headers['Content-Type']='application/json';h.headers['Content-Length']=str(len(raw))
  result=[];h.send_json=lambda status,body:result.append((status,body))
  (h.do_GET if data is None else h.do_POST)();return result[0]
 def pair(self):
  code=self.req('/api/pair-code',{},local=True)[1]['code']
  return self.req('/api/pair',{'code':code})[1]['token']
 def snapshot(self,client='lan-client-01'):
  return {'scope':'behavior-two-v01','revision':1,'requestId':'request-1','sessionId':client,'self':{'id':'editor'},'available_actions':[{'id':'wait','description':'Wait'}]}
 def test_pair_once_expiry_rate_and_peer_binding(self):
  code=self.req('/api/pair-code',{},local=True)[1]['code'];token=self.req('/api/pair',{'code':code})[1]['token']
  self.assertEqual(self.req('/api/pair',{'code':code})[0],403)
  self.assertTrue(self.req('/api/status',token=token)[1]['authorized'])
  self.assertFalse(self.req('/api/status',token=token,peer='192.168.1.43')[1]['authorized'])
  for _ in range(3):self.req('/api/pair',{'code':'wrong'})
  self.assertEqual(self.req('/api/pair',{'code':'wrong'})[0],429)
  self.now=3601;self.assertFalse(self.req('/api/status',token=token)[1]['authorized'])
 def test_code_timeout_host_origin_and_local_key_boundary(self):
  code=self.req('/api/pair-code',{},local=True)[1]['code'];self.now=301
  self.assertEqual(self.req('/api/pair',{'code':code})[0],403)
  token=self.pair()
  self.assertEqual(self.req('/api/config',{'model':'x/y','key':'attack'},token=token)[0],403)
  self.assertEqual(self.req('/api/pair-code',{},token=token)[0],403)
  self.assertEqual(self.req('/api/pair',{'code':'123456'},origin='http://evil.example')[0],403)
  self.assertEqual(self.req('/api/status',host='evil.example')[0],403)
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'public-client'},peer='8.8.8.8')[0],403)
  self.assertNotIn('dummy-provider-secret',json.dumps(self.req('/api/status',token=token)))
 def test_two_listeners_share_one_lease_and_pause_stop_budget(self):
  token=self.pair();start=self.req('/api/behavior-session',{'action':'start','client_id':'lan-client-01'},token=token)
  self.assertEqual(start[0],200);sid=start[1]['session_id']
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'mac-client-01'},local=True)[0],409)
  self.assertEqual(self.req('/api/new-test',{},local=True)[0],409)
  self.assertEqual(self.req('/api/new-test',{},token=token)[0],403)
  self.assertEqual(self.req('/api/behavior-decide',{'snapshot':self.snapshot(),'session_id':sid})[0],401)
  with patch.object(server,'choose',return_value={'action':'wait','confidence':1}) as choose:
   data={'snapshot':self.snapshot(),'session_id':sid}
   self.assertEqual(self.req('/api/behavior-decide',data,token=token)[0],200)
   again=self.req('/api/behavior-session',{'action':'start','client_id':'lan-client-01'},token=token)
   self.assertEqual(again[1]['calls'],1);self.assertEqual(server.CALLS,1)
   self.now=30;self.assertEqual(self.req('/api/behavior-session',{'action':'pause','session_id':sid},token=token)[0],200)
   self.assertEqual(self.req('/api/behavior-decide',data,token=token)[0],409)
   data['snapshot']['requestId']='request-2'
   self.now=130;self.assertEqual(self.req('/api/behavior-session',{'action':'resume','session_id':sid},token=token)[0],200)
   self.assertEqual(self.req('/api/behavior-decide',data,token=token)[0],200)
   self.assertEqual(choose.call_count,2)
   self.now=700;self.assertEqual(self.req('/api/behavior-decide',data,token=token),(409,{'error':'session_expired'}))
   self.assertEqual(server.CALLS,2)
  self.assertEqual(self.req('/api/behavior-session',{'action':'stop','session_id':sid},token=token)[0],200)
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'mac-client-01'},local=True)[0],200)
 def test_revoke_stops_lan_without_exposing_key(self):
  token=self.pair();self.req('/api/behavior-session',{'action':'start','client_id':'lan-client-01'},token=token)
  self.assertEqual(self.req('/api/pair-revoke',{},local=True)[0],200)
  self.assertFalse(self.req('/api/status',token=token)[1]['authorized']);self.assertFalse(server.CONTROL.active())
 def test_concurrent_start_has_only_one_winner(self):
  results=[]
  def start(n):
   try:server.CONTROL.start('local',f'client-{n:03d}');results.append('yes')
   except ControlError:results.append('no')
  threads=[threading.Thread(target=start,args=(n,)) for n in range(20)]
  for t in threads:t.start()
  for t in threads:t.join()
  self.assertEqual(results.count('yes'),1)
 def test_paused_inflight_result_cannot_be_applied(self):
  token=self.pair();sid=self.req('/api/behavior-session',{'action':'start','client_id':'lan-client-01'},token=token)[1]['session_id']
  def choose(*args,**kwargs):
   self.req('/api/behavior-session',{'action':'pause','session_id':sid},token=token)
   return {'action':'wait','confidence':1}
  with patch.object(server,'choose',side_effect=choose):
   result=self.req('/api/behavior-decide',{'snapshot':self.snapshot(),'session_id':sid},token=token)
  self.assertEqual(result,(409,{'error':'session_changed'}));self.assertEqual(server.CALLS,1)

 def test_pause_resume_generation_duplicate_and_secret_error(self):
  token=self.pair();sid=self.req('/api/behavior-session',{'action':'start','client_id':'lan-client-01'},token=token)[1]['session_id']
  data={'snapshot':self.snapshot(),'session_id':sid}
  def choose(*args,**kwargs):
   self.req('/api/behavior-session',{'action':'pause','session_id':sid},token=token)
   self.req('/api/behavior-session',{'action':'resume','session_id':sid},token=token)
   return {'action':'wait','confidence':1}
  with patch.object(server,'choose',side_effect=choose) as model:
   self.assertEqual(self.req('/api/behavior-decide',data,token=token),(409,{'error':'session_changed'}))
   self.assertEqual(self.req('/api/behavior-decide',data,token=token),(409,{'error':'duplicate_request'}))
   self.assertEqual(model.call_count,1)
  data['snapshot']['requestId']='request-2'
  with patch.object(server,'choose',side_effect=ValueError("Invalid header value Bearer dummy-provider-secret")):
   self.assertEqual(self.req('/api/behavior-decide',data,token=token),(502,{'error':'provider_response_failed'}))
  self.req('/api/behavior-session',{'action':'stop','session_id':sid},token=token)
  self.assertEqual(self.req('/api/config',{'model':'typesafe/jev-1.13','key':'dummy\nsecret'},local=True)[0],400)
 def test_close_during_start_cancels_before_or_after_start_arrives(self):
  token=self.pair()
  self.req('/api/behavior-session',{'action':'stop','client_id':'closing-client'},token=token)
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'closing-client'},token=token),(409,{'error':'session_cancelled'}))
  self.req('/api/behavior-session',{'action':'start','client_id':'another-client'},token=token)
  self.req('/api/behavior-session',{'action':'stop','client_id':'another-client'},token=token)
  self.assertFalse(server.CONTROL.active())

 def test_ten_minute_active_boundary_and_pause_are_pinned_per_session(self):
  status=self.req('/api/status',local=True)[1]
  self.assertEqual(status['behavior_max_seconds'],600);self.assertEqual(status['behavior_max_calls'],1000)
  started=self.req('/api/behavior-session',{'action':'start','client_id':'duration-client'},local=True)[1]
  sid=started['session_id'];self.assertEqual(started['max_seconds'],600)
  self.now=180;self.assertTrue(server.CONTROL.active())
  self.now=200;server.CONTROL.act('local',sid,'pause')
  self.now=500;self.assertEqual(server.CONTROL.summary()['state'],'paused')
  server.CONTROL.act('local',sid,'resume')
  self.now=899.999;self.assertTrue(server.CONTROL.active())
  self.now=900;self.assertEqual(server.CONTROL.summary()['state'],'expired')
  with self.assertRaises(ControlError) as error:server.CONTROL.admit('local',sid,'duration-client','request-1')
  self.assertEqual(error.exception.code,'session_expired');self.assertEqual(server.CALLS,0)
  with patch('lan_control.MAX_BEHAVIOR_SECONDS',300):
   self.assertEqual(server.CONTROL.summary()['max_seconds'],600)
   next_session=server.CONTROL.start('local','next-duration-client')
   self.assertEqual(next_session['max_seconds'],300)
  server.CONTROL.act('local',next_session['session_id'],'stop');self.assertFalse(server.CONTROL.active())

if __name__=='__main__':unittest.main()
