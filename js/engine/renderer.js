import { tessellate } from './geometry.js';
// Read-only: draws the document + transient preview. Never mutates the document.

function tracePath(c, vp, e) {
  c.beginPath();
  if (e.type === 'line') { const a = vp.toScreen(e.p1), b = vp.toScreen(e.p2); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
  else if (e.type === 'circle') { const s = vp.toScreen(e.center); c.arc(s.x, s.y, e.radius * vp.scale, 0, Math.PI * 2); }
  else if (e.type === 'arc') { const s = vp.toScreen(e.center); c.arc(s.x, s.y, e.radius * vp.scale, -e.start, -e.end, true); }
  else tessellate(e, 0.4 / vp.scale).forEach((v, i) => { const s = vp.toScreen(v); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
}
function stroke(c, vp, e, color, lw, dash = []) {
  tracePath(c, vp, e); c.strokeStyle = color; c.lineWidth = lw; c.setLineDash(dash); c.stroke();
}

const SNAP_LABEL = { endpoint: 'Endpoint', midpoint: 'Midpoint', center: 'Center', quadrant: 'Quadrant', intersection: 'Intersection', perpendicular: 'Perpendicular', tangent: 'Tangent', nearest: 'Nearest' };
function snapMarker(c, s, type, color) {
  const r = 7; c.strokeStyle = color; c.lineWidth = 2; c.setLineDash([]); c.beginPath();
  switch (type) {
    case 'endpoint': c.rect(s.x - r, s.y - r, 2 * r, 2 * r); break;
    case 'midpoint': c.moveTo(s.x, s.y - r); c.lineTo(s.x + r, s.y + r); c.lineTo(s.x - r, s.y + r); c.closePath(); break;
    case 'center': c.arc(s.x, s.y, r, 0, Math.PI * 2); break;
    case 'quadrant': c.moveTo(s.x, s.y - r); c.lineTo(s.x + r, s.y); c.lineTo(s.x, s.y + r); c.lineTo(s.x - r, s.y); c.closePath(); break;
    case 'intersection': c.moveTo(s.x - r, s.y - r); c.lineTo(s.x + r, s.y + r); c.moveTo(s.x + r, s.y - r); c.lineTo(s.x - r, s.y + r); break;
    case 'perpendicular': c.moveTo(s.x - r, s.y - r); c.lineTo(s.x - r, s.y + r); c.lineTo(s.x + r, s.y + r); c.moveTo(s.x - r, s.y); c.lineTo(s.x, s.y); c.lineTo(s.x, s.y + r); break;
    case 'tangent': c.arc(s.x, s.y, r - 1, 0, Math.PI * 2); c.moveTo(s.x - r, s.y - r - 1); c.lineTo(s.x + r, s.y - r - 1); break;
    case 'nearest': c.moveTo(s.x - r, s.y - r); c.lineTo(s.x + r, s.y - r); c.lineTo(s.x - r, s.y + r); c.lineTo(s.x + r, s.y + r); c.closePath(); break;
  }
  c.stroke();
}

export function render(cv, { doc, vp, cursor, preview, dyn, selBox, snap, track, theme }) {
  const c = cv.getContext('2d'), st = doc.settings;
  c.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  c.fillStyle = theme.bg; c.fillRect(0, 0, vp.w, vp.h);

  // grid (spacing from settings; coarsened automatically when it would be too dense to read)
  const tl = vp.toWorld({ x: 0, y: 0 }), br = vp.toWorld({ x: vp.w, y: vp.h });
  c.lineWidth = 1; c.setLineDash([]);
  if (st.gridVisible && st.gridSpacing > 0) {
    let step = st.gridSpacing; while (step * vp.scale < 8) step *= 5;
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(vp.toScreen({ x, y: 0 }).x) + 0.5;
      c.strokeStyle = Math.round(x / step) % 5 === 0 ? theme.grid2 : theme.grid; c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, vp.h); c.stroke();
    }
    for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) {
      const sy = Math.round(vp.toScreen({ x: 0, y }).y) + 0.5;
      c.strokeStyle = Math.round(y / step) % 5 === 0 ? theme.grid2 : theme.grid; c.beginPath(); c.moveTo(0, sy); c.lineTo(vp.w, sy); c.stroke();
    }
  }
  const o = vp.toScreen({ x: 0, y: 0 });
  c.strokeStyle = theme.axis; c.beginPath(); c.moveTo(o.x, 0); c.lineTo(o.x, vp.h); c.moveTo(0, o.y); c.lineTo(vp.w, o.y); c.stroke();

  for (const id of doc.order) {
    const e = doc.entities.get(id), L = doc.layers.find(l => l.id === e.layerId);
    if (L && !L.visible) continue;
    const sel = doc.selection.has(id);
    stroke(c, vp, e, sel ? theme.sel : e.color || (L && L.color) || theme.ink, sel ? 2.5 : 1.5, sel ? [6, 4] : []);
  }
  for (const e of preview) stroke(c, vp, e, theme.prev, 1.5, [5, 4]);

  if (track) {   // ortho / polar tracking ray
    const a = vp.toScreen(track.from), far = vp.w + vp.h;
    c.strokeStyle = theme.snap; c.lineWidth = 1; c.setLineDash([2, 5]); c.beginPath();
    c.moveTo(a.x, a.y); c.lineTo(a.x + far * Math.cos(track.angle), a.y - far * Math.sin(track.angle)); c.stroke(); c.setLineDash([]);
  }
  if (selBox) {   // window = solid blue, crossing = dashed green
    const A = vp.toScreen(selBox.a), B = vp.toScreen(selBox.b), col = selBox.crossing ? theme.cross : theme.win;
    const x = Math.min(A.x, B.x), y = Math.min(A.y, B.y), w = Math.abs(A.x - B.x), h = Math.abs(A.y - B.y);
    c.globalAlpha = 0.15; c.fillStyle = col; c.fillRect(x, y, w, h); c.globalAlpha = 1;
    c.strokeStyle = col; c.lineWidth = 1; c.setLineDash(selBox.crossing ? [6, 4] : []); c.strokeRect(x, y, w, h); c.setLineDash([]);
  }

  const s = vp.toScreen(cursor), arm = 16;
  c.setLineDash([]); c.strokeStyle = theme.cur; c.lineWidth = 1;
  c.beginPath(); c.moveTo(s.x - arm, s.y); c.lineTo(s.x + arm, s.y); c.moveTo(s.x, s.y - arm); c.lineTo(s.x, s.y + arm); c.stroke();
  c.strokeRect(s.x - 4, s.y - 4, 8, 8);
  c.font = '12px ui-monospace, Menlo, Consolas, monospace'; c.textBaseline = 'middle';
  if (snap) { snapMarker(c, s, snap.type, theme.snap); c.fillStyle = theme.snap; c.fillText(SNAP_LABEL[snap.type], s.x + 12, s.y + 22); }
  // dynamic input: boxed text near the cursor
  const lines = dyn || [];
  if (lines.length) {
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + 10, h = lines.length * 15 + 6;
    let bx = s.x + 22, by = s.y - 16 - h; if (bx + w > vp.w) bx = s.x - 22 - w; if (by < 2) by = s.y + 34;
    c.globalAlpha = 0.85; c.fillStyle = theme.bg; c.fillRect(bx, by, w, h); c.globalAlpha = 1;
    c.strokeStyle = theme.cur; c.strokeRect(bx + 0.5, by + 0.5, w, h);
    c.fillStyle = theme.cur; lines.forEach((l, i) => c.fillText(l, bx + 5, by + 11 + i * 15));
  }
}
