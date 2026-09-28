// Picture quality for weak devices (TVs, old phones). In "auto" the page watches its own frame rate and steps down:
// high → medium → low → lowest. The level that worked is remembered per device, so the next visit starts there.
const KEY = 'editorial.quality.v2';
const TV = /SMART-?TV|SmartTV|Tizen|Web0S|webOS|NetCast|BRAVIA|Android TV|GoogleTV|AFT[A-Z]|HbbTV|CrKey|VIDAA|Roku|Hisense|Philips/i.test(navigator.userAgent);
// cache: the still room is drawn once into a texture; each frame only the moving things are drawn (see cache.js)
// ratio: pixels per CSS pixel for the canvas (people and moving things); room: share of that resolution for the cached room picture
export const LEVELS = [
  { id: 'lowest', label: 'самое низкое', ratio: 2, room: 0.75, shadows: false, live: false, cache: true },
  { id: 'low', label: 'низкое', ratio: 2, room: 1, shadows: false, live: false, cache: true },
  { id: 'medium', label: 'среднее', ratio: 1, shadows: true, live: false, cache: false },
  { id: 'high', label: 'высокое', ratio: 2, shadows: true, live: true, cache: false },   // live: shadows follow a moving character every frame
];
const find = (id) => LEVELS.findIndex((l) => l.id === id);
function remembered() { try { const v = localStorage.getItem(KEY); return v === null ? -1 : +v; } catch (e) { return -1; } }
function remember(i) { try { localStorage.setItem(KEY, String(i)); } catch (e) { /* private mode */ } }

export function createQuality(mode) {
  const start = () => { const m = remembered(); return m >= 0 && m < LEVELS.length ? m : TV ? 1 : 3; };
  let auto = mode === 'auto' || find(mode) < 0, lvl = auto ? start() : find(mode);
  let hold = 4, acc = 0, n = 0, bad = 0;
  return {
    tv: TV,
    antialias: true,                                      // cheap on the cached levels: only people and small props are drawn each frame
    get auto() { return auto; },
    get level() { return LEVELS[lvl]; },
    pixelRatio: () => Math.min(devicePixelRatio, LEVELS[lvl].ratio),
    roomScale: () => LEVELS[lvl].room || 1,
    set(m) { auto = m === 'auto' || find(m) < 0; lvl = auto ? start() : find(m); hold = 4; acc = 0; n = 0; bad = 0; },
    // call every frame with the real frame time; returns true when the level changed
    tick(dt, ready) {
      if (!auto || !ready || document.visibilityState !== 'visible') return false;
      dt = Math.min(dt, 0.5);                                 // a single hiccup must not look like a dead device
      if (hold > 0) { hold -= dt; return false; }
      acc += dt; n++;
      if (acc < 2) return false;
      const fps = n / acc; acc = 0; n = 0;
      bad = fps < 40 ? bad + 1 : 0;
      if (bad >= 2 && lvl > 0) { lvl--; remember(lvl); hold = 3; bad = 0; return true; }   // two slow windows in a row
      if (fps >= 55 && remembered() !== lvl) remember(lvl);   // this level is fine here
      return false;
    },
  };
}
