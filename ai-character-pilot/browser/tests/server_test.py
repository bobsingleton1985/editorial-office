import importlib.util,json,threading,unittest,urllib.request,urllib.error
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'server.py'
spec=importlib.util.spec_from_file_location('pilot_server_test',p);server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class RestartBudget(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        port=cls.http.server_address[1];cls.base=f'http://127.0.0.1:{port}'
        server.ALLOWED_HOSTS={f'127.0.0.1:{port}'}
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()
    def request(self):
        return urllib.request.urlopen(urllib.request.Request(self.base+'/api/new-test',data=b'{}',headers={'Content-Type':'application/json'}))
    def test_reset_keeps_connection(self):
        server.CALLS=10;server.CONFIG={'model':'typesafe/jev-1.13','key':'test-placeholder-only'}
        with self.request() as r:self.assertEqual(json.load(r)['calls'],0)
        self.assertEqual(server.CONFIG['key'],'test-placeholder-only')
    def test_busy_request_cannot_reset(self):
        server.CALL_LOCK.acquire()
        try:
            with self.assertRaises(urllib.error.HTTPError) as e:self.request()
            self.assertEqual(e.exception.code,409)
        finally:server.CALL_LOCK.release()
    def test_lan_cannot_reset(self):
        server.LOCAL_ADMIN=False
        try:
            with self.assertRaises(urllib.error.HTTPError) as e:self.request()
            self.assertEqual(e.exception.code,403)
        finally:server.LOCAL_ADMIN=True
if __name__=='__main__':unittest.main()
