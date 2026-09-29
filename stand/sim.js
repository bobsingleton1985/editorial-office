// Стенд эмерджентности редакции — модель мира (без DOM; работает и в браузере, и в node).
// Решения принимает только Jev: модель лишь собирает снимок и список доступных действий.

export const NEEDS = ['fatigue', 'boredom', 'social', 'recognition', 'fun', 'coffee', 'nicotine', 'alcohol'];
export const NEED_LABEL = { fatigue: 'Усталость', boredom: 'Скука', social: 'Общение', recognition: 'Признание', fun: 'Развлечение', coffee: 'Кофе', nicotine: 'Никотин', alcohol: 'Алкоголь' };
export const TRAITS = ['sociability', 'initiative', 'discipline', 'music', 'risk'];
export const TRAIT_LABEL = { sociability: 'Общительность', initiative: 'Инициативность', discipline: 'Дисциплина', music: 'Любовь к музыке', risk: 'Тяга к риску' };
export const IDS = ['editor', 'reporter', 'columnist', 'heroine'];
export const MEN = ['editor', 'reporter', 'columnist'];

export const SPOTS = {
  deskA: { x: 2.2, y: 2.0, label: 'Стол A' }, deskB: { x: 6.0, y: 1.6, label: 'Стол B' }, deskC: { x: 9.8, y: 2.0, label: 'Стол C' },
  bench: { x: 2.0, y: 6.6, label: 'Скамья' }, window: { x: 6.0, y: 0.5, label: 'Окно' }, teletype: { x: 11.3, y: 4.6, label: 'Телетайп' },
  phone: { x: 8.4, y: 6.9, label: 'Телефон' }, coffee: { x: 11.2, y: 7.0, label: 'Кофе' }, bar: { x: 4.2, y: 7.2, label: 'Виски' },
  record: { x: 6.6, y: 7.3, label: 'Проигрыватель' }, floor: { x: 6.2, y: 4.8, label: 'Танцпол' }, door: { x: 12.0, y: 3.4, label: 'Дверь' },
};

export const BUBBLE = { drink: '🥃?', coffee: '☕?', smoke: '🚬?', dance: '💃?', talk: '💬?', flirt: '❤️', loan: '💵?' };
const KIND_LABEL = { drink: 'выпить виски', coffee: 'выпить кофе', smoke: 'покурить', dance: 'потанцевать', talk: 'поговорить', flirt: 'флирт', loan: 'одолжить денег до гонорара' };

// Каталог: online — уже работает в живой редакции (для справки владельцу), в стенде доступно всё включённое.
export const CATALOG = {
  work: { label: 'Работа за столом', online: true }, rest: { label: 'Отдых на скамье', online: true },
  window: { label: 'Постоять у окна', online: true }, stroll: { label: 'Пройтись по редакции', online: true },
  teletype: { label: 'Лента телетайпа', online: true }, coffee: { label: 'Кофе', online: true },
  smoke: { label: 'Сигарета', online: true }, drink: { label: 'Виски', online: false },
  record: { label: 'Поставить пластинку', online: false }, dance: { label: 'Танец', online: false },
  talk: { label: 'Разговор', online: false }, flirt: { label: 'Флирт (объятия, поцелуй)', online: false },
  loan: { label: 'Долги', online: false }, phone: { label: 'Телефон', online: false },
  sleep: { label: 'Сон (стол, пол, скамья)', online: false }, idle: { label: 'Побыть без дела', online: true },
};

export function defaultConfig() {
  const ch = (name, bio, desk, traits, rates, extra = {}) => ({ name, bio, desk, traits, rates, stressSensitivity: 50, tolerance: 50, ...extra });
  return {
    version: 1,
    seed: 7,
    startHour: 9,
    tempo: 1.5,
    jevCallCap: 150,
    deadlineHour: 19,
    heroineVisitChance: 70,
    teletypeEveryHours: 2,
    archie: { scout: 20, match: 15, cards: 15 },
    forgetting: { sympathyDays: 3, attractionDays: 4, jealousyHours: 3, grudgeHours: 24, debtDays: 2 },
    catalog: Object.fromEntries(Object.keys(CATALOG).map(k => [k, true])),
    characters: {
      editor: ch('Редактор', 'Усталый ветеран за 50. Видел войну и три газеты. Циничен, но справедлив. Держит редакцию на дисциплине, виски — в нижнем ящике стола. О прошлом молчит. Судья между репортёром и колумнистом.', 'deskB',
        { sociability: 40, initiative: 55, discipline: 85, music: 40, risk: 20 },
        { fatigue: 7, boredom: 4, social: 3, recognition: 3, fun: 3, coffee: 8, nicotine: 6, alcohol: 5 },
        { goal: 'Сдать номер вовремя', stressSensitivity: 60, tolerance: 70 }),
      reporter: ch('Репортёр', 'Около 30. Сын состоятельной семьи; отец женился повторно, и наследство ушло новой семье — воспитание осталось, денег нет. Авантюрист, любит риск, романтик и мечтатель. Легко загорается, за столом быстро скучает, срывается по первой наводке, берёт в долг до гонорара. Сначала действует, потом думает.', 'deskA',
        { sociability: 65, initiative: 85, discipline: 30, music: 60, risk: 90 },
        { fatigue: 5, boredom: 12, social: 5, recognition: 5, fun: 6, coffee: 5, nicotine: 8, alcohol: 4 },
        { goal: 'Раскопать большую историю; вернуть долги', stressSensitivity: 40, tolerance: 55 }),
      columnist: ch('Колумнист', 'Звезда газеты с именной колонкой. Выходец из бедного Бруклина, пробился сам. Остроумен, любит публику, кофе, пластинки и долгие разговоры. Тщеславен и ревнив, работает рывками. Редактора считает пережитком, к репортёру — тихая зависть.', 'deskC',
        { sociability: 80, initiative: 60, discipline: 45, music: 85, risk: 35 },
        { fatigue: 5, boredom: 6, social: 9, recognition: 8, fun: 5, coffee: 9, nicotine: 3, alcohol: 4 },
        { goal: 'Колонка к номеру; всеобщее восхищение', stressSensitivity: 65, tolerance: 45 }),
      heroine: ch('Героиня', 'Певица из джаз-клуба по соседству и источник наводок. Не сотрудница редакции, заходит иногда — за рецензией, с пластинкой, с новостями. Свободная и игривая: любит внимание и флирт, не спешит выбирать, тянется к тому, с кем весело; ревность мужчин её забавляет.', null,
        { sociability: 90, initiative: 70, discipline: 25, music: 95, risk: 60 },
        { fatigue: 4, boredom: 8, social: 8, recognition: 4, fun: 10, coffee: 3, nicotine: 5, alcohol: 5 },
        { goal: 'Рецензия на выступление; весёлый вечер', stressSensitivity: 30, tolerance: 50 }),
    },
    // Стартовые отношения: sympathy[кто][к кому] −100…100; attraction[кто][к кому] 0…100 (мужчины ↔ героиня).
    sympathy: {
      editor: { reporter: 25, columnist: -10, heroine: 15 },
      reporter: { editor: 30, columnist: -15, heroine: 20 },
      columnist: { editor: -25, reporter: -10, heroine: 25 },
      heroine: { editor: 10, reporter: 15, columnist: 15 },
    },
    attraction: {
      editor: { heroine: 10 }, reporter: { heroine: 25 }, columnist: { heroine: 30 },
      heroine: { editor: 5, reporter: 20, columnist: 20 },
    },
  };
}

// ---------- утилиты ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = v => Math.round(v);
export function hhmm(tMin) { const m = ((Math.floor(tMin) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
export function dayOf(tMin) { return Math.floor(tMin / 1440) + 1; }
const hourOf = t => ((t % 1440) + 1440) % 1440 / 60;
const decayToward = (v, base, halfLifeMin, dt) => halfLifeMin > 0 ? base + (v - base) * Math.pow(0.5, dt / halfLifeMin) : base;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- мир ----------
export class World {
  constructor(config) { this.reset(config); }

  reset(config) {
    this.cfg = JSON.parse(JSON.stringify(config));
    this.rand = rng(this.cfg.seed);
    this.t = this.cfg.startHour * 60;       // минуты от полуночи первого дня
    this.revision = 0;
    this.requestSeq = 0;
    this.journal = [];
    this.bubbles = [];
    this.history = [];
    this.lastSample = -1e9;
    this.invitations = [];
    this.inviteSeq = 0;
    this.cooldowns = {};
    this.debts = [];
    this.music = null;                      // {until, by}
    this.phone = null;                      // {ringing, text, since, until}
    this.news = [];                         // факты мира из канала
    this.tapes = 0;
    this.nextTape = this.t + this._expo(this.cfg.teletypeEveryHours * 60);
    this.archie = null;
    this.issue = { closedDay: 0 };
    this.heroineVisit = null;
    this.calls = 0;
    const C = this.cfg.characters;
    this.chars = {};
    for (const id of IDS) {
      const c = C[id];
      const spot = id === 'heroine' ? 'door' : c.desk;
      this.chars[id] = {
        id, name: c.name, present: id !== 'heroine', asleep: false,
        spot, pos: { ...SPOTS[spot] },
        needs: Object.fromEntries(NEEDS.map(n => [n, r1(15 + this.rand() * 25)])),
        stress: 10, intox: 0, workToday: 0,
        activity: null, needsDecision: id !== 'heroine', decisionReason: 'начало смены',
        forced: null, episodes: [],
        sympathy: {}, grudge: {}, attraction: {}, jealousy: {},
      };
    }
    for (const a of IDS) for (const b of IDS) if (a !== b) {
      this.chars[a].sympathy[b] = this.cfg.sympathy[a]?.[b] ?? 0;
      this.chars[a].grudge[b] = 0;
      this.chars[a].jealousy[b] = 0;
      const base = this.cfg.attraction[a]?.[b];
      if (base !== undefined) this.chars[a].attraction[b] = base;
    }
    this._planHeroineVisit();
    this.log(null, 'event', `Стенд запущен: день 1, ${hhmm(this.t)}. Seed ${this.cfg.seed}.`);
  }

  // живые изменения ползунков без сброса состояния
  applyConfig(config) {
    const keep = this.cfg.seed;
    this.cfg = JSON.parse(JSON.stringify(config));
    this.cfg.seed = keep;
    for (const id of IDS) this.chars[id].name = this.cfg.characters[id].name;
  }

  _expo(mean) { return -Math.log(1 - this.rand()) * mean; }
  _between(lo, hi) { return lo + this.rand() * (hi - lo); }

  log(charId, kind, text, extra = {}) {
    this.journal.push({ t: this.t, day: dayOf(this.t), time: hhmm(this.t), char: charId, kind, text, ...extra });
    if (this.journal.length > 5000) this.journal.splice(0, 1000);
  }
  bubble(charId, icon) { this.bubbles.push({ char: charId, icon, t: this.t }); if (this.bubbles.length > 50) this.bubbles.shift(); }
  episode(charId, text, withIds = []) {
    const c = this.chars[charId]; c.episodes.push({ t: this.t, text: `${hhmm(this.t)} ${text}`, with: withIds });
    if (c.episodes.length > 10) c.episodes.shift();
  }

  present(id) { const c = this.chars[id]; return c.present; }
  awake(id) { const c = this.chars[id]; return c.present && !c.asleep; }
  effSym(a, b) { return clamp(this.chars[a].sympathy[b] - this.chars[a].grudge[b], -100, 100); }

  // ---------- время ----------
  pendingDecisions() { return IDS.filter(id => this.chars[id].needsDecision && this.awake(id)); }

  // Продвинуть время максимум на dtMin; останавливается, как только кому-то нужно решение.
  advance(dtMin) {
    let left = dtMin;
    while (left > 1e-9) {
      if (this.pendingDecisions().length) return;
      const step = Math.min(left, 1);
      this._integrate(step);
      this.prevT = this.t;
      this.t += step; left -= step;
      this._events();
      if (this.t - this.lastSample >= 10) this._sample();
    }
  }

  _integrate(dt) {
    const h = dt / 60, hour = hourOf(this.t), F = this.cfg.forgetting;
    for (const id of IDS) {
      const c = this.chars[id], cc = this.cfg.characters[id];
      if (!c.present) { for (const o of IDS) if (o !== id) this._decayRel(c, o, dt, true); continue; }
      const act = c.activity ? ACTIONS[c.activity.type] : null;
      const during = (act && act.during) || {};
      for (const n of NEEDS) {
        let rate = cc.rates[n];
        if (n === 'fatigue' && (hour >= 1 && hour < 7)) rate *= 1.5;
        if (n === 'nicotine' || n === 'alcohol') rate *= 1 + c.stress / 100 * (cc.stressSensitivity / 50);
        if (n === 'fun') rate *= 1 + c.intox / 50;
        if (c.asleep && n !== 'fatigue') rate *= 0.2;
        c.needs[n] = clamp(c.needs[n] + (rate + (during[n] || 0)) * h);
      }
      c.stress = clamp(c.stress + ((during.stress || 0) - 12) * h);
      c.intox = clamp(c.intox - (6 + cc.tolerance / 10) * h * (c.asleep ? 2 : 1));
      // давление номера: с 15:00 до дедлайна у сотрудников, не сделавших работу
      if (id !== 'heroine' && this.issue.closedDay < dayOf(this.t) && hour >= this.cfg.deadlineHour - 4 && hour < this.cfg.deadlineHour && c.workToday < 2)
        c.stress = clamp(c.stress + 8 * h * (cc.traits.discipline / 50));
      for (const o of IDS) if (o !== id) this._decayRel(c, o, dt, false);
    }
    this.debts = this.debts.filter(d => this.t - d.t < F.debtDays * 1440 || (this.log(d.from, 'event', `Долг ${this.chars[d.from].name} перед ${this.chars[d.to].name} забыт.`), false));
  }

  _decayRel(c, o, dt, absent) {
    const F = this.cfg.forgetting, base = this.cfg.sympathy[c.id]?.[o] ?? 0;
    c.sympathy[o] = decayToward(c.sympathy[o], base, F.sympathyDays * 1440, dt);
    c.grudge[o] = decayToward(c.grudge[o], 0, F.grudgeHours * 60 / 2, dt);
    c.jealousy[o] = decayToward(c.jealousy[o], 0, F.jealousyHours * 60 / 2, dt);
    if (c.attraction[o] !== undefined) {
      const heroineAway = !this.chars.heroine.present;
      c.attraction[o] = decayToward(c.attraction[o], this.cfg.attraction[c.id]?.[o] ?? 0, F.attractionDays * 1440 / (heroineAway ? 2 : 1), dt);
    }
  }

  _sample() {
    this.lastSample = this.t;
    this.history.push({ t: this.t, c: Object.fromEntries(IDS.map(id => { const c = this.chars[id]; return [id, { ...c.needs, stress: c.stress, intox: c.intox, present: c.present }]; })) });
    if (this.history.length > 432 * 3) this.history.shift();
  }

  _crossed(h) { const m = h * 60, p = this.prevT ?? this.t - 1; return Math.floor((p - m) / 1440) !== Math.floor((this.t - m) / 1440); }

  _events() {
    const hour = hourOf(this.t), day = dayOf(this.t);
    // окончания занятий
    for (const id of IDS) {
      const c = this.chars[id];
      if (c.activity && this.t >= c.activity.until) this._finish(id);
      if (c.present && !c.asleep && c.intox >= 90) this._passOut(id);
    }
    // приглашения без ответа
    for (const inv of this.invitations.filter(i => this.t >= i.until)) this._resolveInvitation(inv, 'defer', true);
    // музыка
    if (this.music && this.t >= this.music.until) { this.music = null; this.log(null, 'event', 'Пластинка доиграла.'); this._interruptAll('музыка стихла'); }
    // телефон
    if (this.phone && this.t >= this.phone.until) { this.log(null, 'event', `Телефон отзвонил, никто не взял трубку. Сообщение: «${this.phone.text}».`); this.news.push({ t: this.t, text: this.phone.text, heardBy: null }); this.phone = null; }
    // телетайп — днём
    if (this.t >= this.nextTape) {
      if (hour >= 8 && hour < 18 && this.cfg.catalog.teletype) { this.tapes = Math.min(3, this.tapes + 1); this.log(null, 'event', `Телетайп выдал ленту (в лотке: ${this.tapes}).`); this._interruptAll('пришла лента телетайпа'); }
      this.nextTape = this.t + this._expo(this.cfg.teletypeEveryHours * 60);
    }
    // номер
    if (this.issue.closedDay < day && hour >= this.cfg.deadlineHour) {
      this.issue.closedDay = day;
      const staff = MEN.filter(id => this.present(id));
      this.log(null, 'event', `${hhmm(this.t)} — номер ушёл в печать.`);
      for (const id of staff) { const c = this.chars[id]; c.stress = clamp(c.stress - 30); if (c.workToday >= 2) c.needs.recognition = clamp(c.needs.recognition - 20); this.episode(id, 'номер сдан'); }
      this._interruptAll('номер сдан');
    }
    if (this.issue.closedDay < day && this._crossed(this.cfg.deadlineHour - 2)) { this.bubble('editor', '⏰!'); this.log('editor', 'event', 'До сдачи номера два часа.'); this._interruptAll('до сдачи номера два часа'); }
    if (this._crossed(6)) for (const id of MEN) this.chars[id].workToday = 0;
    // героиня
    const H = this.chars.heroine;
    if (!H.present && this.heroineVisit && this.t >= this.heroineVisit) this.heroineArrives('пришла из клуба');
    if (H.present && this._crossed(4)) this.heroineLeaves('клуб закрылся, пора домой');
    if (this._crossed(12)) this._planHeroineVisit();
    // Арчи
    if (this.archie && this.t >= this.archie.until) this._archieNext();
  }

  _planHeroineVisit() {
    const dayStart = Math.floor(this.t / 1440) * 1440;
    this.heroineVisit = this.rand() * 100 < this.cfg.heroineVisitChance ? dayStart + this._between(20 * 60, 25 * 60) : null;
  }

  _interruptAll(reason) {
    for (const id of IDS) {
      const c = this.chars[id];
      if (!this.awake(id) || c.forced || c.needsDecision) continue;
      if (!c.activity || ACTIONS[c.activity.type].interruptible) { c.needsDecision = true; c.decisionReason = reason; }
    }
  }

  // ---------- внешние события (кнопки стенда) ----------
  phonePost(text) {
    this.phone = { text, since: this.t, until: this.t + 3 };
    this.log(null, 'event', `📞 Звонит телефон (пост в канале): «${text}»`);
    this._interruptAll('звонит телефон');
  }
  heroineArrives(why) {
    const H = this.chars.heroine; if (H.present) return;
    Object.assign(H, { present: true, asleep: false, leaving: false, spot: 'door', pos: { ...SPOTS.door }, activity: null, needsDecision: true, decisionReason: 'только что пришла' });
    this.heroineVisit = null;
    this.log('heroine', 'event', `Героиня ${why}.`);
    this._interruptAll('пришла героиня');
  }
  heroineLeaves(why) {
    const H = this.chars.heroine; if (!H.present) return;
    this._cancelInvitationsOf('heroine');
    Object.assign(H, { present: false, activity: null, needsDecision: false, asleep: false, spot: 'door', pos: { ...SPOTS.door } });
    this.log('heroine', 'event', `Героиня ушла: ${why}.`);
    for (const id of MEN) this.episode(id, 'героиня ушла', ['heroine']);
  }
  addTape() { this.tapes = Math.min(3, this.tapes + 1); this.log(null, 'event', `Телетайп выдал ленту (кнопка). В лотке: ${this.tapes}.`); this._interruptAll('пришла лента телетайпа'); }
  archieRequest(text) {
    if (this.archie) { this.log(null, 'event', 'Арчи уже работает над запросом — новый встанет в очередь позже.'); return false; }
    this.archie = { text, phase: 'scout', until: this.t + this.cfg.archie.scout, started: this.t };
    this.log(null, 'event', `🎬 Запрос Арчи: «${text}». Скаут (репортёр) ищет фильмы.`);
    this._forceTask('reporter', 'archie_scout', this.archie.until);
    return true;
  }
  _archieNext() {
    const A = this.archie, order = { scout: ['match', 'columnist', 'archie_match', 'Сверка со вкусом (колумнист)'], match: ['cards', 'editor', 'archie_cards', 'Карточки (редактор)'] };
    const prevOwner = { scout: 'reporter', match: 'columnist', cards: 'editor' }[A.phase];
    const pc = this.chars[prevOwner];
    if (pc.forced) { pc.forced = null; }
    if (pc.activity && pc.activity.type.startsWith('archie_')) { pc.activity = null; pc.needsDecision = this.awake(prevOwner); pc.decisionReason = 'этап Арчи завершён'; }
    if (A.phase === 'cards') {
      this.log('editor', 'event', `🎬 Карточки готовы и ушли владельцу. Запрос «${A.text}» выполнен за ${r1(this.t - A.started)} мин.`);
      this.bubble('editor', '🎬!'); this.episode('editor', 'отправил карточки фильмов', []); this.archie = null; return;
    }
    const [next, owner, type, label] = order[A.phase];
    this.log(prevOwner, 'event', `Этап Арчи «${A.phase}» готов, передаёт дальше: ${label}.`);
    this.bubble(prevOwner, '📄!');
    A.phase = next; A.until = this.t + this.cfg.archie[next];
    this._forceTask(owner, type, A.until);
  }
  _forceTask(id, type, until) {
    const c = this.chars[id];
    if (!this.awake(id)) { this.log(id, 'event', `${c.name} ${c.present ? 'спит' : 'отсутствует'} — субагент Арчи работает без него.`); return; }
    c.forced = { type, until };
    if (!c.activity || ACTIONS[c.activity.type].interruptible) this._startForced(id);
  }
  _startForced(id) {
    const c = this.chars[id], f = c.forced; if (!f) return;
    c.forced = null; c.needsDecision = false;
    if (f.until <= this.t) return;
    this._cancelInvitationsOf(id);
    this._setActivity(id, f.type, c.id === 'heroine' ? 'door' : this.cfg.characters[id].desk, f.until - this.t, null);
    this.log(id, 'result', `${c.name} берётся за задачу Арчи: ${ACTIONS[f.type].label}.`);
  }

  // ---------- действия ----------
  _setActivity(id, type, spot, dur, extra) {
    this.livePos(id);
    const c = this.chars[id], from = { ...c.pos }, to = SPOTS[spot] || c.pos;
    const walk = dist(from, to) / 1.3 / 60;     // минут
    c.activity = { type, spot, start: this.t, until: this.t + Math.max(dur, walk + 0.5), walk, from, to, ...extra };
    c.spot = spot;
  }

  livePos(id) {
    const c = this.chars[id], a = c.activity;
    if (!a) return c.pos;
    const k = a.walk > 0 ? clamp((this.t - a.start) / a.walk, 0, 1) : 1;
    c.pos = { x: a.from.x + (a.to.x - a.from.x) * k, y: a.from.y + (a.to.y - a.from.y) * k };
    return c.pos;
  }

  _finish(id) {
    const c = this.chars[id], a = c.activity, def = ACTIONS[a.type];
    this.livePos(id);
    c.activity = null;
    if (def.done) def.done(this, id, a);
    if (c.asleep && a.type === 'sleep') { c.asleep = false; this.log(id, 'result', `${c.name} проснулся${id === 'heroine' ? 'а' : ''}.`); }
    if (c.forced) { this._startForced(id); return; }
    if (c.present) { c.needsDecision = true; c.decisionReason = `закончил${id === 'heroine' ? 'а' : ''}: ${def.label}`; }
  }

  _passOut(id) {
    const c = this.chars[id];
    this._cancelInvitationsOf(id);
    c.asleep = true; c.needsDecision = false;
    const spot = c.spot;
    this._setActivity(id, 'sleep', spot, this._between(180, 360), { where: spot.startsWith('desk') ? 'на столе' : 'на полу' });
    this.log(id, 'event', `${c.name} перебрал${id === 'heroine' ? 'а' : ''} и уснул${id === 'heroine' ? 'а' : ''} ${c.activity.where}.`);
    this.episode(id, 'перебрал и уснул');
    for (const o of IDS) if (o !== id && this.awake(o)) this.episode(o, `${c.name} перебрал и уснул`, [id]);
  }

  _cancelInvitationsOf(id) {
    for (const inv of this.invitations.filter(i => i.from === id || i.to === id)) {
      this.invitations = this.invitations.filter(i => i !== inv);
      const other = inv.from === id ? inv.to : inv.from, oc = this.chars[other];
      if (oc.activity?.type === 'inviting' && oc.activity.inv === inv.id) { oc.activity = null; oc.needsDecision = this.awake(other); oc.decisionReason = 'приглашение сорвалось'; }
    }
  }

  // Список действий, которые исполнитель сейчас допускает для персонажа.
  availableActions(id) {
    const c = this.chars[id], cat = this.cfg.catalog, list = [], staff = id !== 'heroine', hour = hourOf(this.t);
    const add = (aid, description) => list.push({ id: aid, description });
    const others = IDS.filter(o => o !== id && this.awake(o));
    const myInv = this.invitations.filter(i => i.to === id);
    for (const inv of myInv) {
      const who = this.chars[inv.from].name;
      add(`accept:invitation-${inv.id}`, `Принять приглашение: ${who} зовёт ${KIND_LABEL[inv.kind]}`);
      add(`decline:invitation-${inv.id}`, `Отказать: ${who} зовёт ${KIND_LABEL[inv.kind]}`);
      add(`defer:invitation-${inv.id}`, `Сказать «не сейчас, позже»: ${who} зовёт ${KIND_LABEL[inv.kind]}`);
    }
    if (c.activity && ACTIONS[c.activity.type].interruptible) add('continue', `Продолжать текущее занятие: ${ACTIONS[c.activity.type].label}`);
    if (this.phone && cat.phone) add('answer_phone', 'Подойти к звонящему телефону и снять трубку');
    if (staff && cat.work) add('work', 'Сесть за свой стол и работать над материалом');
    if (cat.rest) add('rest', 'Отдохнуть на скамье');
    if (cat.window) add('window', 'Постоять у окна, посмотреть на улицу');
    if (cat.stroll) add('stroll', 'Пройтись по редакции');
    if (staff && cat.teletype && this.tapes > 0) add('teletype', `Взять ленту телетайпа (в лотке: ${this.tapes})`);
    if (cat.coffee) add('coffee', 'Сварить и выпить кофе');
    if (cat.smoke) add('smoke', 'Выкурить сигарету у окна');
    if (cat.drink) add('drink', id === 'editor' ? 'Налить себе виски из нижнего ящика стола' : 'Налить себе виски');
    if (cat.record && !this.music) add('record', 'Поставить пластинку на проигрыватель');
    if (cat.dance && this.music) add('dance', 'Танцевать одному под музыку');
    if (cat.sleep && (c.needs.fatigue > 75 || (c.intox > 50 && (hour >= 23 || hour < 6)))) add('sleep', 'Лечь поспать прямо здесь');
    if (cat.idle) add('idle', 'Побыть без дела');
    for (const o of others) {
      const oc = this.chars[o], name = oc.name;
      const cd = k => (this.cooldowns[`${id}>${o}:${k}`] || 0) > this.t;
      const busyInv = this.invitations.some(i => i.to === o || i.from === o);
      if (busyInv || oc.forced || (oc.activity && !ACTIONS[oc.activity.type].interruptible)) continue;
      if (cat.talk && !cd('talk')) add(`invite_talk@${o}`, `Подойти поговорить: ${name}`);
      if (cat.drink && !cd('drink')) add(`invite_drink@${o}`, `Предложить выпить виски вместе: ${name}`);
      if (cat.coffee && !cd('coffee')) add(`invite_coffee@${o}`, `Позвать на кофе: ${name}`);
      if (cat.smoke && !cd('smoke')) add(`invite_smoke@${o}`, `Позвать покурить: ${name}`);
      if (cat.dance && this.music && !cd('dance')) add(`invite_dance@${o}`, `Пригласить на танец: ${name}`);
      const romantic = (id === 'heroine') !== (o === 'heroine');
      if (cat.flirt && romantic && !cd('flirt')) add(`invite_flirt@${o}`, `Флиртовать, обнять, попытаться поцеловать: ${name}`);
      if (cat.loan && staff && o !== 'heroine' && !cd('loan')) add(`invite_loan@${o}`, `Попросить в долг до гонорара: ${name}`);
      if (cat.loan && this.debts.some(d => d.from === id && d.to === o)) add(`repay@${o}`, `Вернуть долг: ${name}`);
      if (id === 'heroine') add(`tell_news@${o}`, `Рассказать новость из клуба: ${name}`);
    }
    if (id === 'heroine') add('leave', 'Уйти из редакции');
    return list;
  }

  // Снимок для Jev: только то, что персонаж может знать.
  snapshot(id) {
    const c = this.chars[id], cc = this.cfg.characters[id], hour = hourOf(this.t);
    const phase = hour < 6 ? 'глубокая ночь' : hour < 12 ? 'утро' : hour < 17 ? 'день' : hour < 22 ? 'вечер' : 'ночь';
    const closed = this.issue.closedDay >= dayOf(this.t);
    const minsLeft = r1((this.cfg.deadlineHour - hour) * 60);
    const act = a => a ? ACTIONS[a.type].label + (a.where ? ' ' + a.where : '') : 'ничего не делает';
    const others = IDS.filter(o => o !== id).map(o => {
      const oc = this.chars[o], rel = { sympathy: r1(this.effSym(id, o)) };
      if (c.attraction[o] !== undefined) rel.attraction = r1(c.attraction[o]);
      if (c.jealousy[o] > 1) rel.jealousy = r1(c.jealousy[o]);
      return oc.present ? { id: o, name: oc.name, where: SPOTS[oc.spot]?.label, doing: oc.asleep ? 'спит ' + (oc.activity?.where || '') : act(oc.activity), my_feelings: rel } : { id: o, name: oc.name, present: false, my_feelings: rel };
    });
    const recent = c.episodes.slice(-5).map(e => e.text);
    const debts = this.debts.filter(d => d.from === id || d.to === id).map(d => d.from === id ? `я должен: ${this.chars[d.to].name}` : `мне должен: ${this.chars[d.from].name}`);
    const snap = {
      scope: 'emergence-stand-v01', revision: ++this.revision, requestId: `r${++this.requestSeq}`,
      time: `день ${dayOf(this.t)}, ${hhmm(this.t)} (${phase})`,
      issue: id === 'heroine' ? undefined : closed ? 'номер сегодня уже сдан' : `номер сдаётся в ${this.cfg.deadlineHour}:00, осталось ${Math.max(0, minsLeft)} мин`,
      self: {
        id, name: c.name, who: cc.bio, goal: cc.goal,
        traits_0_100: Object.fromEntries(TRAITS.map(k => [TRAIT_LABEL[k], cc.traits[k]])),
        needs_0_100: Object.fromEntries(NEEDS.map(n => [NEED_LABEL[n], r1(c.needs[n])])),
        stress_0_100: r1(c.stress), intoxication_0_100: r1(c.intox),
        work_sessions_today: staff(id) ? c.workToday : undefined,
        now: act(c.activity), where: SPOTS[c.spot]?.label, debts: debts.length ? debts : undefined,
      },
      why_deciding_now: c.decisionReason,
      others,
      room: {
        music: this.music ? 'играет пластинка' : 'тихо',
        phone: this.phone ? 'звонит телефон' : undefined,
        teletype_tapes: this.tapes || undefined,
        latest_news: this.news.slice(-2).map(n => n.text),
      },
      invitations_to_me: this.invitations.filter(i => i.to === id).map(i => `${this.chars[i.from].name} зовёт ${KIND_LABEL[i.kind]}`),
      recent_memories: recent,
      available_actions: this.availableActions(id),
    };
    return JSON.parse(JSON.stringify(snap));
  }

  // Применить выбор Jev. Возвращает false, если действие устарело (нужно новое решение).
  apply(id, actionId, meta = {}) {
    const c = this.chars[id];
    if (c.forced) { this.log(id, 'event', `Выбор «${actionId}» отменён: задача Арчи важнее.`); this._startForced(id); return true; }
    if (!this.awake(id)) { c.needsDecision = false; return false; }
    const valid = this.availableActions(id).some(a => a.id === actionId);
    c.needsDecision = false;
    if (!valid) { this.log(id, 'event', `Выбор «${actionId}» устарел — новое решение.`); c.needsDecision = true; c.decisionReason = 'обстановка изменилась'; return false; }
    this.log(id, 'decision', describe(this, id, actionId), meta);
    const [head, target] = actionId.split('@');
    const [verb, arg] = head.split(':');
    if (verb === 'continue') { for (const inv of this.invitations.filter(i => i.to === id)) this._resolveInvitation(inv, 'defer', true); return true; }
    if (verb === 'accept' || verb === 'decline' || verb === 'defer') {
      const inv = this.invitations.find(i => `invitation-${i.id}` === arg);
      this._resolveInvitation(inv, verb, false); return true;
    }
    for (const inv of this.invitations.filter(i => i.to === id)) this._resolveInvitation(inv, 'defer', true);
    if (c.activity?.type === 'inviting') this._cancelInvitationsOf(id);
    const desk = this.cfg.characters[id].desk;
    const d = (lo, hi) => this._between(lo, hi) * (this.cfg.tempo || 1);
    switch (verb) {
      case 'work': this._setActivity(id, 'work', desk, d(50, 90)); break;
      case 'rest': this._setActivity(id, 'rest', 'bench', d(20, 45)); break;
      case 'window': this._setActivity(id, 'window', 'window', d(5, 10)); break;
      case 'stroll': this._setActivity(id, 'stroll', ['teletype', 'coffee', 'record', 'window'][Math.floor(this.rand() * 4)], d(5, 10)); break;
      case 'teletype': this.tapes = Math.max(0, this.tapes - 1); this._setActivity(id, 'teletype', 'teletype', d(5, 10)); break;
      case 'coffee': this._setActivity(id, 'coffee', 'coffee', d(8, 12)); break;
      case 'smoke': this._setActivity(id, 'smoke', 'window', d(6, 9)); break;
      case 'drink': this._setActivity(id, 'drink', id === 'editor' ? desk : 'bar', d(15, 25)); break;
      case 'record': this._setActivity(id, 'record', 'record', d(2, 3)); break;
      case 'dance': this._setActivity(id, 'dance', 'floor', d(8, 12)); break;
      case 'sleep': c.asleep = true; this._setActivity(id, 'sleep', c.spot, d(120, 300), { where: c.spot === 'bench' ? 'на скамье' : c.spot.startsWith('desk') ? 'на столе' : 'на полу' }); break;
      case 'idle': this._setActivity(id, 'idle', c.spot, d(8, 15)); break;
      case 'answer_phone': {
        const text = this.phone.text; this.phone = null;
        this._setActivity(id, 'phone', 'phone', d(2, 4), { text });
        this.news.push({ t: this.t, text, heardBy: id });
        break;
      }
      case 'leave': this.heroineLeaves('решила уйти сама'); break;
      case 'repay': {
        this.debts = this.debts.filter(x => !(x.from === id && x.to === target));
        this._setActivity(id, 'repay', this.chars[target].spot, d(2, 4), { target }); this.bubble(id, '💵!'); break;
      }
      case 'tell_news': this._setActivity(id, 'tell_news', this.chars[target].spot, d(4, 8), { target }); this.bubble(id, '🗞️!'); break;
      default: {
        if (verb.startsWith('invite_')) {
          const kind = verb.slice(7), inv = { id: ++this.inviteSeq, from: id, to: target, kind, until: this.t + 5 };
          this.invitations.push(inv);
          this._setActivity(id, 'inviting', this.chars[target].spot, 5, { inv: inv.id });
          this.bubble(id, BUBBLE[kind]);
          const tc = this.chars[target]; tc.needsDecision = true; tc.decisionReason = `${c.name} зовёт ${KIND_LABEL[kind]}`;
          break;
        }
        this.log(id, 'event', `Неизвестное действие ${actionId}`);
      }
    }
    return true;
  }

  _resolveInvitation(inv, verb, timeout) {
    if (!inv) return;
    this.invitations = this.invitations.filter(i => i !== inv);
    const A = this.chars[inv.from], B = this.chars[inv.to], k = inv.kind;
    if (A.activity?.type === 'inviting') A.activity = null;
    if (verb === 'accept') {
      this.bubble(inv.to, '👍');
      this._cancelInvitationsOf(inv.to);
      const spot = { drink: inv.from === 'editor' ? 'deskB' : 'bar', coffee: 'coffee', smoke: 'window', dance: 'floor', talk: A.spot, flirt: B.spot, loan: B.spot }[k];
      const dur = ({ drink: this._between(20, 35), coffee: this._between(10, 15), smoke: this._between(7, 10), dance: this._between(10, 15), talk: this._between(10, 20), flirt: this._between(6, 12), loan: 3 }[k]) * (this.cfg.tempo || 1);
      for (const who of [inv.from, inv.to]) { this._setActivity(who, 'joint_' + k, spot, dur, { partner: who === inv.from ? inv.to : inv.from }); this.chars[who].activity.until = this.t + dur + 2; this.chars[who].needsDecision = false; }
      this.log(inv.to, 'result', `${B.name} → ${A.name}: 👍 ${KIND_LABEL[k]}`);
      if (k === 'loan') { this.debts.push({ from: inv.from, to: inv.to, t: this.t }); this.log(inv.from, 'result', `💵 ${A.name} теперь в долгу у персонажа «${B.name}».`); }
      // ревность: остальные мужчины видят героиню с соперником
      if ((k === 'flirt' || k === 'dance' || k === 'drink') && (inv.from === 'heroine' || inv.to === 'heroine')) {
        const rival = inv.from === 'heroine' ? inv.to : inv.from;
        for (const m of MEN) if (m !== rival && this.awake(m) && (this.chars[m].attraction.heroine || 0) > 25) {
          const mc = this.chars[m], gain = (k === 'flirt' ? 20 : 10) * mc.attraction.heroine / 60;
          mc.jealousy[rival] = clamp(mc.jealousy[rival] + gain); mc.stress = clamp(mc.stress + gain / 2); mc.sympathy[rival] = clamp(mc.sympathy[rival] - gain / 3, -100, 100);
          this.bubble(m, '💢'); this.episode(m, `видел, как ${this.chars.heroine.name} и ${this.chars[rival].name}: ${KIND_LABEL[k]}`, ['heroine', rival]);
          this.log(m, 'event', `💢 ${mc.name} ревнует: ${this.chars.heroine.name} и ${this.chars[rival].name} (+${r1(gain)})`);
        }
      }
    } else if (verb === 'decline') {
      this.bubble(inv.to, '👎');
      this.cooldowns[`${inv.from}>${inv.to}:${k}`] = this.t + 120;
      this.log(inv.to, 'result', `${B.name} → ${A.name}: 👎 ${KIND_LABEL[k]}`);
      A.grudge[inv.to] = clamp(A.grudge[inv.to] + (k === 'flirt' ? 15 : 6)); A.stress = clamp(A.stress + (k === 'flirt' ? 12 : 5));
      this.episode(inv.from, `${B.name} отказал(а): ${KIND_LABEL[k]}`, [inv.to]); this.episode(inv.to, `отказал(а) ${A.name}: ${KIND_LABEL[k]}`, [inv.from]);
      A.needsDecision = this.awake(inv.from); A.decisionReason = `${B.name} отказал(а)`;
      if (!B.activity) { B.needsDecision = this.awake(inv.to); B.decisionReason = 'ответил(а) на приглашение'; }
    } else {
      if (!timeout) this.bubble(inv.to, '✋');
      this.cooldowns[`${inv.from}>${inv.to}:${k}`] = this.t + 30;
      this.log(inv.to, 'result', timeout ? `${B.name} → ${A.name}: без ответа (${KIND_LABEL[k]})` : `${B.name} → ${A.name}: ✋ не сейчас (${KIND_LABEL[k]})`);
      A.needsDecision = this.awake(inv.from); A.decisionReason = timeout ? 'не дождался ответа' : `${B.name} сказал(а) «не сейчас»`;
      if (!B.activity && !timeout) { B.needsDecision = this.awake(inv.to); B.decisionReason = 'ответил(а) на приглашение'; }
    }
  }
}

const staff = id => id !== 'heroine';

// Эффекты занятий: during — прибавка к скорости изменения (в час); done — разово по завершении.
const pair = (w, id, a, fn) => { if (!a.partner) return; fn(w.chars[id], w.chars[a.partner]); };
const bond = (w, id, a, s) => pair(w, id, a, (me, other) => { me.sympathy[other.id] = clamp(me.sympathy[other.id] + s, -100, 100); });
const attract = (w, id, a, s) => pair(w, id, a, (me, other) => { if (me.attraction[other.id] !== undefined) me.attraction[other.id] = clamp(me.attraction[other.id] + s); });
const epi = (w, id, a, text) => w.episode(id, a.partner ? `${text} с ${w.chars[a.partner].name}` : text, a.partner ? [a.partner] : []);
const sub = (c, n, v) => { c.needs[n] = clamp(c.needs[n] - v); };

export const ACTIONS = {
  work: { label: 'работает за столом', interruptible: true, during: { recognition: -30, boredom: 6, fatigue: 4, social: 2 }, done: (w, id) => { w.chars[id].workToday++; } },
  rest: { label: 'отдыхает на скамье', interruptible: true, during: { fatigue: -35, stress: -10 } },
  window: { label: 'стоит у окна', interruptible: true, done: (w, id) => sub(w.chars[id], 'boredom', 25) },
  stroll: { label: 'ходит по редакции', interruptible: true, done: (w, id) => sub(w.chars[id], 'boredom', 15) },
  teletype: { label: 'читает ленту телетайпа', interruptible: false, done: (w, id) => { const c = w.chars[id]; sub(c, 'boredom', 20); sub(c, 'recognition', 10); w.episode(id, 'взял ленту телетайпа'); } },
  coffee: { label: 'пьёт кофе', interruptible: true, done: (w, id) => { const c = w.chars[id]; sub(c, 'coffee', 70); sub(c, 'fatigue', 10); } },
  smoke: { label: 'курит у окна', interruptible: true, during: { stress: -60 }, done: (w, id) => sub(w.chars[id], 'nicotine', 75) },
  drink: { label: 'пьёт виски', interruptible: true, during: { stress: -40 }, done: (w, id) => { const c = w.chars[id]; sub(c, 'alcohol', 45); c.intox = clamp(c.intox + 18); w.episode(id, 'выпил виски один'); } },
  record: { label: 'ставит пластинку', interruptible: false, done: (w, id) => { w.music = { until: w.t + w._between(45, 75), by: id }; sub(w.chars[id], 'fun', 10); w.log(id, 'result', '🎵 Заиграла пластинка.'); w.bubble(id, '🎵'); w._interruptAll('заиграла музыка'); } },
  dance: { label: 'танцует', interruptible: true, during: { fatigue: 6 }, done: (w, id) => { const c = w.chars[id]; sub(c, 'fun', 35); sub(c, 'boredom', 20); } },
  sleep: { label: 'спит', interruptible: false, during: { fatigue: -30, stress: -20 } },
  idle: { label: 'ничего не делает', interruptible: true },
  phone: { label: 'говорит по телефону', interruptible: false, done: (w, id, a) => { sub(w.chars[id], 'social', 10); w.episode(id, `снял трубку: «${a.text}»`); for (const o of IDS) if (o !== id && w.awake(o)) w.episode(o, `${w.chars[id].name} снял трубку: «${a.text}»`, [id]); } },
  inviting: { label: 'зовёт коллегу', interruptible: false },
  repay: { label: 'возвращает долг', interruptible: false, done: (w, id, a) => { const c = w.chars[id]; c.sympathy[a.target] = clamp(c.sympathy[a.target] + 5, -100, 100); w.chars[a.target].sympathy[id] = clamp(w.chars[a.target].sympathy[id] + 8, -100, 100); w.episode(id, `вернул долг ${w.chars[a.target].name}`, [a.target]); w.episode(a.target, `${c.name} вернул долг`, [id]); } },
  tell_news: { label: 'рассказывает новость', interruptible: false, done: (w, id, a) => { const t = w.chars[a.target]; sub(t, 'social', 15); sub(t, 'boredom', 10); if (a.target === 'reporter') sub(t, 'recognition', 10); t.sympathy[id] = clamp(t.sympathy[id] + 4, -100, 100); w.episode(a.target, `${w.chars[id].name} рассказала новость из клуба`, [id]); w.episode(id, `рассказала новость: ${t.name}`, [a.target]); } },
  joint_drink: { label: 'выпивает вместе', interruptible: false, during: { stress: -40 }, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'alcohol', 50); sub(c, 'social', 30); c.intox = clamp(c.intox + 20); bond(w, id, a, 6); attract(w, id, a, 4); epi(w, id, a, 'выпил виски'); } },
  joint_coffee: { label: 'пьёт кофе вместе', interruptible: false, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'coffee', 60); sub(c, 'social', 25); bond(w, id, a, 4); epi(w, id, a, 'пил кофе'); } },
  joint_smoke: { label: 'курит вместе', interruptible: false, during: { stress: -50 }, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'nicotine', 70); sub(c, 'social', 20); bond(w, id, a, 4); epi(w, id, a, 'курил'); } },
  joint_dance: { label: 'танцует в паре', interruptible: false, during: { fatigue: 6 }, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'fun', 40); sub(c, 'social', 20); bond(w, id, a, 5); attract(w, id, a, 8); epi(w, id, a, 'танцевал'); } },
  joint_talk: { label: 'разговаривает', interruptible: false, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'social', 35); sub(c, 'boredom', 15); bond(w, id, a, 4); epi(w, id, a, 'разговаривал'); } },
  joint_flirt: { label: 'флиртует, обнимаются', interruptible: false, done: (w, id, a) => { const c = w.chars[id]; sub(c, 'fun', 25); sub(c, 'social', 20); bond(w, id, a, 6); attract(w, id, a, 12); w.bubble(id, '❤️'); epi(w, id, a, 'обнимались и целовались'); } },
  joint_loan: { label: 'договаривается о долге', interruptible: false, done: (w, id, a) => { bond(w, id, a, 2); epi(w, id, a, 'договорились о долге'); } },
  archie_scout: { label: 'ищет фильмы (скаут Арчи)', interruptible: false, during: { recognition: -20, fatigue: 3, boredom: -8 } },
  archie_match: { label: 'сверяет находки со вкусом владельца', interruptible: false, during: { recognition: -20, fatigue: 3 } },
  archie_cards: { label: 'печатает карточки фильмов', interruptible: false, during: { recognition: -20, fatigue: 3 } },
};

function describe(w, id, actionId) {
  const [head, target] = actionId.split('@'); const [verb, arg] = head.split(':');
  const name = target ? w.chars[target]?.name : '';
  if (verb === 'continue') return 'продолжает: ' + (ACTIONS[w.chars[id].activity?.type]?.label || 'занятие');
  if (['accept', 'decline', 'defer'].includes(verb)) { const inv = w.invitations.find(i => `invitation-${i.id}` === arg); const t = inv ? `${w.chars[inv.from].name}, ${KIND_LABEL[inv.kind]}` : arg; return ({ accept: 'принимает', decline: 'отказывает', defer: 'откладывает' })[verb] + `: ${t}`; }
  if (verb.startsWith('invite_')) return `→ ${name}: ${BUBBLE[verb.slice(7)]} ${KIND_LABEL[verb.slice(7)]}`;
  const map = { continue: 'продолжает', work: 'садится работать', rest: 'идёт отдохнуть на скамью', window: 'идёт к окну', stroll: 'прохаживается по редакции', teletype: 'идёт к телетайпу', coffee: 'идёт варить кофе', smoke: 'идёт курить к окну', drink: 'наливает виски', record: 'ставит пластинку', dance: 'танцует один', sleep: 'ложится спать', idle: 'ничего не делает', answer_phone: 'снимает трубку', leave: 'уходит', repay: `возвращает долг ${name}`, tell_news: `рассказывает новость ${name}` };
  return map[verb] || actionId;
}
