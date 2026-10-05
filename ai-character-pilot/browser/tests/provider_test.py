import unittest,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from openrouter_client import validate_decision,systemone_payload,validate_systemone,choose
from unittest.mock import patch
from io import BytesIO
def fixture_context_counter(_):
    # A synthetic measurement for mocked transport contracts, not a tokenizer.
    return {'model':'typesafe/jev-1.13','stateAndLongestQuestionTokens':1000,'requestTokens':1000}

class ProviderContract(unittest.TestCase):
    def setUp(self):self.state={'available_actions':[{'id':'return_work'}]}
    def test_allowed(self):self.assertEqual(validate_decision('{"action":"return_work","reason":"Работа пришла"}',self.state)['action'],'return_work')
    def test_unknown_or_code(self):
        for action in ['teleport','exec("bad")','go_rest']:
            with self.assertRaises(ValueError):validate_decision(json.dumps({'action':action,'reason':'x'}),self.state)
    def test_malformed(self):
        for text in [None,'[]','null','text','{"action":"return_work"}','{"action":"return_work","reason":12}']:
            with self.assertRaises(ValueError):validate_decision(text,self.state)
    def test_overlong_reason(self):
        with self.assertRaises(ValueError):validate_decision(json.dumps({'action':'return_work','reason':'x'*1001}),self.state)
class JevContract(unittest.TestCase):
    def setUp(self):
        self.state={'available_actions':[{'id':'go_rest','description':'Отдыхать'}, {'id':'wait','description':'Подождать'}]}
        self.reply={'answers':{'next_action':{'type':'choice','choice':'go_rest','confidence':.9,'probabilities':{'go_rest':.95,'wait':.05}}}}
    def test_request_uses_typed_choice(self):
        payload=systemone_payload(self.state,'typesafe/jev-1.13')
        self.assertEqual(set(payload),{'model','state','questions'})
        self.assertEqual(payload['questions']['next_action']['criteria'],{'go_rest':'Отдыхать','wait':'Подождать'})
    def test_typed_response(self):
        result=validate_systemone(self.reply,self.state)
        self.assertEqual(result['action'],'go_rest');self.assertEqual(result['confidence'],.9)
    def test_unsafe_or_malformed_choice_rejected(self):
        for change in [{'choice':'teleport'},{'confidence':float('nan')},{'probabilities':{'go_rest':1}},{'type':'score'}]:
            data=json.loads(json.dumps(self.reply));data['answers']['next_action'].update(change)
            with self.assertRaises(ValueError):validate_systemone(data,self.state)
        for data in [{},None,{'answers':{'next_action':None}}]:
            with self.assertRaises(ValueError):validate_systemone(data,self.state)
    def test_jev_transport_not_chat(self):
        response=BytesIO(json.dumps(self.reply).encode())
        with patch('urllib.request.urlopen',return_value=response) as call:
            result=choose(self.state,'typesafe/jev-1.13',api_key='unit-test-placeholder',context_token_measure=fixture_context_counter)
        request=call.call_args.args[0]
        self.assertEqual(request.full_url,'https://openrouter.ai/api/v1/systemone')
        self.assertNotIn('messages',json.loads(request.data))
        self.assertEqual(result['action'],'go_rest')
if __name__=='__main__':unittest.main()
