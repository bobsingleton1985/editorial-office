// tv-schedule.js — сетка вещания CHANNEL 7, одна для всех зрителей.
// Канал и место в ролике считаются от общих часов (UTC), поэтому
// у всех зрителей в один момент идёт одно и то же — без сервера и реле.
//
//   import { createTvScreen, loadVideoTexture } from './tv-crt.js';
//   import { createTvSchedule } from './tv-schedule.js';
//   const tv = createTvScreen(screenMesh, { flipY: false });
//   const sched = createTvSchedule(tv, loadVideoTexture, {
//     base: 'assets/tv/',                       // где лежат ролики
//     cityHour: () => cityDate.getHours(),       // час выбранного города (как у часов в офисе)
//   });
//   в цикле: sched.update(); tv.update(dt);
//   телетайп принёс сообщение: sched.bulletin(bulletinTexture, 20);

export const PROGRAM = [
  'anchor', 'weather', 'coffee', 'korea', 'jazz', 'suburb', 'stars', 'boxing',
];
export const CLIP_SEC = 12;           // все ролики по 12 с, петля
export const FILES = {
  anchor: 'tv-anchor-v01', weather: 'tv-weather-v02', coffee: 'tv-coffee-v01',
  korea: 'tv-korea-v01', jazz: 'tv-jazz-v01', suburb: 'tv-suburb-v01',
  stars: 'tv-stars-v01', boxing: 'tv-boxing-v01',
};

// Чистая функция: что идёт в эфире в момент t (мс, UTC).
export function onAir(tMs, { slotSec = 60, program = PROGRAM, cityHour = null } = {}) {
  if (cityHour != null && cityHour >= 1 && cityHour < 6) return { ch: 'card', offset: 0 }; // ночью станция не вещает
  const s = tMs / 1000;
  const slot = Math.floor(s / slotSec);
  const ch = program[((slot % program.length) + program.length) % program.length];
  const offset = (s - slot * slotSec) % CLIP_SEC;
  return { ch, offset, slot };
}

export function createTvSchedule(tv, loadVideoTexture, opts = {}) {
  const base = opts.base ?? 'assets/tv/';
  const flipY = opts.flipY ?? false;
  const now = opts.now ?? (() => Date.now());
  const tex = {};
  const get = (ch) => {
    if (ch === 'card') return tv.testcard;
    if (!tex[ch]) tex[ch] = loadVideoTexture([`${base}${FILES[ch]}.webm`, `${base}${FILES[ch]}.mp4`], { flipY });
    return tex[ch];
  };
  let current = null, bulletinUntil = 0, lastSync = 0;

  function show(ch, offset) {
    const t = get(ch);
    tv.switchTo(t);
    const v = t && t.userData && t.userData.video;
    if (v) { const seek = () => { v.currentTime = offset + 0.45; }; v.readyState >= 1 ? seek() : v.addEventListener('loadedmetadata', seek, { once: true }); }
    current = ch;
  }

  return {
    get current() { return current; },
    // Экстренный выпуск поверх сетки (телетайп). Картинка — tv_news.jpg или canvas.
    bulletin(texture, seconds = 20) { bulletinUntil = now() + seconds * 1000; tv.switchTo(texture); current = 'bulletin'; },
    update() {
      const t = now();
      if (t < bulletinUntil) return;
      const { ch, offset } = onAir(t, { slotSec: opts.slotSec, program: opts.program, cityHour: opts.cityHour ? opts.cityHour() : null });
      if (ch !== current) { show(ch, offset); lastSync = t; return; }
      // раз в 30 с подтягиваем ролик к общим часам (вкладка могла спать)
      if (t - lastSync > 30000) {
        lastSync = t;
        const v = get(ch)?.userData?.video;
        if (v && Math.abs(v.currentTime - offset) > 0.5 && Math.abs(v.currentTime - offset) < CLIP_SEC - 0.5) v.currentTime = offset;
      }
    },
  };
}
