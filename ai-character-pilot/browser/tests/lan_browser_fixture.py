"""Loopback-only UI fixture; all model replies mocked, no provider network calls."""
import importlib.util,threading
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('lan_browser_fixture_server',root/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
server.CONFIG={'model':'typesafe/jev-1.13','key':'fixture-only-never-sent'}
server.choose=lambda snapshot,*args:{'action':next((a['id'] for a in snapshot['available_actions'] if a['id']=='wait'),snapshot['available_actions'][0]['id']),'confidence':1}
local=server.make_server('127.0.0.1',8770);lan=server.make_server('127.0.0.1',8771);lan.local_admin=False
threading.Thread(target=lan.serve_forever,daemon=True).start()
print('MOCK ONLY UI fixture: local8770 / simulated LAN8771; no provider calls',flush=True)
try:local.serve_forever()
finally:local.server_close();lan.server_close()
