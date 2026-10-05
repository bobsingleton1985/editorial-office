// Decision context: stable facts first, history before present facts, choices last.
// Preserve meanings, IDs and unknown extensions. Only recognized decision-log
// rows are omitted; canonical memory and the diagnostic trace stay untouched.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ordered(value, first = [], last = []) {
  if (!object(value)) return value;
  const keys = [...first, ...Object.keys(value).filter(k => !first.includes(k) && !last.includes(k)), ...last];
  return Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]]));
}
function eventTime(row) {
  for (const key of ['endedAt', 'observedAt', 'at', 'createdAt', 'startedAt']) {
    const value = row?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
  }
  return null;
}
function chronological(rows) {
  if (!Array.isArray(rows)) return rows;
  // HH:mm alone has no date. Mixed/unknown timestamps retain authoritative
  // append order: midnight and missing dates must not invent a chronology.
  const times = rows.map(eventTime);
  if (times.some(t => t === null)) return rows;
  return rows.map((row, index) => ({row, index})).sort((a, b) => times[a.index] - times[b.index] || a.index - b.index).map(x => x.row);
}
function decisionLogRow(row) {
  return object(row) && typeof row.action === 'string' && Object.hasOwn(row, 'fatigue_before')
    && Object.hasOwn(row, 'at') && Object.hasOwn(row, 'source')
    && Object.keys(row).every(k => ['action', 'at', 'fatigue_before', 'source'].includes(k));
}
function histories(value, keys) {
  if (!object(value)) return value;
  for (const key of keys) if (Array.isArray(value[key])) value[key] = chronological(value[key]);
  return ordered(value, keys);
}
function relation(value) {
  if (!object(value)) return value;
  value = histories(value, ['decisions', 'dimensionDecisions', 'observations']);
  if (object(value.courtship)) value.courtship = histories(value.courtship, ['history']);
  if (object(value.dimensions)) for (const key of Object.keys(value.dimensions)) {
    value.dimensions[key] = histories(value.dimensions[key], ['basis']);
  }
  return ordered(value, ['decisions', 'dimensionDecisions', 'observations', 'basis', 'courtship'], ['dimensions', 'stance', 'revision', 'updatedAt']);
}
export function compactSnapshot(input) {
  const out = structuredClone(input), s = out.self;
  if (object(s)) {
    if (Array.isArray(s.memory)) s.memory = chronological(s.memory.filter(row => !decisionLogRow(row)));
    if (Array.isArray(s.recentEpisodes)) s.recentEpisodes = chronological(s.recentEpisodes);
    if (object(s.relationships)) for (const id of Object.keys(s.relationships)) s.relationships[id] = relation(s.relationships[id]);
    if (object(s.currentActivity) && object(s.currentActivity.relationship)) s.currentActivity.relationship = relation(s.currentActivity.relationship);
    if (object(s.finances)) s.finances = histories(s.finances, ['transactions']);
    if (object(s.reflection) && Array.isArray(s.reflection.events)) s.reflection.events = chronological(s.reflection.events);
    out.self = ordered(s, ['id', 'role', 'character', 'personality', 'needs_scale', 'own_desk', 'memory', 'recentEpisodes', 'relationships', 'courtship'],
      ['needs', 'need_limitations', 'mode', 'place', 'since_minutes', 'task', 'pending_tasks', 'finances', 'flirt', 'currentActivity', 'reflection']);
  }
  if (object(out.situation)) out.situation = ordered(out.situation, ['room'], ['music', 'others', 'teletype', 'owner', 'invitation', 'deferred_invitation', 'local_time']);
  return ordered(out, ['scope', 'characterRules', 'limits', 'self'], ['sleep', 'situation', 'sessionId', 'requestId', 'revision', 'available_actions']);
}
