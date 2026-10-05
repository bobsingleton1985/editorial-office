import unittest,sys,json,io,threading,urllib.request,urllib.error,importlib.util
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import memory_maintenance as memory
import openrouter_client as adapter
from jev_request_context import estimate_request_tokens,ContextError

def row(i,text='Fact'):
 return {'event':'owner_dialogue_reply','text':text,'memoryId':'mem-'+format(i,'024x'),'memorySequence':i,'memoryRecordedAt':1000+i}
def snapshot():
 return {'scope':'behavior-two-v01','revision':1,'sessionId':'daily-fixture','requestId':'request-1',
  'self':{'id':'reporter','character':'Романтик','needs':{'hunger':50},'finances':{'balanceCents':123,'activeDebt':{'id':'debt-1','amountCents':77}},'ownerTasks':[{'id':'task-1','status':'active'}]},
  'characterRules':{'version':'fixture','text':'Complete fixture rules'},'available_actions':[{'id':'wait','description':'Wait safely.'}],
  'memoryMaintenance':{'version':1,'throughSequence':2,'previous':[row(1,'Old important fact')],'candidates':[row(2,'Newest actual fact')]}}
class DailyMemoryProvider(unittest.TestCase):
 def test_final_request_and_selected_sources(self):
  s=snapshot();result={'selected_ids':[row(1)['memoryId']]};response={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(result)}}],'usage':{'prompt_tokens':200,'completion_tokens':20}}
  with patch('memory_maintenance.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode()))as call:
   d=memory.consolidate(s,adapter.QWEN_FLASH_MODEL,'fixture-not-real',context_token_measure=estimate_request_tokens)
  p=json.loads(call.call_args.args[0].data);state=json.loads(p['messages'][1]['content'])['state'];self.assertEqual(state['memoryMaintenance'],s['memoryMaintenance']);self.assertEqual(state['characterRules'],s['characterRules']);self.assertEqual(state['self'],s['self']);self.assertEqual(d['selected_ids'],result['selected_ids']);self.assertEqual(p['model'],adapter.QWEN_FLASH_MODEL);self.assertEqual(p['provider'],{'only':['Alibaba'],'allow_fallbacks':False});self.assertEqual(p['max_tokens'],600)
 def test_director_wire_aliases_and_full_descriptions_cross_real_server_boundary(self):
  s=json.loads((Path(__file__).resolve().parents[3]/'test/daily-memory-wire-fixture.json').read_text())
  self.assertTrue(server.valid_behavior_actions(s));self.assertTrue(any('description_full' in a for a in s['available_actions']))
  p,a,b=memory.memory_payload(s,adapter.QWEN_FLASH_MODEL,estimate_request_tokens)
  state=json.loads(p['messages'][1]['content'])['state'];self.assertEqual(state['memoryMaintenance'],s['memoryMaintenance']);self.assertFalse(a['exactTokenCount'])
 def test_invalid_unknown_duplicate_rewritten_and_large_selections(self):
  batch=snapshot()['memoryMaintenance']
  for content in ['invalid',json.dumps({'selected_ids':['unknown']}),json.dumps({'selected_ids':[row(1)['memoryId']]*2}),json.dumps({'selected_ids':[],'summary':'invented'}),json.dumps({'selected_ids':[{}]})]:
   with self.assertRaises(ValueError):memory.validate_selection(content,batch)
  batch['candidates']=[row(2,'x'*4500)]
  with self.assertRaisesRegex(ValueError,'memory_summary_limit'):memory.validate_selection(json.dumps({'selected_ids':[row(2)['memoryId']]}),batch)
 def test_batch_and_final_guard_block_before_network(self):
  for change in ['oversized','bad_id','no_counter','core']:
   s=snapshot();measure=estimate_request_tokens
   if change=='oversized':s['memoryMaintenance']['candidates']=[row(2,'x'*16000)]
   if change=='bad_id':s['memoryMaintenance']['candidates'][0]['memoryId']='unknown'
   if change=='no_counter':measure=None
   if change=='core':s['characterRules']['text']='Ж'*90000
   with patch('memory_maintenance.urllib.request.urlopen')as call:
    with self.assertRaises((ValueError,ContextError)):memory.consolidate(s,adapter.QWEN_FLASH_MODEL,'fixture-not-real',context_token_measure=measure)
    call.assert_not_called()
 def test_partial_response_rejects(self):
  response={'choices':[{'finish_reason':'length','message':{'content':'{"selected_ids":[]}'}}]}
  with patch('memory_maintenance.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
   with self.assertRaisesRegex(ValueError,'incomplete_model_response'):memory.consolidate(snapshot(),adapter.QWEN_FLASH_MODEL,'fixture-not-real',context_token_measure=estimate_request_tokens)

spec=importlib.util.spec_from_file_location('daily_memory_server',Path(__file__).resolve().parents[1]/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class DailyMemoryServer(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);port=cls.http.server_address[1];cls.base=f'http://127.0.0.1:{port}';cls.http.allowed_hosts={f'127.0.0.1:{port}'};cls.http.local_admin=True;cls.http.trusted_lan_network=None;threading.Thread(target=cls.http.serve_forever,daemon=True).start()
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()
 def setUp(self):server.CONTROL=server.BehaviorControl();server.CONFIG={'model':adapter.QWEN_FLASH_MODEL,'key':'fixture-not-real'};server.CALLS=0
 def post(self,path,body):
  with urllib.request.urlopen(urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}))as r:return json.load(r)
 def start(self):return self.post('/api/behavior-session',{'action':'start','client_id':'daily-fixture'})['session_id']
 def test_same_owner_session_and_call_budget(self):
  sid=self.start();s=snapshot()
  with patch.object(server,'consolidate',return_value={'selected_ids':[]})as call:
   d=self.post('/api/memory-consolidate',{'session_id':sid,'snapshot':s});self.assertEqual(d['calls'],1);self.assertEqual(d['revision'],1);call.assert_called_once()
   s['requestId']='request-2'
   with patch.object(server,'choose',return_value={'action':'wait','reason':'fixture'}):d=self.post('/api/behavior-decide',{'session_id':sid,'snapshot':s});self.assertEqual(d['calls'],2)
 def test_invalid_batch_and_wrong_session_cannot_reach_model(self):
  sid=self.start()
  with patch.object(server,'consolidate')as call:
   s=snapshot();s['memoryMaintenance']['candidates'][0]['memoryId']='wrong'
   with self.assertRaises(urllib.error.HTTPError)as e:self.post('/api/memory-consolidate',{'session_id':sid,'snapshot':s})
   self.assertEqual(e.exception.code,400);self.assertEqual(server.CALLS,0)
   with self.assertRaises(urllib.error.HTTPError):self.post('/api/memory-consolidate',{'session_id':'wrong','snapshot':snapshot()})
   call.assert_not_called()
 def test_replayed_id_and_changed_session_reject(self):
  sid=self.start()
  with patch.object(server,'consolidate',return_value={'selected_ids':[]}):self.post('/api/memory-consolidate',{'session_id':sid,'snapshot':snapshot()})
  with patch.object(server,'consolidate')as call:
   with self.assertRaises(urllib.error.HTTPError):self.post('/api/memory-consolidate',{'session_id':sid,'snapshot':snapshot()})
   call.assert_not_called()
 def test_stop_during_call_rejects_result(self):
  sid=self.start()
  def stopped(*a,**kw):server.CONTROL.act('local',sid,'stop');return {'selected_ids':[]}
  with patch.object(server,'consolidate',side_effect=stopped):
   with self.assertRaises(urllib.error.HTTPError):self.post('/api/memory-consolidate',{'session_id':sid,'snapshot':snapshot()})
if __name__=='__main__':unittest.main()
