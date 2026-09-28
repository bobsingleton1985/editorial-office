// ☰ panel section «Режиссёр (Jev)»: is the newsroom online, who made the last decision (Jev or the fallback rule), and when.
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function ago(ms) { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return 'только что'; const m = Math.round(s / 60); if (m < 60) return m + ' мин назад'; return Math.round(m / 60) + ' ч назад'; }
export function addDirectorStatus(section, get) {
  if (!section) return;
  const sec = section('🧠 Режиссёр (Jev)', 'director'), box = el('div', 'rep'); sec.append(box);
  function render() {
    const { net, world, now } = get(), e = world?.editor;
    const rows = [];
    rows.push(['Связь с редакцией', net.online ? `есть · смотрят: ${net.viewers ?? '—'}` : (net.reason === 'no_relay' ? 'не настроена' : 'нет')]);
    if (e) {
      const who = e.source === 'jev' ? `Jev${e.confidence != null ? ` (уверенность ${Math.round(e.confidence * 100)} %)` : ''}` :
        e.source === 'rule' ? 'простое правило — Jev недоступен или исчерпан дневной лимит' : e.source === 'start' ? 'стартовое состояние' : (e.source || '—');
      rows.push(['Последнее решение', who]);
      rows.push(['Когда', typeof e.at === 'number' ? ago(now - e.at) : '—']);
      if (e.label) rows.push(['Что делает', e.label]);
      rows.push(['Jev сейчас', e.source === 'jev' ? '✅ работает' : e.source === 'rule' ? '⚠️ не отвечает, решает правило' : 'ждёт первого решения']);
    } else rows.push(['Последнее решение', 'ещё не получено']);
    const tb = el('table'); for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('td', 'dim', k), el('td', null, v)); tb.append(tr); }
    box.replaceChildren(tb, el('div', 'hint', 'Jev думает, только пока редакцию кто-то смотрит.'));
  }
  setInterval(() => { if (sec.open) render(); }, 1000);
  sec.addEventListener('toggle', () => { if (sec.open) render(); });
  render();
}
