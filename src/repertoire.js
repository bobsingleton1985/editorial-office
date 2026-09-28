// ☰ panel section: which clips and chains the newsroom can play (from the animation registry).
// For now visible to everyone (owner's decision 29.09). isOwner() is kept for the later owner/viewer split (?owner=1 / ?owner=0).
const KEY = 'editorial.owner';
export function isOwner() {
  const q = new URLSearchParams(location.search).get('owner');
  try { if (q === '1') localStorage.setItem(KEY, '1'); if (q === '0') localStorage.removeItem(KEY); return localStorage.getItem(KEY) === '1'; }
  catch (e) { return q === '1'; }
}
const ICON = { 'в живой редакции': '🎬', 'готов': '✅', 'склад': '📦' };
export function addRepertoire(panel, url, current) {
  if (!panel) return;
  const box = document.createElement('section'); box.id = 'repertoire';
  const css = document.createElement('style');
  css.textContent = `#repertoire .rc{margin:6px 0;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
#repertoire .rc.now{border-color:var(--accent);background:rgba(224,145,58,.12)}
#repertoire .rc b{font-weight:600} #repertoire .dim{color:var(--muted)}
#repertoire table{width:100%;border-collapse:collapse;font-size:12px} #repertoire td{padding:3px 2px;border-top:1px solid var(--line)}
#repertoire td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}`;
  document.head.append(css);
  const menuBtn = document.getElementById('menu');
  panel.insertBefore(box, panel.querySelector('.btns:last-of-type') || null);
  let data = null, loading = false;
  const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function render() {
    box.replaceChildren(el('h2', null, '🎬 Репертуар'));
    if (!data) { box.append(el('div', 'hint', loading ? 'Загрузка…' : 'Реестр не загрузился')); return; }
    const t = data.totals, now = current();
    box.append(el('div', 'hint', `Живых клипов ${t.live} · готовых ${t.ready} · на складе ${t.stock} · обновлено ${data.updated}`));
    box.append(el('h2', null, 'Цепочки'));
    for (const c of data.chains) {
      const d = el('div', 'rc' + (c.id === now ? ' now' : ''));
      const top = el('div'); top.append(el('b', null, `${ICON[c.status] || ''} ${c.name}`)); if (c.id === now) top.append(el('span', 'dim', '  ← сейчас'));
      d.append(top, el('div', 'dim', [c.place, c.participants !== '1' ? 'участники: ' + c.participants : '', c.status === 'готов' ? 'на странице ' + c.page : '', c.note].filter(Boolean).join(' · ')));
      box.append(d);
    }
    for (const [g, title] of [['тело', 'Тело'], ['предметы', 'Предметы'], ['люди', 'Люди']]) {
      const rows = data.actions.filter((a) => a.group === g); if (!rows.length) continue;
      box.append(el('h2', null, title + ' · 🎬 / ✅ / 📦'));
      const tb = el('table');
      for (const a of rows) {
        const tr = el('tr', a.live ? '' : 'dim');
        tr.append(el('td', null, a.action + (a.states.length ? ' — ' + a.states.join(', ') : '')), el('td', 'n', `${a.live} / ${a.ready} / ${a.stock}`));
        tb.append(tr);
      }
      box.append(tb);
    }
  }
  async function load() {
    if (data || loading) return; loading = true; render();
    try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); data = await r.json(); } catch (e) { data = null; }
    loading = false; render();
  }
  let last = null;
  setInterval(() => { if (panel.hidden || !data) return; const n = current(); if (n !== last) { last = n; render(); } }, 1000);
  menuBtn?.addEventListener('click', () => { if (!panel.hidden) load(); });
  render();
}
