import unittest,sys,importlib.util,json,io,hashlib
from email.message import Message
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from openrouter_client import systemone_payload,validate_systemone,choose,SYSTEMONE_ENDPOINT
spec=importlib.util.spec_from_file_location('behavior_server',Path(__file__).resolve().parents[1]/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
def fixture_context_counter(_):
    # A synthetic measurement for mocked transport contracts, not a tokenizer.
    return {'model':'typesafe/jev-1.13','stateAndLongestQuestionTokens':1000,'requestTokens':1000}

class BehaviorProvider(unittest.TestCase):
    def setUp(self):server.CONTROL=server.BehaviorControl()
    def test_behavior_server_allows_1000th_and_rejects_1001st_including_failures(self):
        server.CONFIG={'model':'typesafe/jev-1.13','key':'dummy-test-key'}
        server.CALLS=999
        lease=server.CONTROL.start('local','test-client-01');server.CONTROL.session['calls']=999
        snapshot=self.snapshot();snapshot['sessionId']='test-client-01'
        body=json.dumps({'snapshot':snapshot,'session_id':lease['session_id']}).encode()
        def invoke():
            h=object.__new__(server.Handler);h.path='/api/behavior-decide';h.headers=Message()
            h.headers['Content-Type']='application/json';h.headers['Content-Length']=str(len(body))
            h.rfile=io.BytesIO(body);h.valid_host=lambda:True;captured=[]
            h.send_json=lambda status,data:captured.append((status,data))
            h.do_POST();return captured[0]
        with patch.object(server,'choose',side_effect=RuntimeError('mock_provider_failure')) as model:
            self.assertEqual(invoke()[0],502)
            self.assertEqual(server.CALLS,1000)
            body=json.dumps({'snapshot':{**snapshot,'requestId':'request-2'},'session_id':lease['session_id']}).encode()
            self.assertEqual(invoke()[0],429)
            self.assertEqual(model.call_count,1)
        h=object.__new__(server.Handler);h.headers=Message();h.path='/api/status';h.valid_host=lambda:True;captured=[]
        h.send_json=lambda status,data:captured.append(data);h.do_GET()
        self.assertEqual(captured[0]['behavior_max_calls'],1000)
        self.assertEqual(captured[0]['calls'],1000)
        self.assertEqual(captured[0]['max_calls'],10) # Original single-character pilot unchanged.
    def test_actual_jev_request_contains_exact_versioned_rules_and_typed_choices(self):
        raw=(Path(__file__).resolve().parents[3]/'behavior-system/CHARACTER_RULES.md').read_bytes()
        rules={'version':next(line.split(':',1)[1].strip() for line in raw.decode().splitlines() if line.startswith('Версия:')),
               'sha256':hashlib.sha256(raw).hexdigest(),'text':raw.decode()}
        snapshot=self.snapshot();snapshot['characterRules']=rules
        reply={'answers':{'next_action':{'type':'choice','choice':'decline:invitation-12','confidence':1,'probabilities':{'accept:invitation-12':0,'decline:invitation-12':1}}}}
        with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())) as mocked:
            choose(snapshot,'typesafe/jev-1.13',api_key='dummy-test-key',context_token_measure=fixture_context_counter)
        request=mocked.call_args.args[0];payload=json.loads(request.data)
        self.assertEqual(request.full_url,SYSTEMONE_ENDPOINT)
        self.assertEqual(payload['state']['characterRules'],rules)
        self.assertEqual(payload['questions']['next_action']['type'],'choice')
        self.assertNotIn('messages',payload)
        self.assertNotIn('take a break on the sofa',payload['questions']['next_action']['instructions'])
        self.assertEqual(set(payload['questions']['next_action']['criteria']),{'accept:invitation-12','decline:invitation-12'})
    def snapshot(self):return {'scope':'behavior-two-v01','revision':4,'requestId':'request-1','self':{'id':'editor'},'available_actions':[{'id':'accept:invitation-12','description':'Присоединиться'},{'id':'decline:invitation-12','description':'Отказаться'}]}
    def test_independent_typed_choice(self):
        p=systemone_payload(self.snapshot(),'typesafe/jev-1.13')
        q=p['questions']['next_action']
        self.assertIn('invitation is optional',q['instructions'])
        self.assertNotIn('take a break on the sofa',q['instructions'])
        self.assertEqual(set(q['criteria']),{'accept:invitation-12','decline:invitation-12'})
    def test_exact_invitation_choice(self):
        s=self.snapshot();reply={'answers':{'next_action':{'type':'choice','choice':'decline:invitation-12','confidence':.8,'probabilities':{'accept:invitation-12':.2,'decline:invitation-12':.8}}}}
        self.assertEqual(validate_systemone(reply,s)['action'],'decline:invitation-12')
        reply['answers']['next_action']['choice']='decline:invitation-13'
        with self.assertRaises(ValueError):validate_systemone(reply,s)
    def test_server_validation(self):
        self.assertTrue(server.valid_behavior_actions(self.snapshot()))
        for field,value in [('self',None),('self',{'id':'../invalid'}),('scope','other')]:
            s=self.snapshot();s[field]=value;self.assertFalse(server.valid_behavior_actions(s))
        for action in ['accept','decline:../../key','pour:1','Exec','accept:invitation-999999999999999']:
            s=self.snapshot();s['available_actions'][0]['id']=action;self.assertFalse(server.valid_behavior_actions(s))
        s=self.snapshot();s['available_actions']*=2;self.assertFalse(server.valid_behavior_actions(s))
if __name__=='__main__':unittest.main()
