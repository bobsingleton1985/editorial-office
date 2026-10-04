// A typewriter sheet is a small list of printed glyphs. Encode that drawing as
// an image, avoiding synchronous GPU readback and PNG compression per keystroke.
// The existing viewer Image loader supports this URI; no protocol change needed.
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function typewriterImage(width, height, size, glyphs) {
  const text = glyphs.map(([char,x,y])=>`<text x="${x}" y="${y}">${escape(char)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="'Courier New', Courier, monospace" font-size="${size}" fill="rgb(28,24,22)" fill-opacity="0.9">${text}</g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
