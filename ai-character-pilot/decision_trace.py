"""Optional append-only local trace; credentials/HTTP envelope never enter it."""
import json, os, re, threading
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
_LOCK = threading.Lock()
_SECRET = re.compile(r'^(authorization|api[_-]?key|key|token|.*[_-]token|session_id|lease|serviceLease|pairing.*)$', re.I)

def trace_id(value=None):
    return value if isinstance(value, str) and re.fullmatch(r'[a-f0-9-]{36}', value) else str(uuid4())

_DIMENSIONS = {'professional','personal','sympathy','romance','jealousy'}

def _check(value, where=()):
    if isinstance(value, dict):
        for key, child in value.items():
            semantic_dimension = key == 'key' and where == ('payload','state','self','reflection') and isinstance(child,str) and child in _DIMENSIONS
            if _SECRET.fullmatch(key) and not semantic_dimension: raise ValueError('secret_field')
            _check(child, where+(key,))
    elif isinstance(value, list):
        for i,child in enumerate(value): _check(child, where+(i,))

def emit(identifier, event, **fields):
    directory = os.environ.get('JEV_TRACE_DIR')
    if not directory: return
    try:
        _check(fields)
        row = dict(schema='jev-trace-v1', source='provider_adapter', traceId=identifier,
                   event=event, recordedAt=datetime.now(timezone.utc).isoformat(), **fields)
        line = json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n'
        with _LOCK:
            Path(directory).mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(str(Path(directory) / 'provider.jsonl'), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as out: out.write(line)
    except Exception:
        # Diagnostic storage cannot change the decision or leak an exception body.
        print('Jev diagnostics: provider trace not saved', file=__import__('sys').stderr)

def answer_fields(data):
    # Only the actual decision answer. No provider metadata or headers.
    answer = data.get('answers', {}).get('next_action') if isinstance(data, dict) and isinstance(data.get('answers'), dict) else None
    if not isinstance(answer, dict): return {'shape': type(answer).__name__}
    # Malformed NaN/Infinity must be visible as invalid, never as valid probabilities.
    def safe(v):
        if isinstance(v, float) and not __import__('math').isfinite(v): return {'invalid_number': str(v)}
        if isinstance(v, dict): return {k:safe(x) for k,x in v.items()}
        if isinstance(v, list): return [safe(x) for x in v]
        return v
    return safe({k:answer[k] for k in ('type','choice','confidence','probabilities') if k in answer})
