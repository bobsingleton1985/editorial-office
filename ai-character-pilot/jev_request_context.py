"""Build a bounded transport projection without editing canonical actor state.

Local estimates can authorize requests under the owner's accepted policy.
Only an official System One counter can establish exact Jev token compliance.
"""
import copy
import json
import re
from os.path import commonprefix
from collections import Counter
import heapq

VERSION = 'jev-context-v5'
MODEL = 'typesafe/jev-1.13'
MAX_BYTES = 30000
ESTIMATE_METHOD = 'local_lexical_estimate_v1'
ESTIMATE_TARGET = 20000
ESTIMATE_CONTEXT_LIMIT = 25600
ESTIMATE_REQUEST_LIMIT = 51200
ESTIMATE_OVERHEAD = 512
LEXICAL_PARTS = re.compile(r'[A-Za-z]+|[0-9]+|[ \t\r\n]+|.', re.DOTALL)
REFERENCE_NOTE = ('Local lossless encodings: context_ref is a JSON Pointer here; '
                  '@N; is state.action_text[N]. context_actions uses keys at criteria '
                  'as {id:key} plus metadata[key]. context_table rows zip columns, '
                  'merge defaults; context_records keyed rows merge defaults. '
                  'All action meanings are in criteria; excluded history stays in canonical memory. ')



class ContextError(ValueError):
    def __init__(self, code, report):
        super().__init__(code)
        self.report = report


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'),
                      allow_nan=False).encode('utf-8')


def estimate_serialized_tokens(value):
    """Deterministic heuristic; no bound on the unpublished Jev tokenizer.

    ASCII letter runs: ceil(n/3); digits: ceil(n/2); whitespace: ceil(n/3).
    Cyrillic and ASCII punctuation: one per character. Other Unicode: UTF-8
    bytes per character. Count serialized JSON (including keys and escapes).
    """
    count = 0
    for part in LEXICAL_PARTS.findall(encode(value).decode('utf-8')):
        first = part[0]
        if first.isascii() and (first.isalpha() or first.isspace()):
            count += (len(part) + 2) // 3
        elif first.isascii() and first.isdigit():
            count += (len(part) + 1) // 2
        elif first.isascii() or '\u0400' <= first <= '\u052f':
            count += len(part)
        else:
            count += len(part.encode('utf-8'))
    return count


def estimate_request_tokens(payload):
    """Server-owned estimated counter; includes 512 units for hidden overhead.

    Measure the entire final body and, separately, that body with only its
    longest question. No inferred tokens or limits from snapshot are trusted.
    """
    if payload.get('model') != MODEL:
        raise ValueError('jev_context_model_unverified')
    envelope = {key: value for key, value in payload.items() if key != 'questions'}
    longest = max((estimate_serialized_tokens({**envelope, 'questions': {key: value}})
                   for key, value in payload['questions'].items()), default=estimate_serialized_tokens(envelope))
    return {'model': MODEL, 'exact': False, 'method': ESTIMATE_METHOD,
            'stateAndLongestQuestionTokens': longest + ESTIMATE_OVERHEAD,
            'requestTokens': estimate_serialized_tokens(payload) + ESTIMATE_OVERHEAD}


# Mode is configured by trusted server code, never by request fields.
estimate_request_tokens.measurement_method = ESTIMATE_METHOD


def mapping(value):
    return value if isinstance(value, dict) else {}


def pointer(path):
    return '/' + '/'.join(str(part).replace('~', '~0').replace('/', '~1') for part in path)


def resolve(value, ref):
    for part in ref.lstrip('/').split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def deduplicate(payload):
    """Reference identical structured facts, never near matches or IDs alone."""
    seen = {}
    references = []
    rules = payload['state'].get('characterRules')
    if isinstance(rules, dict):
        seen[encode(rules)] = '/state/characterRules'
    def visit(value, path):
        if isinstance(value, (dict, list)) and len(encode(value)) >= 180:
            identity = encode(value)
            if identity in seen:
                ref = seen[identity]
                references.append(ref)
                return {'context_ref': ref}
            seen[identity] = pointer(path)
        if isinstance(value, dict):
            return {key: visit(child, path+[key]) for key, child in value.items()}
        if isinstance(value, list):
            return [visit(child, path+[i]) for i, child in enumerate(value)]
        return value
    result = dict(payload)
    # The outer state and question maps stay in their documented API shape.
    result['state'] = {key: copy.deepcopy(value) if key in {'characterRules','memoryMaintenance'} else visit(value, ['state', key])
                       for key, value in payload['state'].items()}
    for ref in references:
        resolve(result, ref)  # Never leave dangling generated references.
    return result, len(references)


def factor_action_phrases(payload):
    """Factor exact repeated word spans, preserving every action verbatim."""
    criteria = payload['questions']['next_action']['criteria']
    if 'action_text' in payload['state'] or any('[action_text:' in text or re.search(r'@\d+', text) for text in criteria.values()):
        return
    occurrences = Counter()
    for text in criteria.values():
        words = list(re.finditer(r'\S+', text))
        phrases = set()
        for start in range(len(words)):
            for end in range(start+2, min(len(words), start+24)+1):
                phrase = text[words[start].start():words[end-1].end()]
                if len(phrase) >= 24:
                    phrases.add(phrase)
        phrases.add(text)
        occurrences.update(phrases)
    dictionary = {}
    heap = []
    def saving(phrase, count, identifier):
        marker = '@'+identifier+';'
        return ((count-1)*estimate_serialized_tokens(phrase)
                -count*estimate_serialized_tokens(marker)-8)
    for phrase, count in occurrences.items():
        gain = saving(phrase, count, '99')
        if count >= 2 and gain >= 16:
            heap.append((-gain, phrase))
    heapq.heapify(heap)
    while heap and len(dictionary) < 96:
        previous_gain, phrase = heapq.heappop(heap)
        count = sum(part.count(phrase) for text in criteria.values() for part in re.split(r'@\d+;',text))
        identifier = str(len(dictionary)+1)
        gain = saving(phrase, count, identifier)
        if count < 2 or gain < 16:
            continue
        if heap and gain < -heap[0][0]:
            heapq.heappush(heap,(-gain,phrase))
            continue
        dictionary[identifier] = phrase
        for key, text in criteria.items():
            parts = re.split(r'(@\d+;)',text)
            criteria[key] = ''.join(part if index%2 else part.replace(phrase,'@'+identifier+';')
                                   for index,part in enumerate(parts))
    if dictionary:
        payload['state']['action_text'] = dictionary


def compact_action_index(payload):
    """IDs already occur in criteria; keep only additional per-ID metadata."""
    actions = payload['state'].get('available_actions')
    criteria = payload['questions']['next_action']['criteria']
    if (not isinstance(actions,list) or not all(isinstance(row,dict) for row in actions)
            or [row.get('id') for row in actions] != list(criteria)):
        return
    metadata = {row['id']:{key:value for key,value in row.items() if key!='id'}
                for row in actions if len(row)>1}
    compact = {'context_actions':{'criteria':'/questions/next_action/criteria','metadata':metadata}}
    if len(encode(actions))-len(encode(compact)) >= 80:
        payload['state']['available_actions'] = compact


def table_financial_choices(state):
    wallet = mapping(mapping(mapping(mapping(state.get('self')).get('finances')).get('livelihood')).get('wallet'))
    rows = wallet.get('spendingChoices')
    if not isinstance(rows, list) or len(rows) < 4 or not all(isinstance(row, dict) for row in rows):
        return
    columns = list(rows[0])
    if not all(set(row) == set(columns) for row in rows):
        return
    defaults = {key: rows[0][key] for key in columns if all(encode(row[key]) == encode(rows[0][key]) for row in rows)}
    variable = [key for key in columns if key not in defaults]
    table = {'context_table': {'columns': variable, 'defaults': defaults,
                              'rows': [[row[key] for key in variable] for row in rows]}}
    if len(encode(table)) < len(encode(rows)):
        wallet['spendingChoices'] = table


def compact_dimension_records(state):
    for relation in mapping(mapping(state.get('self')).get('relationships')).values():
        dimensions = mapping(relation).get('dimensions')
        if not isinstance(dimensions,dict) or len(dimensions)<3 or not all(isinstance(row,dict) for row in dimensions.values()):
            continue
        first = next(iter(dimensions.values()))
        defaults = {key:value for key,value in first.items()
                    if all(key in row and encode(row[key]) == encode(value) for row in dimensions.values())}
        if not defaults:
            continue
        rows = {key:{field:value for field,value in row.items() if field not in defaults}
                for key,row in dimensions.items()}
        compact = {'context_records':{'defaults':defaults,'rows':rows}}
        if len(encode(dimensions))-len(encode(compact)) >= 40:
            relation['dimensions'] = compact


def omit_transport_diagnostics(state, audit):
    actor = mapping(state.get('self'))
    projection = actor.get('contextProjection')
    if (isinstance(projection,dict) and projection.get('reason')=='bounded_transport_history'
            and set(projection)<= {'reason','maxStateBytes','omittedRecords'}
            and all(type(projection.get(key)) is int and projection[key]>=0 for key in ('maxStateBytes','omittedRecords'))):
        del actor['contextProjection'];audit['excludedSections'].append('self.contextProjection')
    for partner,relation in mapping(actor.get('relationships')).items():
        projection = mapping(relation).get('projection')
        if (isinstance(relation,dict) and isinstance(projection,dict)
                and set(projection)<= {'decisionsAvailable','observationsAvailable'}
                and all(type(value) is int and value>=0 for value in projection.values())):
            del relation['projection'];audit['excludedSections'].append('self.relationships.'+str(partner)+'.projection')
    # Playback integration tags are executor data, not facts for the choice.
    assignment = mapping(mapping(actor.get('currentActivity')).get('assignment'))
    for key in ('contactProfile','playbackProfile','entryTags','exitTags'):
        value = assignment.get(key)
        known = isinstance(value,str) if key in ('contactProfile','playbackProfile') else isinstance(value,list) and all(isinstance(tag,str) for tag in value)
        if key in assignment and known:
            del assignment[key];audit['excludedSections'].append('self.currentActivity.assignment.'+key)


def reflection_projection(state, audit):
    actor = mapping(state.get('self'))
    job = mapping(actor.get('reflection'))
    if not job:
        return
    partner, dimension = job.get('partner'), job.get('key')
    relations = mapping(actor.get('relationships'))
    target = copy.deepcopy(mapping(relations.get(partner)))
    # Only the appraised dimension and its actual evidence/prior evaluations.
    dimensions = mapping(target.get('dimensions'))
    if dimension in dimensions:
        keep = {dimension}
        if dimension == 'jealousy':
            keep.add('romance')  # The actual jealousy choices depend on romance.
        target['dimensions'] = {key: value for key, value in dimensions.items() if key in keep}
    decisions = target.get('dimensionDecisions')
    if isinstance(decisions, list):
        target['dimensionDecisions'] = [row for row in decisions if
            isinstance(row, dict) and row.get('dimension') == dimension]
    target.pop('observations', None)  # The job holds the actual assessed events.
    target.pop('decisions', None)     # Legacy sympathy history is unrelated.
    actor['relationships'] = {partner: target} if partner is not None else {}
    events = job.get('events', [])
    financial = any(any(word in str(mapping(event).get('kind', '')) for word in
                         ('loan', 'gift', 'money', 'performance')) for event in events)
    removable = ['memory', 'recentEpisodes', 'courtship', 'pending_tasks', 'task', 'own_desk']
    if not financial:
        removable.append('finances')
    for key in removable:
        if key in actor:
            audit['excludedSections'].append('self.'+key)
            del actor[key]
    audit['excludedSections'].extend('self.relationships.'+str(key) for key in relations if key != partner)
    activity = mapping(actor.get('currentActivity'))
    if 'relationship' in activity:
        audit['excludedSections'].append('self.currentActivity.relationship')
        del activity['relationship']  # Physical participation remains; assessment uses target above.
    old_ref = activity.get('relationshipRef')
    if isinstance(old_ref, str) and old_ref != 'self.relationships.'+str(partner):
        del activity['relationshipRef']
    # Reflection evidence and the current assessment are never truncatable.


def history_groups(state):
    actor = mapping(state.get('self'))
    groups = []
    def add(owner, key, path):
        value = mapping(owner).get(key)
        if isinstance(value, list):
            groups.append((path, value))
    add(actor.get('finances'), 'transactions', 'self.finances.transactions')
    for key in ('performances','services','offers','treats'):
        add(actor.get('finances'), key, 'self.finances.'+key)
    relations = list(mapping(actor.get('relationships')).items())
    current = mapping(actor.get('currentActivity')).get('relationship')
    if isinstance(current, dict):
        relations.append(('@currentActivity', current))
    for partner, relation in relations:
        prefix = 'self.currentActivity.relationship' if partner == '@currentActivity' else 'self.relationships.'+str(partner)
        for key in ('decisions', 'dimensionDecisions', 'observations'):
            if actor.get('reflection') and key == 'dimensionDecisions':
                continue  # Prior evaluations needed by this reflection stay intact.
            add(relation, key, prefix+'.'+key)
        add(mapping(relation).get('courtship'), 'history', prefix+'.courtship.history')
        for key, dimension in mapping(mapping(relation).get('dimensions')).items():
            # Required reflection dimension basis is not removable.
            if not actor.get('reflection'):
                add(dimension, 'basis', prefix+'.dimensions.'+str(key)+'.basis')
    add(actor, 'consolidatedMemory', 'self.consolidatedMemory')
    add(actor, 'memory', 'self.memory')
    add(actor, 'recentEpisodes', 'self.recentEpisodes')
    return groups


def relevance(state, path, row, index, count):
    """Low numbers leave first. Protected facts remain outside history lists."""
    item = mapping(row)
    if path in {'self.finances.performances','self.finances.services','self.finances.offers','self.finances.treats'} and item.get('status') not in {'cancelled','paid','completed'}:
        return None
    if item.get('status') in {'pending', 'active', 'unresolved', 'offered', 'reserved', 'running'}:
        return None
    if item.get('kind', item.get('event')) in {'directed_objection', 'courtship_response'}:
        return None
    actor = mapping(state.get('self'))
    partner = mapping(actor.get('currentActivity')).get('partner')
    task = mapping(actor.get('task')).get('id')
    score = 0
    if path in {'self.memory', 'self.consolidatedMemory', 'self.recentEpisodes'}:
        score += 30
    if partner and partner in (item.get('actor'), item.get('partner'), item.get('from'), item.get('to')):
        score += 20
    if task and task in (item.get('task'), item.get('taskId')):
        score += 20
    score += 10*index/max(1, count)
    return score


def required_ids(value):
    result = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if re.fullmatch(r'(?:causeEvent|sourceEvent|event|evidence|evaluation|basis|record)(?:Id|Ids)', key):
                if isinstance(child, str):
                    result.add(child)
                elif isinstance(child, list):
                    result.update(item for item in child if isinstance(item, str))
            result.update(required_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.update(required_ids(child))
    return result


def defined_ids(value):
    result = set()
    if isinstance(value, dict):
        if isinstance(value.get('id'), str):
            result.add(value['id'])
        for child in value.values():
            result.update(defined_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.update(defined_ids(child))
    return result


def restore_required_evidence(work, source):
    """Carry the dependency closure of retained facts across reflection filtering."""
    def records(value):
        found = []
        if isinstance(value, dict):
            if isinstance(value.get('id'), str):
                found.append(value)
            for child in value.values():
                found.extend(records(child))
        elif isinstance(value, list):
            for child in value:
                found.extend(records(child))
        return found
    originals = records(source)
    restored = []
    seen = set()
    while True:
        missing = required_ids(work) - defined_ids(work)
        if not missing:
            return
        additions = [record for record in originals if record['id'] in missing and encode(record) not in seen]
        if not additions:
            return  # The caller reports evidence absent in the input explicitly.
        if 'context_required_evidence' in work['state'] and not restored:
            raise ContextError('jev_context_reserved_field_conflict', {'field':'context_required_evidence'})
        for record in additions:
            identity = encode(record)
            if identity not in seen:
                seen.add(identity)
                restored.append(copy.deepcopy(record))
        work['state']['context_required_evidence'] = restored


def compile_request(payload, token_measure=None):
    """Require a server-owned counter (native, or explicitly estimated mode)."""
    if payload.get('model') != MODEL:
        raise ContextError('jev_context_model_unverified', {'model': payload.get('model')})
    if not callable(token_measure):
        raise ContextError('jev_context_token_counter_unavailable', {
            'version': VERSION, 'model': MODEL, 'measurement': 'unavailable',
            'tokens': None, 'contextLimitTokens': 32000, 'requestLimitTokens': 64000,
            'providerAdmission': False})
    return project_request_for_diagnostics(payload, token_measure=token_measure)


def project_request_for_diagnostics(payload, max_bytes=MAX_BYTES, token_measure=None):
    """token_measure must be a trusted server-owned counter callback.

    It receives the FINAL payload. Estimated callbacks declare their method
    on the callable and return exact=False; native callbacks supply exact counts.
    Without a callback this is an OFFLINE byte experiment; its output must not
    authorize a provider request. The provider adapter uses compile_request.
    """
    if payload.get('model') != MODEL:
        raise ContextError('jev_context_model_unverified', {'model': payload.get('model')})
    if type(max_bytes) is not int or not 1 <= max_bytes <= MAX_BYTES:
        raise ValueError('invalid_context_byte_ceiling')
    work = copy.deepcopy(payload)
    estimated = getattr(token_measure, 'measurement_method', None) == ESTIMATE_METHOD
    target = ESTIMATE_TARGET if estimated else 26000
    context_limit = ESTIMATE_CONTEXT_LIMIT if estimated else 32000
    request_limit = ESTIMATE_REQUEST_LIMIT if estimated else 64000
    audit = {'version': VERSION, 'measurement': 'utf8_bytes_not_exact_tokens',
             'inputScope': 'adapter_snapshot_not_canonical_memory',
             'tokens': None, 'requestTokens': None, 'estimatedTokens': None,
             'estimatedRequestTokens': None, 'exactTokenCount': False,
             'contextLimitTokens': 32000, 'requestLimitTokens': 64000,
             'targetTokens': target, 'admissionContextLimit': context_limit,
             'admissionRequestLimit': request_limit,
             'byteCeiling': max_bytes, 'providerAdmission': False, 'beforeBytes': len(encode(payload)),
             'excludedSections': [], 'omittedHistory': []}
    if token_measure is not None:
        audit.update(measurement=ESTIMATE_METHOD if estimated else 'native_systemone_counter_callback',
                     byteCeiling=None,
                     safetyReservePercent=20 if estimated else 0)
    state = work['state']
    criteria = work['questions']['next_action']['criteria']
    for action in state.get('available_actions', []):
        if not isinstance(action, dict) or action.get('id') not in criteria:
            continue
        identifier = action['id']
        if isinstance(action.get('description_full'), str):
            criteria[identifier] = action.pop('description_full')
            action.pop('description', None)
        elif action.get('description') == criteria[identifier]:
            del action['description']
        # Declare the ID lookup once above instead of repeating long paths per option.
        action.pop('description_ref', None)
    omit_transport_diagnostics(state, audit)
    reflection_projection(state, audit)
    restore_required_evidence(work, payload)
    table_financial_choices(state)
    factor_action_phrases(work)
    compact_action_index(work)
    work['questions']['next_action']['instructions'] = REFERENCE_NOTE + work['questions']['next_action']['instructions']
    groups = history_groups(state)
    protected_ids = required_ids(work)
    missing = protected_ids - defined_ids(work)
    if missing:
        audit['afterBytes'] = len(encode(work))
        audit['missingEvidenceIds'] = sorted(missing)
        raise ContextError('jev_context_required_evidence_missing', audit)
    candidates = []
    for path, rows in groups:
        for index, row in enumerate(rows):
            rank = relevance(state, path, row, index, len(rows))
            if defined_ids(row) & protected_ids:
                rank = None
            if rank is not None:
                candidates.append((rank, path, rows, row, index))
    candidates.sort(key=lambda entry: (entry[0], entry[1], entry[4]))
    index = 0
    while True:
        transport = copy.deepcopy(work)
        compact_dimension_records(transport['state'])
        final, refs = deduplicate(transport)
        if required_ids(work) - defined_ids(work):
            raise ContextError('jev_context_required_evidence_missing', audit)
        wire = encode(final)
        audit.update(afterBytes=len(wire), references=refs,
                     blockBytes={key: len(encode(value)) for key, value in final['state'].items()},
                     questionBytes=len(encode(final['questions'])))
        fits = len(wire) <= max_bytes
        if token_measure is not None:
            # A prior iteration measured another body. Never attach its count
            # to the new payload when this invocation fails.
            audit.update(tokens=None, requestTokens=None, estimatedTokens=None,
                         estimatedRequestTokens=None, targetExceeded=None,
                         hardLimitExceeded=None, admissionLimitExceeded=None,
                         exactTokenCount=False, providerAdmission=False)
            try:
                measured = token_measure(copy.deepcopy(final))
            except Exception:
                raise ContextError('jev_context_token_measurement_failed', audit) from None
            if not isinstance(measured, dict) or measured.get('model') != MODEL:
                raise ContextError('jev_context_invalid_token_measurement', audit)
            if ((estimated and (measured.get('exact') is not False or measured.get('method') != ESTIMATE_METHOD))
                    or (not estimated and measured.get('exact', True) is not True)):
                raise ContextError('jev_context_invalid_token_measurement', audit)
            longest, total = measured.get('stateAndLongestQuestionTokens'), measured.get('requestTokens')
            if type(longest) is not int or type(total) is not int or not 0 <= longest <= total:
                raise ContextError('jev_context_invalid_token_measurement', audit)
            if estimated:
                audit.update(estimatedTokens=longest, estimatedRequestTokens=total)
            else:
                audit.update(tokens=longest, requestTokens=total, exactTokenCount=True)
                audit['hardLimitExceeded'] = longest > 32000 or total > 64000
            audit['targetExceeded'] = longest > target
            audit['admissionLimitExceeded'] = longest > context_limit or total > request_limit
            fits = longest <= target and total <= request_limit
        if fits:
            audit['providerAdmission'] = token_measure is not None
            return final, wire, audit
        if index >= len(candidates):
            if token_measure is not None and not audit['admissionLimitExceeded']:
                audit['providerAdmission'] = True
                return final, wire, audit  # Soft target cannot remove required facts.
            raise ContextError('jev_context_core_exceeds_limit', audit)
        # At most 16 records from one relevance tier per recompile. History is
        # optional; don't repeatedly encode the whole request for each tiny row.
        tier = int(candidates[index][0]//10)
        end = index
        while end < len(candidates) and end-index < 16 and int(candidates[end][0]//10) == tier:
            end += 1
        for _, path, rows, row, original_index in candidates[index:end]:
            # Remove precisely this occurrence; equal observations may be distinct.
            for current_index, candidate in enumerate(rows):
                if candidate is row:
                    del rows[current_index]
                    break
            audit['omittedHistory'].append({'path': path, 'id': mapping(row).get('id'),
                                           'originalIndex': original_index,
                                           'reason': 'lower_relevance_history_budget'})
        index = end
