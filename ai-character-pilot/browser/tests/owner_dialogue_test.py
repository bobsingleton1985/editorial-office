import unittest,sys,json,io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import openrouter_client as adapter
from jev_request_context import estimate_request_tokens
class OwnerDialogue(unittest.TestCase):
 def snapshot(self):
  return {'scope':'behavior-two-v01','revision':1,'self':{'id':'reporter','character':'Романтик','needs':{'hunger':50},'memory':[{'event':'phone_call','text':'Привет'}],'ownerDialogue':{'owner':{'role':'владелец газеты'},'history':[{'owner':'Я Александр.','reply':'Здравствуйте, Александр.'}],'message':{'text':'Как меня зовут?'}}},'characterRules':{'version':'fixture','text':'Full fixture rules'},'available_actions':[{'id':'owner_reply','description':'Answer in words only.'}]}
 def test_final_payload_and_exact_validated_reply(self):
  reply={'action':'owner_reply','reason':'Ответ владельцу','reply':'Александр, вы владелец газеты.','reaction':'Рад знакомству.'}
  response={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(reply)}}]}
  with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode()))as call:result=adapter.choose(self.snapshot(),adapter.QWEN_FLASH_MODEL,api_key='fixture',context_token_measure=estimate_request_tokens)
  payload=json.loads(call.call_args.args[0].data);body=json.loads(payload['messages'][1]['content']);self.assertEqual(body['state']['self'],self.snapshot()['self']);self.assertEqual(body['state']['characterRules'],self.snapshot()['characterRules']);self.assertEqual(result['reply'],reply['reply']);self.assertEqual(payload['reasoning'],{'enabled':False});self.assertIn('not private reasoning',payload['messages'][0]['content']);self.assertFalse(payload['provider']['allow_fallbacks'])
 def test_reply_contract_is_only_enabled_for_dialogue(self):
  s=self.snapshot();value={'action':'owner_reply','reason':'Ответ','reply':'Привет','reaction':'Рад'}
  adapter.validate_decision(json.dumps(value),s)
  for changed in [{**value,'reply':''},{**value,'reaction':'x'*241},{**value,'extra':True},{k:v for k,v in value.items()if k!='reply'}]:
   with self.assertRaises(ValueError):adapter.validate_decision(json.dumps(changed),s)
  del s['self']['ownerDialogue']
  with self.assertRaises(ValueError):adapter.validate_decision(json.dumps(value),s)
if __name__=='__main__':unittest.main()
