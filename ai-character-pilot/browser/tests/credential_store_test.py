import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('credential_http_fixture',Path(__file__).with_name('lan_control_test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
server=fixture.server
from credential_store import CredentialError


class MemoryStore:
    def __init__(self):self.value=None;self.error=None;self.writes=0
    def load(self):
        if self.error:raise CredentialError(self.error)
        return self.value
    load_unattended=load
    def save(self,value):
        if self.error:raise CredentialError(self.error)
        self.value=value;self.writes+=1
    def delete(self):
        if self.error:raise CredentialError(self.error)
        self.value=None


class CredentialHTTP(unittest.TestCase):
    req=fixture.LanControl.req
    pair=fixture.LanControl.pair
    def setUp(self):
        fixture.LanControl.setUp(self)
        self.store=MemoryStore()
        server.CREDENTIAL_STORE=self.store
        server.CREDENTIAL_STATE={'backend':'macos_keychain','saved':False,'error':None}

    def config(self,key='unit-test-secret'):
        return self.req('/api/config',{'model':'typesafe/jev-1.13','key':key},local=True)

    def test_save_readback_restart_and_no_secret_response(self):
        status,body=self.config()
        self.assertEqual(status,200)
        self.assertEqual(self.store.value,'unit-test-secret')
        self.assertTrue(body['credential_storage']['saved'])
        self.assertNotIn('unit-test-secret',json.dumps(body))
        server.CONFIG['key']=''
        server.initialize_credentials(self.store)
        self.assertEqual(server.CONFIG['key'],'unit-test-secret')
        self.assertTrue(self.req('/api/status',local=True)[1]['configured'])
        self.assertNotIn('unit-test-secret',json.dumps(self.req('/api/status',local=True)))

    def test_replace_and_delete_persist_and_clear_runtime(self):
        self.config();self.config('replacement-test-secret')
        self.assertEqual(self.store.value,'replacement-test-secret')
        self.assertEqual(self.req('/api/credentials/forget',{},local=True)[0],200)
        self.assertIsNone(self.store.value)
        self.assertEqual(server.CONFIG['key'],'')
        server.initialize_credentials(self.store)
        self.assertFalse(self.req('/api/status',local=True)[1]['configured'])

    def test_store_failure_preserves_runtime_and_reports_failure(self):
        old=server.CONFIG.copy();self.store.error='keychain_locked_or_denied'
        self.assertEqual(self.config(),(503,{'error':'keychain_locked_or_denied'}))
        self.assertEqual(server.CONFIG,old)
        self.assertEqual(self.store.writes,0)
        self.assertFalse(server.CREDENTIAL_STATE['saved'])

    def test_readback_mismatch_never_claims_success(self):
        old=server.CONFIG.copy()
        with patch.object(self.store,'load',return_value='different-test-value'):
            self.assertEqual(self.config(),(503,{'error':'keychain_operation_failed'}))
        self.assertEqual(server.CONFIG,old)

    def test_locked_startup_does_not_hang_or_clear_environment_connection(self):
        old=server.CONFIG.copy();self.store.error='keychain_locked_or_denied'
        server.initialize_credentials(self.store)
        self.assertEqual(server.CONFIG,old)
        self.assertEqual(server.CREDENTIAL_STATE['error'],'keychain_locked_or_denied')

    def test_lan_cannot_save_load_forget_or_inspect_storage(self):
        token=self.pair()
        for path,data in [('/api/config',{'model':'typesafe/jev-1.13','key':'malicious'}),('/api/credentials/load',{}),('/api/credentials/forget',{})]:
            self.assertEqual(self.req(path,data,token=token),(403,{'error':'local_only'}))
        self.assertNotIn('credential_storage',self.req('/api/status',token=token)[1])
        self.assertEqual(self.store.writes,0)

    def test_active_or_inflight_session_prevents_all_mutations(self):
        server.CONTROL.start('local','credential-test')
        for path,data in [('/api/config',{'model':'typesafe/jev-1.13','key':'replacement'}),('/api/credentials/load',{}),('/api/credentials/forget',{})]:
            self.assertEqual(self.req(path,data,local=True)[0],409)
        self.assertEqual(self.store.writes,0)
        server.CONTROL=fixture.BehaviorControl()
        server.CALL_LOCK.acquire()
        try:self.assertEqual(self.config(),(409,{'error':'request_in_progress'}))
        finally:server.CALL_LOCK.release()

    def test_invalid_input_does_not_touch_storage(self):
        for key in ['test\nsecret','test secret',42,['secret']]:
            self.assertEqual(self.config(key)[0],400)
        self.assertEqual(self.store.writes,0)

    def test_missing_saved_key_and_delete_failure_are_explicit(self):
        self.assertEqual(self.req('/api/credentials/load',{},local=True),(503,{'error':'saved_key_missing'}))
        self.config();self.store.error='keychain_locked_or_denied'
        self.assertEqual(self.req('/api/credentials/forget',{},local=True)[0],503)
        self.assertEqual(server.CONFIG['key'],'unit-test-secret')


if __name__=='__main__':unittest.main()
