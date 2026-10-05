import copy
import io
import json
import hashlib
import importlib.util
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT/'ai-character-pilot/browser'))
sys.path.insert(0, str(PROJECT/'ai-character-pilot'))
import openrouter_client as client
from jev_request_context import compile_request, project_request_for_diagnostics, ContextError, encode, resolve, MAX_BYTES, estimate_request_tokens, estimate_serialized_tokens, ESTIMATE_METHOD


def fixture_byte_counter(payload):
    # Deliberately synthetic fixture, NEVER an official Jev tokenizer.
    count=len(encode(payload))
    return {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':count,'requestTokens':count}


def expand(value, payload):
    if isinstance(value, dict):
        if set(value) == {'context_ref'}:
            return expand(resolve(payload, value['context_ref']), payload)
        if set(value) == {'context_table'}:
            table=value['context_table']
            return [{**expand(table.get('defaults',{}),payload),**dict(zip(table['columns'],expand(row,payload)))} for row in table['rows']]
        if set(value) == {'context_records'}:
            table=expand(value['context_records'],payload)
            return {key:{**table.get('defaults',{}),**row} for key,row in table['rows'].items()}
        if set(value) == {'context_actions'}:
            table=expand(value['context_actions'],payload)
            return [{'id':key,**table.get('metadata',{}).get(key,{})} for key in resolve(payload,table['criteria'])]
        return {key: expand(child, payload) for key, child in value.items()}
    if isinstance(value, list):
        return [expand(child, payload) for child in value]
    return value


def description(payload, identifier):
    text=payload['questions']['next_action']['criteria'][identifier]
    return re.sub(r'\[action_text:(t\d+)\]|@(\d+);' ,
                  lambda m:payload['state']['action_text'][m[1] or m[2]],text)


class ContextTests(unittest.TestCase):
    def snapshot(self):
        return {'scope':'behavior-two-v01','revision':3,'requestId':'request-1',
                'self':{'id':'editor','character':'Own character','needs':{'hunger':91},
                        'memory':[],'relationships':{},'finances':{'balance':123,'debts':[{'cents':55}]},
                        'currentActivity':{'partner':'peer','participatingSeconds':2}},
                'situation':{'others':'whole room'},
                'characterRules':{'version':'fixture','text':'Full rules','sha256':'fixture'},
                'limits':['Independent consent'],
                'available_actions':[{'id':'wait','description':'Wait'}, {'id':'talk','description':'Talk'}]}

    def payload(self,s=None):
        return client.systemone_payload(s or self.snapshot(), client.DEFAULT_MODEL)

    def test_current_facts_options_rules_and_source_unchanged(self):
        s=self.snapshot();before=copy.deepcopy(s)
        p,wire,audit=project_request_for_diagnostics(self.payload(s)); state=expand(p['state'],p)
        self.assertEqual(s,before)
        for key in ('characterRules','situation','limits'):
            self.assertEqual(state[key],s[key])
        for key in ('needs','finances','currentActivity','character'):
            self.assertEqual(state['self'][key],s['self'][key])
        self.assertEqual(list(p['questions']['next_action']['criteria']),['wait','talk'])
        self.assertEqual(audit['tokens'],None)
        self.assertEqual(json.loads(wire),p)

    def test_full_action_meaning_and_common_text_expand_exactly(self):
        s=self.snapshot();shared='A shared rule about independently consenting partners and preserving all actual prices and obligations, including outstanding debt, confirmed actual execution, the partner identity and the full duration of participation.'
        for i,action in enumerate(s['available_actions']):
            action.update(description='Short',description_full=f'Choice {i}. '+shared)
        p,_,_=project_request_for_diagnostics(self.payload(s))
        self.assertIn('action_text',p['state'])
        for action in s['available_actions']:
            self.assertEqual(description(p,action['id']),action['description_full'])
        for action in p['state']['available_actions']:
            self.assertNotIn('description_full',action)

    def test_exact_duplicate_facts_resolve_with_escaped_pointer(self):
        s=self.snapshot();event={'id':'event-1','summary':'Observed event.'*30,'amountCents':100}
        s['self']['relationships']={'peer/~name':{'observations':[event]}}
        s['self']['memory']=[copy.deepcopy(event)]
        p,_,audit=project_request_for_diagnostics(self.payload(s))
        self.assertGreater(audit['references'],0)
        self.assertEqual(expand(p['state']['self'],p)['memory'],s['self']['memory'])

    def test_reflection_keeps_actual_evidence_and_assessment(self):
        s=self.snapshot();events=[{'id':'actual','kind':'conversation_experienced','participatingSeconds':95}]
        basis=[{'id':'prior','summary':'Prior actual evidence'}]
        s['self']['reflection']={'actor':'editor','partner':'peer','key':'sympathy','events':events}
        s['self']['relationships']={'peer':{'dimensions':{'sympathy':{'value':1,'basis':basis},'professional':{'value':2}},
                                          'observations':[{'id':'unrelated'}]},'other':{'dimensions':{'sympathy':{'value':0}}}}
        p,_,audit=project_request_for_diagnostics(self.payload(s));actor=expand(p['state']['self'],p)
        self.assertEqual(actor['reflection']['events'],events)
        self.assertEqual(actor['relationships']['peer']['dimensions']['sympathy']['basis'],basis)
        self.assertNotIn('other',actor['relationships'])
        self.assertNotIn('finances',actor)
        self.assertIn('self.finances',audit['excludedSections'])

    def test_financial_reflection_preserves_debt_and_jealousy_dependency(self):
        s=self.snapshot()
        s['self']['reflection']={'partner':'peer','key':'jealousy','events':[{'kind':'loan_repaid'}]}
        s['self']['relationships']={'peer':{'dimensions':{'jealousy':{'value':1},'romance':{'value':2}}}}
        p,_,_=project_request_for_diagnostics(self.payload(s));actor=expand(p['state']['self'],p)
        self.assertEqual(actor['finances']['debts'],s['self']['finances']['debts'])
        self.assertEqual(actor['relationships']['peer']['dimensions']['romance']['value'],2)

    def test_less_relevant_history_leaves_before_current_partner_memory(self):
        s=self.snapshot()
        s['self']['memory']=[{'id':'relevant','partner':'peer','text':'x'*3000}]
        s['self']['finances']['transactions']=[{'id':'unrelated','text':'y'*3000}]
        p,wire,audit=project_request_for_diagnostics(self.payload(s),max_bytes=6000)
        self.assertLessEqual(len(wire),6000)
        self.assertEqual(audit['omittedHistory'][0]['id'],'unrelated')
        self.assertEqual(expand(p['state']['self'],p)['memory'][0]['id'],'relevant')
        self.assertEqual(s['self']['finances']['transactions'][0]['id'],'unrelated')

    def test_active_boundary_never_evicted_even_if_old(self):
        s=self.snapshot();s['self']['memory']=[{'id':'boundary','kind':'directed_objection','summary':'x'*40000}]
        with self.assertRaises(ContextError) as caught:project_request_for_diagnostics(self.payload(s))
        self.assertEqual(caught.exception.report['omittedHistory'],[])

    def test_large_choices_and_multibyte_core_block_before_network(self):
        for field in ('characterRules','available_actions'):
            s=self.snapshot()
            if field=='characterRules':s[field]['text']='я'*MAX_BYTES
            else:s[field]=[{'id':'choice_'+str(i),'description':''.join(hashlib.sha256(f'{i}:{j}'.encode()).hexdigest() for j in range(70))} for i in range(30)]
            with patch.object(client.urllib.request,'urlopen') as network,patch.object(client,'emit_trace'):
                with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
                    client.choose(s,client.DEFAULT_MODEL,api_key='fixture',context_token_measure=fixture_byte_counter)
                network.assert_not_called()

    def test_wire_body_trace_and_call_agree(self):
        reply={'answers':{'next_action':{'type':'choice','choice':'talk','confidence':1,
                                      'probabilities':{'wait':0,'talk':1}}}}
        events=[]
        with patch.object(client,'emit_trace',side_effect=lambda _,event,**fields:events.append((event,fields))), \
             patch.object(client.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(reply).encode())) as network:
            self.assertEqual(client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture',context_token_measure=fixture_byte_counter)['action'],'talk')
        wire=network.call_args.args[0].data
        trace=next(fields for event,fields in events if event=='provider_request')
        self.assertEqual(wire,trace['body_utf8'].encode())
        self.assertEqual(json.loads(wire),trace['payload'])
        self.assertLessEqual(len(wire),MAX_BYTES)
        self.assertTrue(any(event=='context_budget' for event,_ in events))

    def test_unknown_model_is_blocked(self):
        p=self.payload();p['model']='typesafe/jev-latest'
        with self.assertRaisesRegex(ContextError,'jev_context_model_unverified'):project_request_for_diagnostics(p)

    def test_reserved_source_fields_are_not_overwritten(self):
        s=self.snapshot();s['action_text']={'original':'Source fact'}
        p,_,_=project_request_for_diagnostics(self.payload(s));self.assertEqual(p['state']['action_text'],s['action_text'])

    def test_financial_table_preserves_every_amount_and_action(self):
        s=self.snapshot();rows=[{'action':'lunch_'+str(i),'ownCostCents':200,'remainingCents':700,'repayingDebt':None} for i in range(20)]
        s['self']['finances']['livelihood']={'wallet':{'spendingChoices':rows}}
        p,_,_=project_request_for_diagnostics(self.payload(s))
        self.assertEqual(expand(p['state']['self'],p)['finances']['livelihood']['wallet']['spendingChoices'],rows)
        self.assertIn('context_table',p['state']['self']['finances']['livelihood']['wallet']['spendingChoices'])

    def test_nested_activity_history_is_bounded_without_losing_participation(self):
        s=self.snapshot();s['self']['currentActivity']['relationship']={'dimensions':{'sympathy':{'value':1}},'observations':[{'id':'historical','text':'x'*MAX_BYTES}]}
        p,wire,audit=project_request_for_diagnostics(self.payload(s))
        activity=expand(p['state']['self']['currentActivity'],p)
        self.assertEqual(activity['participatingSeconds'],2)
        self.assertEqual(activity['relationship']['dimensions']['sympathy']['value'],1)
        self.assertEqual(activity['relationship']['observations'],[])
        self.assertLessEqual(len(wire),MAX_BYTES)

    def test_server_returns_context_error_and_does_not_call_network(self):
        from email.message import Message
        spec=importlib.util.spec_from_file_location('assembly_server',PROJECT/'ai-character-pilot/browser/server.py')
        server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
        server.CONFIG={'model':client.DEFAULT_MODEL,'key':'fixture'}
        lease=server.CONTROL.start('local','test-client-01')
        s=self.snapshot();s['sessionId']='test-client-01';s['characterRules']['text']='я'*MAX_BYTES
        body=json.dumps({'snapshot':s,'session_id':lease['session_id']}).encode()
        h=object.__new__(server.Handler);h.path='/api/behavior-decide';h.headers=Message()
        h.headers['Content-Type']='application/json';h.headers['Content-Length']=str(len(body));h.rfile=io.BytesIO(body)
        h.valid_host=lambda:True;captured=[];h.send_json=lambda status,data:captured.append((status,data))
        with patch.object(client.urllib.request,'urlopen') as network,patch.object(client,'emit_trace'), \
             patch.object(server,'choose',side_effect=lambda *args,**kwargs:client.choose(*args,**{**kwargs,'context_token_measure':fixture_byte_counter})):
            h.do_POST();network.assert_not_called()
        self.assertEqual(captured[0][0],413)
        self.assertEqual(captured[0][1]['error'],'jev_context_core_exceeds_limit')

    def test_identical_inputs_produce_identical_projection(self):
        s=self.snapshot();shared='A sentence preserving the terms of independent consent and the exact price, target, obligations, participation duration and conditions of real completion for every available action.'
        for i,action in enumerate(s['available_actions']):action['description']=f'Option {i}. '+shared
        first,wire1,audit1=project_request_for_diagnostics(self.payload(s));second,wire2,audit2=project_request_for_diagnostics(self.payload(s))
        self.assertEqual(wire1,wire2);self.assertEqual(audit1,audit2)

    def test_duplicate_ids_with_different_facts_are_not_merged(self):
        s=self.snapshot();s['self']['memory']=[{'id':'same','summary':'x'*200,'amountCents':100},
                                               {'id':'same','summary':'x'*200,'amountCents':200}]
        p,_,_=project_request_for_diagnostics(self.payload(s))
        self.assertEqual(expand(p['state']['self'],p)['memory'],s['self']['memory'])

    def test_malformed_optional_history_does_not_crash(self):
        for relations in ([{}],{'peer':{'dimensions':[{}],'courtship':None}}):
            s=self.snapshot();s['self']['relationships']=relations
            p,_,_=project_request_for_diagnostics(self.payload(s));self.assertEqual(expand(p['state']['self'],p)['relationships'],relations)

    def test_current_cause_event_survives_history_pressure(self):
        s=self.snapshot();s['self']['currentActivity']['causeEventId']='cause-1'
        s['self']['memory']=[{'id':'cause-1','text':'x'*3500},{'id':'noise','text':'y'*3500}]
        p,wire,audit=project_request_for_diagnostics(self.payload(s),max_bytes=6500)
        self.assertIn('cause-1',[event['id'] for event in expand(p['state']['self'],p)['memory']])
        self.assertNotIn('cause-1',[event['id'] for event in audit['omittedHistory']])

    def test_missing_required_evidence_blocks_without_inventing_it(self):
        s=self.snapshot();s['self']['currentActivity']['causeEventId']='missing'
        with self.assertRaisesRegex(ContextError,'jev_context_required_evidence_missing'):project_request_for_diagnostics(self.payload(s))

    def test_reflection_prior_evaluation_cannot_be_evicted(self):
        s=self.snapshot();s['self']['reflection']={'partner':'peer','key':'sympathy','events':[]}
        s['self']['relationships']={'peer':{'dimensions':{'sympathy':{'value':1,'basis':[{'evaluationId':'prior-1'}]}},
                                         'dimensionDecisions':[{'id':'prior-1','dimension':'sympathy','text':'x'*3000}]}}
        with self.assertRaises(ContextError) as caught:project_request_for_diagnostics(self.payload(s),max_bytes=2500)
        self.assertNotIn('prior-1',[event['id'] for event in caught.exception.report['omittedHistory']])

    def test_native_counter_is_called_on_final_payload_and_replaces_byte_policy(self):
        s=self.snapshot();s['characterRules']['text']='я'*20000
        observed=[]
        def fixture_counter(payload):
            observed.append(copy.deepcopy(payload))
            return {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':25000,'requestTokens':25000}
        p,wire,audit=compile_request(self.payload(s),token_measure=fixture_counter)
        self.assertGreater(len(wire),MAX_BYTES)
        self.assertEqual(observed[-1],p)
        self.assertEqual(audit['tokens'],25000)
        self.assertIsNone(audit['byteCeiling'])

    def test_native_counter_target_and_invalid_values(self):
        measurement={'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':26001,'requestTokens':26001}
        p,wire,audit=compile_request(self.payload(),token_measure=lambda _:measurement)
        self.assertTrue(audit['targetExceeded']);self.assertFalse(audit['hardLimitExceeded'])
        for measurement in (
            {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':32001,'requestTokens':32001},
            {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':25000,'requestTokens':64001}):
            with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
                compile_request(self.payload(),token_measure=lambda _,value=measurement:value)
        for measurement in (
            {},{'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':True,'requestTokens':1},
            {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':-1,'requestTokens':1},
            {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':3,'requestTokens':2}):
            with self.assertRaisesRegex(ContextError,'jev_context_invalid_token_measurement'):
                compile_request(self.payload(),token_measure=lambda _,value=measurement:value)

    def test_source_claimed_token_count_cannot_bypass_admission(self):
        s=self.snapshot();s['claimedTokens']=1;s['characterRules']['text']='я'*MAX_BYTES
        with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):project_request_for_diagnostics(self.payload(s))

    def test_nested_required_event_is_pinned(self):
        s=self.snapshot();s['self']['currentActivity']['causeEventId']='nested'
        s['self']['memory']=[{'id':'wrapper','events':[{'id':'nested','summary':'x'*20000}]},
                            {'id':'noise','summary':'y'*15000}]
        p,_,audit=project_request_for_diagnostics(self.payload(s))
        self.assertEqual(expand(p['state']['self'],p)['memory'][0]['events'][0]['id'],'nested')
        self.assertNotIn('wrapper',[row['id'] for row in audit['omittedHistory']])

    def test_reflection_restores_source_evidence_from_filtered_memory(self):
        s=self.snapshot();s['self']['reflection']={'partner':'peer','key':'sympathy','events':[{'sourceEventId':'source'}]}
        s['self']['relationships']={'peer':{'dimensions':{'sympathy':{'value':1}}}}
        event={'id':'source','kind':'conversation_experienced','participatingSeconds':75}
        s['self']['memory']=[event]
        p,_,audit=project_request_for_diagnostics(self.payload(s))
        self.assertIn(event,expand(p['state']['context_required_evidence'],p))
        self.assertEqual(s['self']['memory'],[event])

    def test_counter_cannot_change_wire_or_trace_by_mutating_input(self):
        def fixture_counter(payload):
            payload['state'].clear()
            return {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':1000,'requestTokens':1000}
        p,wire,audit=compile_request(self.payload(),token_measure=fixture_counter)
        self.assertEqual(json.loads(wire),p)
        self.assertEqual(p['state']['self']['needs'],{'hunger':91})

    def test_rules_keep_their_canonical_location_even_with_duplicate_cache(self):
        s=self.snapshot();s['characterRules']['text']='Full rule text. '*30
        s['self']['rulesCache']=copy.deepcopy(s['characterRules'])
        p,_,_=project_request_for_diagnostics(self.payload(s))
        self.assertEqual(p['state']['characterRules'],s['characterRules'])
        self.assertEqual(expand(p['state']['self']['rulesCache'],p),s['characterRules'])


    def test_provider_admission_without_counter_fails_closed(self):
        events=[]
        with patch.object(client.urllib.request,'urlopen') as network, \
             patch.object(client,'emit_trace',side_effect=lambda _,event,**fields:events.append((event,fields))):
            with self.assertRaisesRegex(ContextError,'jev_context_token_counter_unavailable'):
                client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture')
        network.assert_not_called()
        self.assertEqual([event for event,_ in events],['provider_request_blocked'])
        self.assertFalse(events[0][1]['contextBudget']['providerAdmission'])

    def test_offline_bytes_cannot_authorize_provider_admission(self):
        _,_,audit=project_request_for_diagnostics(self.payload())
        self.assertFalse(audit['providerAdmission'])
        with self.assertRaisesRegex(ContextError,'jev_context_token_counter_unavailable'):
            compile_request(self.payload())
        with self.assertRaises(TypeError):compile_request(self.payload(),max_bytes=MAX_BYTES)

    def test_broken_native_counter_is_blocked_without_exposing_detail(self):
        def broken(_):raise RuntimeError('fixture-secret-must-not-be-exposed')
        with patch.object(client.urllib.request,'urlopen') as network,patch.object(client,'emit_trace') as trace:
            with self.assertRaisesRegex(ContextError,'jev_context_token_measurement_failed'):
                client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture',context_token_measure=broken)
        network.assert_not_called()
        self.assertNotIn('fixture-secret',str(trace.call_args))


    def test_native_hard_boundaries_are_inclusive(self):
        for longest,total in ((26000,26000),(32000,64000)):
            with self.subTest(longest=longest,total=total):
                _,_,audit=compile_request(self.payload(),token_measure=lambda _: {
                    'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':longest,'requestTokens':total})
                self.assertTrue(audit['providerAdmission'])
                self.assertFalse(audit['hardLimitExceeded'])
        for longest,total in ((32001,64000),(32000,64001)):
            with self.subTest(longest=longest,total=total):
                with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
                    compile_request(self.payload(),token_measure=lambda _: {
                        'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':longest,'requestTokens':total})

    def test_server_reports_missing_counter_as_unavailable(self):
        from email.message import Message
        spec=importlib.util.spec_from_file_location('strict_assembly_server',PROJECT/'ai-character-pilot/browser/server.py')
        server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
        server.CONFIG={'model':client.DEFAULT_MODEL,'key':'fixture'}
        server.CONTEXT_TOKEN_MEASURE=None
        lease=server.CONTROL.start('local','test-client-01')
        s=self.snapshot();s['sessionId']='test-client-01'
        body=json.dumps({'snapshot':s,'session_id':lease['session_id']}).encode()
        h=object.__new__(server.Handler);h.path='/api/behavior-decide';h.headers=Message()
        h.headers['Content-Type']='application/json';h.headers['Content-Length']=str(len(body));h.rfile=io.BytesIO(body)
        h.valid_host=lambda:True;captured=[];h.send_json=lambda status,data:captured.append((status,data))
        with patch.object(client.urllib.request,'urlopen') as network,patch.object(client,'emit_trace'):
            h.do_POST();network.assert_not_called()
        self.assertEqual(captured[0][0],503)
        self.assertEqual(captured[0][1]['error'],'jev_context_token_counter_unavailable')


    def test_failed_recount_has_no_stale_measurement_from_prior_body(self):
        s=self.snapshot();s['self']['memory']=[{'id':'optional','summary':'x'*2000}]
        for failure in ('exception','invalid'):
            calls=[]
            def counter(payload):
                calls.append(copy.deepcopy(payload))
                if len(calls)==1:
                    return {'model':client.DEFAULT_MODEL,'stateAndLongestQuestionTokens':33000,'requestTokens':33000}
                if failure=='exception':raise RuntimeError('private-detail')
                return {}
            with self.assertRaises(ContextError) as caught:
                compile_request(self.payload(s),token_measure=counter)
            audit=caught.exception.report
            self.assertEqual(len(calls),2)
            self.assertIsNone(audit['tokens']);self.assertIsNone(audit['requestTokens'])
            self.assertIsNone(audit['targetExceeded']);self.assertIsNone(audit['hardLimitExceeded'])
            self.assertEqual(audit['afterBytes'],len(encode(calls[-1])))
            self.assertFalse(audit['providerAdmission'])


    def test_status_reports_strict_guard_readiness_without_secrets(self):
        spec=importlib.util.spec_from_file_location('guard_status_server',PROJECT/'ai-character-pilot/browser/server.py')
        server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
        status=server.context_guard_status()
        self.assertTrue(status['ready']);self.assertFalse(status['strict'])
        self.assertTrue(status['enforced']);self.assertFalse(status['exact_token_count'])
        self.assertEqual(status['mode'],'estimated')
        self.assertEqual(status['admission_context_limit'],25600)
        self.assertEqual(status['admission_request_limit'],51200)
        server.CONTEXT_TOKEN_MEASURE=None
        status=server.context_guard_status()
        self.assertFalse(status['ready']);self.assertTrue(status['strict'])
        self.assertFalse(status['counter_available'])
        self.assertEqual(status['error'],'jev_context_token_counter_unavailable')
        self.assertEqual(status['state_and_longest_question_limit'],32000)
        self.assertEqual(status['request_limit'],64000)
        self.assertNotIn('key',status)
        server.CONTEXT_TOKEN_MEASURE=fixture_byte_counter
        self.assertTrue(server.context_guard_status()['ready'])
        self.assertIsNone(server.context_guard_status()['error'])



    def test_estimate_measures_final_multilingual_json_and_never_claims_exact_tokens(self):
        s=self.snapshot();s['self']['character']='Актёр speaks English 中文 😀 123456'
        before=copy.deepcopy(s)
        payload,wire,audit=compile_request(self.payload(s),token_measure=estimate_request_tokens)
        measured=estimate_request_tokens(payload)
        self.assertEqual(s,before);self.assertEqual(json.loads(wire),payload)
        self.assertEqual(audit['estimatedTokens'],measured['stateAndLongestQuestionTokens'])
        self.assertEqual(audit['estimatedRequestTokens'],measured['requestTokens'])
        self.assertIsNone(audit['tokens']);self.assertIsNone(audit['requestTokens'])
        self.assertIsNone(audit['hardLimitExceeded']);self.assertFalse(audit['exactTokenCount'])
        self.assertEqual(audit['measurement'],ESTIMATE_METHOD)
        self.assertTrue(audit['providerAdmission'])
        self.assertEqual(payload['state']['characterRules'],s['characterRules'])
        self.assertEqual(list(payload['questions']['next_action']['criteria']),['wait','talk'])
        # Foreign text and punctuation are not mistaken for cheap Latin words.
        self.assertGreater(estimate_serialized_tokens('яяяяяя'),estimate_serialized_tokens('aaaaaa'))
        self.assertGreater(estimate_serialized_tokens('😀😀'),estimate_serialized_tokens('aaaaaa'))
        extra=copy.deepcopy(payload);extra['questions']['second']={'instructions':'Другой вопрос '*30}
        two=estimate_request_tokens(extra)
        self.assertGreater(two['requestTokens'],measured['requestTokens'])
        self.assertLessEqual(two['stateAndLongestQuestionTokens'],two['requestTokens'])

    def test_estimated_admission_uses_reserve_inclusively_and_sanitizes_failed_recount(self):
        def fixture(longest,total):
            def counter(_):return {'model':client.DEFAULT_MODEL,'method':ESTIMATE_METHOD,'exact':False,
                                  'stateAndLongestQuestionTokens':longest,'requestTokens':total}
            counter.measurement_method=ESTIMATE_METHOD
            return counter
        for longest,total in ((24000,24000),(25600,51200)):
            _,_,audit=compile_request(self.payload(),token_measure=fixture(longest,total))
            self.assertTrue(audit['providerAdmission'])
        for longest,total in ((25601,51200),(25600,51201)):
            with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
                compile_request(self.payload(),token_measure=fixture(longest,total))
        # An estimate cannot masquerade as a native counter.
        counter=fixture(1,1);del counter.measurement_method
        with self.assertRaisesRegex(ContextError,'jev_context_invalid_token_measurement'):
            compile_request(self.payload(),token_measure=counter)
        calls=[]
        def broken(payload):
            calls.append(payload)
            if len(calls)==1:return fixture(25601,25601)(payload)
            raise ValueError('private-detail')
        broken.measurement_method=ESTIMATE_METHOD
        s=self.snapshot();s['self']['memory']=[{'id':'optional','summary':'x'*2000}]
        with self.assertRaises(ContextError) as caught:compile_request(self.payload(s),token_measure=broken)
        self.assertEqual(len(calls),2)
        for key in ('tokens','requestTokens','estimatedTokens','estimatedRequestTokens','admissionLimitExceeded'):
            self.assertIsNone(caught.exception.report[key])
        self.assertFalse(caught.exception.report['providerAdmission'])

    def test_estimator_prunes_optional_history_but_never_required_core_or_choices(self):
        s=self.snapshot();s['self']['memory']=[{'id':'noise','summary':'я'*40000}]
        p,_,audit=compile_request(self.payload(s),token_measure=estimate_request_tokens)
        self.assertEqual(expand(p['state']['self'],p)['memory'],[])
        self.assertEqual(list(p['questions']['next_action']['criteria']),['wait','talk'])
        self.assertEqual(s['self']['memory'][0]['summary'],'я'*40000)
        s['self']['currentActivity']['causeEventId']='noise'
        with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
            compile_request(self.payload(s),token_measure=estimate_request_tokens)
        s=self.snapshot();s['characterRules']['text']='я'*30000
        with patch.object(client.urllib.request,'urlopen') as network,patch.object(client,'emit_trace'):
            with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):
                client.choose(s,client.DEFAULT_MODEL,api_key='fixture',context_token_measure=estimate_request_tokens)
            network.assert_not_called()

    def test_provider_overflow_is_explicit_and_usage_only_contains_safe_numbers(self):
        from urllib.error import HTTPError
        error=HTTPError('https://fixture.invalid',400,'Bad request',{},io.BytesIO(
            json.dumps({'error':{'message':'Maximum context length 32000 tokens; requested 33000. private-detail'}}).encode()))
        events=[]
        with patch.object(client.urllib.request,'urlopen',side_effect=error) as network,patch.object(client,'emit_trace',side_effect=lambda _,event,**fields:events.append((event,fields))):
            with self.assertRaisesRegex(RuntimeError,'jev_context_provider_limit'):
                client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture',context_token_measure=estimate_request_tokens)
            self.assertEqual(network.call_count,1)
        self.assertNotIn('private-detail',str(events))
        self.assertEqual(next(fields for event,fields in events if event=='provider_error')['category'],'context_limit')
        reply={'answers':{'next_action':{'type':'choice','choice':'talk','confidence':1,'probabilities':{'wait':0,'talk':1}}},
               'usage':{'input_tokens':100,'output_tokens':10,'total_tokens':110,'prompt_tokens':True,'completion_tokens':-1,'secret':'private-detail'}}
        events=[]
        with patch.object(client.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(reply).encode())),patch.object(client,'emit_trace',side_effect=lambda _,event,**fields:events.append((event,fields))):
            result=client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture',context_token_measure=estimate_request_tokens)
        self.assertEqual(result['action'],'talk')
        usage=next(fields for event,fields in events if event=='provider_usage')
        self.assertEqual(usage['usage'],{'input_tokens':100,'output_tokens':10,'total_tokens':110})
        self.assertEqual(usage['measurement'],'provider_post_response')
        self.assertNotIn('private-detail',str(events))



    def test_provider_size_errors_in_wrapped_responses_are_safely_classified(self):
        from urllib.error import HTTPError
        bodies=[(413,{'error':{'message':'Request too large private-detail'}}),
                (400,{'error':{'message':'Provider returned error','metadata':{'raw':json.dumps({'error':{'code':'context_length_exceeded','message':'private-detail'}}),'secret':'private-detail'}}}),
                (400,{'error':{'metadata':{'raw':{'error':{'code':'context_window_exceeded'}}}}})]
        for code,body in bodies:
            with self.subTest(code=code,body=body):
                error=HTTPError('https://fixture.invalid',code,'Rejected',{},io.BytesIO(json.dumps(body).encode()))
                events=[]
                with patch.object(client.urllib.request,'urlopen',side_effect=error) as network,patch.object(client,'emit_trace',side_effect=lambda _,event,**fields:events.append((event,fields))):
                    with self.assertRaisesRegex(RuntimeError,'jev_context_provider_limit'):
                        client.choose(self.snapshot(),client.DEFAULT_MODEL,api_key='fixture',context_token_measure=estimate_request_tokens)
                    self.assertEqual(network.call_count,1)
                error.close()
                self.assertNotIn('private-detail',str(events))
                self.assertEqual(next(fields for event,fields in events if event=='provider_error')['category'],'context_limit')
        # An unrelated provider rejection must keep its original HTTP category.
        error=HTTPError('https://fixture.invalid',400,'Rejected',{},io.BytesIO(json.dumps({'error':{'message':'Provider returned error','metadata':{'raw':'invalid request'}}}).encode()))
        self.assertEqual(client.http_error_category(error),{'category':'provider_rejected'});error.close()



    def test_many_actions_compact_losslessly_without_changing_ids_metadata_or_meaning(self):
        s=self.snapshot();phrase='One complete factual statement, with independent consent and the exact money amount 123 cents.'
        s['available_actions']=[{'id':'choice_'+str(i),'description_full':f'Variant {i}: '+phrase,'description':'Short',**({'semantic_id':'real_'+str(i),'effect':{'hunger':-2}} if i%3==0 else {})} for i in range(60)]
        before=copy.deepcopy(s)
        payload,_,audit=compile_request(self.payload(s),token_measure=estimate_request_tokens)
        self.assertIn('context_actions',payload['state']['available_actions'])
        self.assertEqual(list(payload['questions']['next_action']['criteria']),[row['id'] for row in s['available_actions']])
        for original,decoded in zip(s['available_actions'],expand(payload['state']['available_actions'],payload)):
            self.assertEqual(decoded,{key:value for key,value in original.items() if key not in ('description','description_full')})
            self.assertEqual(description(payload,original['id']),original['description_full'])
        self.assertEqual(s,before)
        self.assertLess(audit['afterBytes'],audit['beforeBytes'])
        self.assertNotIn('[action_text:',str(payload['questions']['next_action']['criteria']))

    def test_phrase_markers_do_not_rewrite_literal_markers_or_previously_inserted_markers(self):
        from jev_request_context import factor_action_phrases
        payload=self.payload();payload['questions']['next_action']['criteria']['wait']='Literal @1; is user data, not a marker'
        factor_action_phrases(payload)
        self.assertNotIn('action_text',payload['state'])
        # Numbered spans may be adjacent to an inserted @N; later factoring
        # must not replace the numeric suffix of an earlier marker.
        payload=self.payload();criteria=payload['questions']['next_action']['criteria']
        criteria.clear()
        for i in range(16):criteria[str(i)]=f'Option {i}. Common phrase with facts, followed by 1 USD in a repeated factual suffix. Another repeated factual suffix containing 1 USD in a repeated factual suffix.'
        before=copy.deepcopy(criteria);factor_action_phrases(payload)
        for key,original in before.items():self.assertEqual(description(payload,key),original)
        self.assertTrue(all('@' not in text for text in payload['state']['action_text'].values()))
        payload=self.payload();shared='Shared factual statement ending '+('12345'*20)
        payload['questions']['next_action']['criteria']={'a':shared,'b':shared,'c':shared+'2'}
        factor_action_phrases(payload)
        for key,original in {'a':shared,'b':shared,'c':shared+'2'}.items():self.assertEqual(description(payload,key),original)

    def test_common_dimension_and_financial_fields_preserve_types_absence_and_causal_basis(self):
        s=self.snapshot();dims={key:{'value':0,'revision':1,'basis':None,'updatedAt':None,'assessedAt':i} for i,key in enumerate(('professional','personal','sympathy','romance','jealousy'))}
        del dims['personal']['assessedAt'];dims['romance']['value']=False
        s['self']['relationships']={'peer':{'dimensions':dims}}
        rows=[{'action':str(i),'cents':False if i%2 else 0,'meal':False,'other':None} for i in range(12)]
        s['self']['finances']['livelihood']={'wallet':{'spendingChoices':rows}}
        payload,_,_=compile_request(self.payload(s),token_measure=estimate_request_tokens)
        decoded=expand(payload['state']['self'],payload)
        self.assertEqual(json.dumps(decoded['relationships']['peer']['dimensions'],sort_keys=True),json.dumps(dims,sort_keys=True))
        self.assertEqual(json.dumps(decoded['finances']['livelihood']['wallet']['spendingChoices'],sort_keys=True),json.dumps(rows,sort_keys=True))
        self.assertIn('context_records',payload['state']['self']['relationships']['peer']['dimensions'])
        self.assertIn('defaults',payload['state']['self']['finances']['livelihood']['wallet']['spendingChoices']['context_table'])
        self.assertNotIn('cents',payload['state']['self']['finances']['livelihood']['wallet']['spendingChoices']['context_table']['defaults'])

    def test_terminal_financial_history_is_optional_but_active_rows_and_required_causes_survive(self):
        s=self.snapshot();s['self']['finances']['performances']=[{'id':'active','status':'accepted','cents':123,'text':'x'*3500},{'id':'closed','status':'cancelled','cents':456,'text':'y'*6000}]
        payload,_,audit=project_request_for_diagnostics(self.payload(s),max_bytes=7000)
        self.assertEqual(expand(payload['state']['self'],payload)['finances']['performances'],[s['self']['finances']['performances'][0]])
        self.assertIn('closed',[row['id'] for row in audit['omittedHistory']])
        self.assertNotIn('active',[row['id'] for row in audit['omittedHistory']])
        s['self']['currentActivity']['causeEventId']='closed'
        with self.assertRaisesRegex(ContextError,'jev_context_core_exceeds_limit'):project_request_for_diagnostics(self.payload(s),max_bytes=7000)

    def test_only_known_diagnostic_fields_and_executor_tags_are_omitted(self):
        s=self.snapshot();s['self']['contextProjection']={'reason':'bounded_transport_history','maxStateBytes':65000,'omittedRecords':4}
        s['self']['relationships']={'peer':{'projection':{'decisionsAvailable':1,'observationsAvailable':2},'dimensions':{}}}
        assignment={'actor':'editor','place':'seatA','posture':'sit','pose':{'x':1,'z':2,'th':3},'mustKeepSeatFrame':True,'preserveSeated':True,'changesPostureOrPlace':False,'contactProfile':'contact-file','playbackProfile':'profile','entryTags':['tag'],'exitTags':[]}
        s['self']['currentActivity']['assignment']=assignment
        payload,_,audit=compile_request(self.payload(s),token_measure=estimate_request_tokens);actor=expand(payload['state']['self'],payload)
        self.assertNotIn('contextProjection',actor);self.assertNotIn('projection',actor['relationships']['peer'])
        self.assertEqual(actor['currentActivity']['assignment'],{key:value for key,value in assignment.items() if key not in ('contactProfile','playbackProfile','entryTags','exitTags')})
        # Unknown extensions can contain actual facts/evidence; never drop them.
        s['self']['contextProjection']['causeEventId']='evidence'
        s['self']['relationships']['peer']['projection']['sourceEventId']='evidence'
        s['self']['currentActivity']['assignment']['contactProfile']={'sourceEventId':'evidence'}
        s['self']['memory']=[{'id':'evidence','kind':'observed'}]
        payload,_,_=compile_request(self.payload(s),token_measure=estimate_request_tokens);actor=expand(payload['state']['self'],payload)
        self.assertEqual(actor['contextProjection'],s['self']['contextProjection'])
        self.assertEqual(actor['relationships']['peer']['projection'],s['self']['relationships']['peer']['projection'])
        self.assertEqual(actor['currentActivity']['assignment']['contactProfile'],s['self']['currentActivity']['assignment']['contactProfile'])



    def test_financial_refusals_and_live_services_never_become_disposable_history(self):
        for field in ('performances','services','offers','treats'):
            for status in ('offered','reserved','running','accepted','declined','pending','unresolved'):
                with self.subTest(field=field,status=status):
                    s=self.snapshot();s['self']['finances'][field]=[{'id':'commitment','status':status,'cents':300,'text':'x'*8000}]
                    with self.assertRaises(ContextError) as caught:project_request_for_diagnostics(self.payload(s),max_bytes=7000)
                    self.assertNotIn('commitment',[row['id'] for row in caught.exception.report['omittedHistory']])
        s=self.snapshot();s['self']['finances']['services']=[{'id':'paid','status':'paid','cents':300,'text':'x'*8000}]
        p,_,audit=project_request_for_diagnostics(self.payload(s),max_bytes=7000)
        self.assertEqual(expand(p['state']['self'],p)['finances']['services'],[])
        self.assertIn('paid',[row['id'] for row in audit['omittedHistory']])


if __name__=='__main__':unittest.main()
