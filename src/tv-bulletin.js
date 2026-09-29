// tv-bulletin.js — CHANNEL 7 NEWS BULLETIN: a rendered 20-s clip (slate, then the anchor is handed a sheet and reads it)
// with the story's headline written by the page into the clip's empty lower-third bar (rows 198-228, right of the tag).
// The canvas goes to the CRT shader like any channel: tv.switchTo(bulletin.texture) — sched.bulletin() does that.
import * as THREE from 'three';

export const BULLETIN_SEC = 20;
const TEXT_FROM = 3.5;                      // s: the bar has slid in by then
const X0 = 82, X1 = 314, Y = 213;           // headline area in the 320x240 frame

export function createBulletin({ base = 'assets/tv/', file = 'tv-bulletin-v01', fallback = null } = {}) {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  video.setAttribute('playsinline', '');
  for (const ext of ['webm', 'mp4']) { const s = document.createElement('source'); s.src = `${base}${file}.${ext}`; s.type = 'video/' + ext; video.appendChild(s); }
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
  const g = cv.getContext('2d');
  const texture = new THREE.CanvasTexture(cv);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;   // the screen's UVs come from the GLB
  let text = '', t = 0, t0 = 0, on = false;               // t: seconds since the bulletin began (wall clock, not frame steps)

  function seek() { try { video.currentTime = Math.min(t, BULLETIN_SEC - 0.1); } catch { /* not ready yet */ } }
  function draw() {
    if (video.readyState >= 2) g.drawImage(video, 0, 0, 320, 240);
    else {                                               // clip not loaded yet: the old still, or black
      const img = fallback && fallback();
      if (img) g.drawImage(img, 0, 0, 320, 240); else { g.fillStyle = '#000'; g.fillRect(0, 0, 320, 240); }
    }
    if (!text || t < TEXT_FROM) return;
    g.save(); g.beginPath(); g.rect(X0, 199, X1 - X0, 29); g.clip();
    g.font = 'bold 15px Helvetica, Arial, sans-serif'; g.fillStyle = '#ecece8'; g.textBaseline = 'middle';
    const w = g.measureText(text).width, room = X1 - X0;
    const x = w <= room - 8 ? X0 + 6 : X1 - ((t - TEXT_FROM) * 45) % (w + room);   // short: still; long: runs right to left
    g.fillText(text, x, Y); g.restore();
  }
  return {
    texture, video,
    get active() { return on; },
    start(headline, since = 0) {
      text = String(headline || '').toUpperCase(); t = since; t0 = performance.now() / 1000 - since; on = true;
      if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
      video.play().catch(() => {}); draw(); texture.needsUpdate = true;
    },
    update() {
      if (!on) return;
      t = performance.now() / 1000 - t0;
      if (t >= BULLETIN_SEC) { on = false; video.pause(); return; }
      draw(); texture.needsUpdate = true;
    },
  };
}
