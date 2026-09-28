// ☰ panel sections «Цепочки анимации» and «Действия и клипы» (from the animation registry, registry-live.json on the VPS).
// For now visible to everyone (owner's decision 29.09). isOwner() is kept for the later owner/viewer split (?owner=1 / ?owner=0).
const KEY = 'editorial.owner';
export function isOwner() {
  const q = new URLSearchParams(location.search).get('owner');
  try { if (q === '1') localStorage.setItem(KEY, '1'); if (q === '0') localStorage.removeItem(KEY); return localStorage.getItem(KEY) === '1'; }
  catch (e) { return q === '1'; }
}
const ICON = { 'в живой редакции': '🎬', 'готов': '✅', 'склад': '📦' };
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
export function addRepertoire(section, url, current) {
  if (!section) return;
  const secC = section('🎬 Цепочки анимации', 'chains'), secA = section('Действия и клипы', 'actions');
  const boxC = el('div', 'rep'), boxA = el('div', 'rep'); secC.append(boxC); secA.append(boxA);
  let data = null, loading = false, failed = false;
  function render() {
    if (!data) { const t = loading ? 'Загрузка…' : failed ? 'Реестр не загрузился' : ''; boxC.replaceChildren(el('div', 'hint', t)); boxA.replaceChildren(el('div', 'hint', t)); return; }
    const t = data.totals, now = current();
    boxC.replaceChildren(el('div', 'hint', `🎬 в редакции ${t.live} клипов · ✅ готовы ${t.ready} · 📦 на складе ${t.stock}`));
    for (const c of data.chains) {
      const d = el('div', 'rc' + (c.id === now ? ' now' : ''));
      const top = el('div'); top.append(el('b', null, `${ICON[c.status] || ''} ${c.name}`)); if (c.id === now) top.append(el('span', 'dim', '  ← сейчас'));
      d.append(top, el('div', 'dim', [c.place, c.participants !== '1' ? 'участники: ' + c.participants : '', c.status === 'готов' ? 'на странице ' + c.page : '', c.note].filter(Boolean).join(' · ')));
      boxC.append(d);
    }
    boxA.replaceChildren(el('div', 'hint', 'Число клипов: 🎬 в редакции / ✅ готовы / 📦 на складе'));
    for (const [g, title] of [['тело', 'Тело'], ['предметы', 'Предметы'], ['люди', 'Люди']]) {
      const rows = data.actions.filter((a) => a.group === g); if (!rows.length) continue;
      boxA.append(el('div', 'sub', title));
      const tb = el('table');
      for (const a of rows) {
        const tr = el('tr', a.live ? '' : 'dim');
        tr.append(el('td', null, a.action + (a.states.length ? ' — ' + a.states.join(', ') : '')), el('td', 'n', `${a.live} / ${a.ready} / ${a.stock}`));
        tb.append(tr);
      }
      boxA.append(tb);
    }
  }
  async function load() {
    if (data || loading) return; loading = true; render();
    try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); data = await r.json(); } catch (e) { failed = true; }
    loading = false; render();
  }
  for (const s of [secC, secA]) { s.addEventListener('toggle', () => { if (s.open) load(); }); if (s.open) load(); }
  let last;
  setInterval(() => { if (!secC.open || !data) return; const n = current(); if (n !== last) { last = n; render(); } }, 1000);
  render();
}
