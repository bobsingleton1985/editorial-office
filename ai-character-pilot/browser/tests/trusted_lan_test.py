import importlib.util,json,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('trusted_fixture',Path(__file__).with_name('lan_control_test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
server=fixture.server

class TrustedLAN(unittest.TestCase):
 def setUp(self):fixture.LanControl.setUp(self)
 def req(self,*args,**kwargs):return fixture.LanControl.req(self,*args,trusted='192.168.1.0/24',**kwargs)
 def test_subnet_access_without_code_and_no_secret(self):
  status=self.req('/api/status')[1]
  self.assertTrue(status['authorized']);self.assertTrue(status['configured']);self.assertTrue(status['trusted_lan']);self.assertFalse(status['lan_control'])
  self.assertNotIn('dummy-provider-secret',json.dumps(status));self.assertNotIn('credential_storage',status)
  self.assertFalse(self.req('/api/status',peer='192.168.2.42')[1]['authorized'])
  self.assertFalse(self.req('/api/status',peer='8.8.8.8')[1]['authorized'])
 def test_credential_admin_host_and_origin_boundaries(self):
  for endpoint in ['/api/config','/api/credentials/load','/api/credentials/forget','/api/pair-code']:
   self.assertEqual(self.req(endpoint,{}),(403,{'error':'local_only'}))
  self.assertEqual(self.req('/openrouter-settings'),(403,{'error':'local_only'}))
  self.assertEqual(self.req('/api/status',host='evil.test')[0],403)
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'trusted-client'},origin='http://evil.test')[0],403)
 def test_start_decide_pause_resume_stop_and_other_device_isolation(self):
  status,lease=self.req('/api/behavior-session',{'action':'start','client_id':'trusted-client'})
  self.assertEqual(status,200);sid=lease['session_id']
  self.assertEqual(self.req('/api/behavior-session',{'action':'start','client_id':'other-client'},peer='192.168.1.43')[0],409)
  self.assertEqual(self.req('/api/behavior-session',{'action':'stop','session_id':sid},peer='192.168.1.43')[0],409)
  data={'session_id':sid,'snapshot':fixture.LanControl.snapshot(self,client='trusted-client')}
  with patch.object(server,'choose',return_value={'action':'wait','confidence':1}):
   self.assertEqual(self.req('/api/behavior-decide',data)[0],200)
  for action in ['pause','resume','stop']:
   self.assertEqual(self.req('/api/behavior-session',{'action':action,'session_id':sid})[0],200)
  self.assertFalse(server.CONTROL.active())
