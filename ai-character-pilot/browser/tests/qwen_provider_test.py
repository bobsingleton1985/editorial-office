import unittest,sys,importlib.util,json,io,tempfile,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import openrouter_client as adapter
from jev_request_context import estimate_request_tokens,ContextError
spec=importlib.util.spec_from_file_location('qwen_server',Path(__file__).resolve().parents[1]/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class QwenProvider(unittest.TestCase):
 def snapshot(self):
  raw=(Path(__file__).resolve().parents[3]/'behavior-system/CHARACTER_RULES.md').read_text()
  return {'scope':'behavior-two-v01','revision':4,'requestId':'request-fixture','self':{'id':'editor','needs':{'fatigue':0,'social':90,'hunger':40},'memory':[{'event':'fixture','at':123}]},'characterRules':{'version':'newsroom-rules-v5','text':raw},'available_actions':[{'id':'accept:invitation-12','description':'Accept freely.'},{'id':'decline:invitation-12','description':'Decline freely.'}]}
 def reply(self,action='decline:invitation-12',finish='stop'):
  return {'choices':[{'finish_reason':finish,'message':{'content':json.dumps({'action':action,'reason':'Хочу закончить своё занятие.'})}}],'usage':{'prompt_tokens':123,'completion_tokens':21}}
 def test_qwen_preserves_rules_needs_memory_choices_without_old_sofa_bias(self):
  s=self.snapshot();before=json.dumps(s,sort_keys=True)
  with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(self.reply()).encode())) as call:
   result=adapter.choose(s,adapter.QWEN_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
  request=call.call_args.args[0];p=json.loads(request.data);body=json.loads(p['messages'][1]['content'])
  self.assertEqual(request.full_url,adapter.ENDPOINT);self.assertEqual(p['model'],adapter.QWEN_MODEL)
  self.assertEqual(body['state']['characterRules'],s['characterRules']);self.assertEqual(body['state']['self'],s['self'])
  self.assertEqual(set(body['questions']['next_action']['criteria']),{a['id']for a in s['available_actions']})
  self.assertEqual(p['response_format']['json_schema']['schema']['properties']['action']['enum'],[a['id']for a in s['available_actions']])
  self.assertEqual(p['provider'],{'only':['ModelRun'],'allow_fallbacks':False});self.assertEqual(p['reasoning'],{'enabled':False})
  self.assertNotIn('prefer going to the sofa',p['messages'][0]['content']);self.assertIn('No obligatory sequence',body['questions']['next_action']['instructions'])
  self.assertEqual(result['source'],'qwen');self.assertEqual(result['model'],adapter.QWEN_MODEL);self.assertNotIn('confidence',result)
  self.assertEqual(before,json.dumps(s,sort_keys=True))
 def test_invalid_action_and_truncated_response_rejected(self):
  for response in [self.reply('teleport'),self.reply(finish='length')]:
   with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
    with self.assertRaises(ValueError):adapter.choose(self.snapshot(),adapter.QWEN_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
 def test_final_wrapped_payload_overflow_blocks_before_network(self):
  with patch('jev_request_context.estimate_serialized_tokens',return_value=26000),patch('openrouter_client.urllib.request.urlopen') as call:
   with self.assertRaises(ContextError):adapter.choose(self.snapshot(),adapter.QWEN_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
   call.assert_not_called()
 def test_provider_context_rejection_has_stable_blocking_code(self):
  for status,body in [(413,{}),(400,{'error':{'code':'context_length_exceeded'}}),(400,{'error':{'metadata':{'raw':json.dumps({'error':{'message':'Input tokens exceed maximum context length'}})}}})]:
   error=urllib.error.HTTPError(adapter.ENDPOINT,status,'fixture',{},io.BytesIO(json.dumps(body).encode()))
   with self.subTest(status=status,body=body),patch('openrouter_client.urllib.request.urlopen',side_effect=error):
    with self.assertRaisesRegex(RuntimeError,'^qwen_context_provider_limit$'):
     adapter.choose(self.snapshot(),adapter.QWEN_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
 def test_startup_model_is_explicit_local_allowlist_and_not_credentials(self):
  with tempfile.TemporaryDirectory() as t,patch.object(server,'ROOT',Path(t)):
   p=Path(t)/'behavior-provider.json';p.write_text(json.dumps({'version':1,'model':adapter.QWEN_MODEL}));self.assertEqual(server.startup_model(),adapter.QWEN_MODEL)
   p.write_text(json.dumps({'version':1,'model':adapter.QWEN_FLASH_MODEL}));self.assertEqual(server.startup_model(),adapter.QWEN_FLASH_MODEL)
   p.write_text(json.dumps({'version':1,'model':'random/other'}))
   with self.assertRaises(ValueError):server.startup_model()
 def test_flash_preserves_context_uses_supported_json_mode_and_alibaba(self):
  original=self.snapshot()
  with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(self.reply()).encode())) as call:
   result=adapter.choose(original,adapter.QWEN_FLASH_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
  payload=json.loads(call.call_args.args[0].data)
  self.assertEqual(payload['model'],adapter.QWEN_FLASH_MODEL)
  self.assertEqual(payload['provider'],{'only':['Alibaba'],'allow_fallbacks':False})
  self.assertEqual(payload['response_format'],{'type':'json_object'})
  self.assertEqual(payload['reasoning'],{'enabled':False})
  content=json.loads(payload['messages'][1]['content']);self.assertEqual(content['state']['self'],original['self'])
  self.assertEqual(content['state']['characterRules'],original['characterRules'])
  self.assertEqual(list(content['questions']['next_action']['criteria']),[a['id']for a in original['available_actions']])
  self.assertEqual(result['source'],'qwen');self.assertEqual(result['model'],adapter.QWEN_FLASH_MODEL);self.assertNotIn('confidence',result)
 def test_flash_json_mode_still_rejects_unknown_actions_and_extra_keys(self):
  for response in [self.reply('teleport'),{'choices':[{'finish_reason':'stop','message':{'content':'{"action":"decline:invitation-12","reason":"fixture","confidence":1}'}}]}]:
   with patch('openrouter_client.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
    with self.assertRaises(ValueError):adapter.choose(self.snapshot(),adapter.QWEN_FLASH_MODEL,api_key='fixture-not-real',context_token_measure=estimate_request_tokens)
if __name__=='__main__':unittest.main()
