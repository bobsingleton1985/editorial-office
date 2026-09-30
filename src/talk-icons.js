// Speech bubbles between people: two pictograms, the thing offered + the answer (owner 30.09: «in the bubble I must see what is
// offered and what is refused»). Our own flat pictograms in the office's 1950s palette — not system emoji (they differ between
// Mac, Windows and phones). Canvas 2D, drawn once per pair and cached as a texture.

const INK = '#2e2219', CREAM = '#f4e8cc', PAPER = '#fbf7ee', RED = '#b8412c', MUST = '#d9a43a', SMOKE = '#9c948a', SKIN = '#e2b48a', AMBER = '#c77a22', BROWN = '#6b3d22';

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fillStroke(c, fill, lw = 5) { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }

// every icon is drawn in a 100 × 100 box centred on (0, 0)
const ICONS = {
  smoke(c) {                                   // a cigarette with a burning tip and a curl of smoke
    c.save(); c.rotate(-0.32);
    rr(c, -40, 4, 80, 16, 5); fillStroke(c, PAPER);
    rr(c, -40, 4, 24, 16, 5); fillStroke(c, MUST);
    c.beginPath(); c.moveTo(38, 5); c.lineTo(44, 12); c.lineTo(38, 19); c.closePath(); c.fillStyle = RED; c.fill();
    c.restore();
    c.beginPath(); c.moveTo(36, -6); c.bezierCurveTo(26, -16, 44, -22, 33, -32); c.bezierCurveTo(24, -40, 36, -46, 31, -52);
    c.lineWidth = 6; c.strokeStyle = SMOKE; c.lineCap = 'round'; c.stroke();
  },
  coffee(c) {                                  // a mug with a curl of steam
    rr(c, -30, -14, 46, 50, 7); fillStroke(c, PAPER);
    c.beginPath(); c.arc(18, 10, 13, -Math.PI / 2, Math.PI / 2); c.lineWidth = 7; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.ellipse(-7, -14, 21, 5, 0, 0, Math.PI * 2); c.fillStyle = BROWN; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(-12, -24); c.bezierCurveTo(-22, -34, -2, -40, -12, -52); c.moveTo(4, -24); c.bezierCurveTo(-6, -34, 14, -40, 4, -52);
    c.lineWidth = 5; c.strokeStyle = SMOKE; c.lineCap = 'round'; c.stroke();
  },
  whisky(c) {                                  // a tumbler with amber whisky
    c.beginPath(); c.moveTo(-30, -26); c.lineTo(30, -26); c.lineTo(24, 36); c.lineTo(-24, 36); c.closePath(); c.fillStyle = PAPER; c.fill();
    c.beginPath(); c.moveTo(-27, 2); c.lineTo(27, 2); c.lineTo(24, 36); c.lineTo(-24, 36); c.closePath(); c.fillStyle = AMBER; c.fill();
    c.beginPath(); c.moveTo(-30, -26); c.lineTo(30, -26); c.lineTo(24, 36); c.lineTo(-24, 36); c.closePath(); c.lineWidth = 5; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  },
  q(c) {                                       // the question: a bold serif «?»
    c.fillStyle = RED; c.font = 'bold 92px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 5; c.strokeStyle = INK; c.strokeText('?', 0, 6); c.fillText('?', 0, 6);
  },
  yes(c) { thumb(c, 1); },
  no(c) { thumb(c, -1); },
  later(c) {                                   // an open palm: «wait, not now»
    const fingers = [[-22, -38, 14, 44], [-6, -46, 14, 52], [10, -42, 14, 48], [26, -32, 13, 38]];
    for (const [x, y, w, h] of fingers) { rr(c, x - w / 2, y, w, h, 7); fillStroke(c, SKIN, 4); }
    c.save(); c.translate(-30, 14); c.rotate(-0.75); rr(c, -7, -26, 14, 34, 7); fillStroke(c, SKIN, 4); c.restore();
    rr(c, -30, -4, 64, 44, 14); fillStroke(c, SKIN, 4);
  },
};
function thumb(c, dir) {                       // a fist with the thumb up (dir 1) or down (−1)
  c.save(); c.scale(1, dir);
  rr(c, -6, -46, 20, 44, 10); fillStroke(c, SKIN, 4);           // the thumb
  rr(c, -30, -8, 58, 46, 12); fillStroke(c, SKIN, 4);           // the fist
  c.lineWidth = 3.5; c.strokeStyle = INK;
  for (const y of [7, 21]) { c.beginPath(); c.moveTo(-26, y); c.lineTo(8, y); c.stroke(); }
  rr(c, -40, -6, 12, 42, 5); fillStroke(c, RED, 4);              // the cuff
  c.restore();
}
export const ICON_NAMES = Object.keys(ICONS);

// the bubble: a cream balloon with a tail pointing down at the speaker, the thing on the left, the answer on the right
export function drawBubble(canvas, thing, mark) {
  const W = 256, H = 176; canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d'); c.clearRect(0, 0, W, H);
  c.beginPath(); const x = 8, y = 8, w = W - 16, h = 124, r = 34;
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.lineTo(W / 2 + 18, y + h); c.lineTo(W / 2 - 6, H - 8); c.lineTo(W / 2 - 16, y + h);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  c.fillStyle = CREAM; c.fill(); c.lineWidth = 7; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  for (const [k, cx] of [[thing, 74], [mark, 182]]) { const f = ICONS[k]; if (!f) continue;
    c.save(); c.translate(cx, 70); c.scale(0.92, 0.92); f(c); c.restore(); }
  return canvas;
}
