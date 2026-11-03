// Read-only: draws the document + transient preview. Never mutates the document.
function gridStep(scale) {
  const target = 12 / scale, p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (p * m >= target) return p * m;
  return p * 10;
}
function tracePath(c, vp, e) {
  c.beginPath();
  if (e.type === 'line') { const a = vp.toScreen(e.p1), b = vp.toScreen(e.p2); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
  else if (e.type === 'circle') { const s = vp.toScreen(e.center); c.arc(s.x, s.y, e.radius * vp.scale, 0, Math.PI * 2); }
  else if (e.type === 'polyline') {
    e.vertices.forEach((v, i) => { const s = vp.toScreen(v); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
    if (e.closed) c.closePath();
  }
}
function stroke(c, vp, e, color, lw, dash = []) {
  tracePath(c, vp, e); c.strokeStyle = color; c.lineWidth = lw; c.setLineDash(dash); c.stroke();
}

export function render(cv, { doc, vp, cursor, preview, readout, theme }) {
  const c = cv.getContext('2d');
  c.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  c.fillStyle = theme.bg; c.fillRect(0, 0, vp.w, vp.h);

  // grid
  const step = gridStep(vp.scale), tl = vp.toWorld({ x: 0, y: 0 }), br = vp.toWorld({ x: vp.w, y: vp.h });
  c.lineWidth = 1; c.setLineDash([]);
  for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
    const sx = Math.round(vp.toScreen({ x, y: 0 }).x) + 0.5;
    c.strokeStyle = Math.round(x / step) % 5 === 0 ? theme.grid2 : theme.grid;
    c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, vp.h); c.stroke();
  }
  for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) {
    const sy = Math.round(vp.toScreen({ x: 0, y }).y) + 0.5;
    c.strokeStyle = Math.round(y / step) % 5 === 0 ? theme.grid2 : theme.grid;
    c.beginPath(); c.moveTo(0, sy); c.lineTo(vp.w, sy); c.stroke();
  }
  const o = vp.toScreen({ x: 0, y: 0 });                       // origin axes
  c.strokeStyle = theme.axis; c.beginPath();
  c.moveTo(o.x, 0); c.lineTo(o.x, vp.h); c.moveTo(0, o.y); c.lineTo(vp.w, o.y); c.stroke();

  // entities
  for (const id of doc.order) {
    const e = doc.entities.get(id), L = doc.layers.find(l => l.id === e.layerId);
    if (L && !L.visible) continue;
    const sel = doc.selection.has(id);
    stroke(c, vp, e, sel ? theme.sel : e.color || (L && L.color) || theme.ink, sel ? 2.5 : 1.5, sel ? [6, 4] : []);
  }
  for (const e of preview) stroke(c, vp, e, theme.prev, 1.5, [5, 4]);

  // cursor + dynamic readout
  const s = vp.toScreen(cursor), arm = 16;
  c.setLineDash([]); c.strokeStyle = theme.cur; c.lineWidth = 1;
  c.beginPath(); c.moveTo(s.x - arm, s.y); c.lineTo(s.x + arm, s.y); c.moveTo(s.x, s.y - arm); c.lineTo(s.x, s.y + arm); c.stroke();
  c.strokeRect(s.x - 4, s.y - 4, 8, 8);
  c.font = '12px ui-monospace, Menlo, Consolas, monospace'; c.fillStyle = theme.cur; c.textBaseline = 'bottom';
  const label = readout ? `${readout.d.toFixed(2)} < ${readout.a.toFixed(1)}°` : `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}`;
  const tw = c.measureText(label).width, tx = s.x + 20 + tw > vp.w ? s.x - 20 - tw : s.x + 20;
  c.fillText(label, tx, Math.max(14, s.y - 8));
}
