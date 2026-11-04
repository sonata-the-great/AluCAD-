import { distToEntity, tessellate } from './geometry.js';
import { segSeg } from './intersections.js';

const usable = (doc, e) => { const L = doc.layers.find(l => l.id === e.layerId); return !L || (L.visible && !L.locked); };
export const selectableIds = doc => doc.order.filter(id => usable(doc, doc.entities.get(id)));

// Topmost usable entity within `tol` world units of p.
export function pickEntity(doc, p, tol) {
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const e = doc.entities.get(doc.order[i]);
    if (usable(doc, e) && distToEntity(p, e) <= tol) return e.id;
  }
  return null;
}

// AutoCAD rule: a -> b going RIGHT = Window (fully inside), going LEFT = Crossing (touches).
export function boxSelect(doc, a, b) {
  const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x), miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
  const crossing = b.x < a.x, inside = p => p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
  const edges = [[{ x: minx, y: miny }, { x: maxx, y: miny }], [{ x: maxx, y: miny }, { x: maxx, y: maxy }],
                 [{ x: maxx, y: maxy }, { x: minx, y: maxy }], [{ x: minx, y: maxy }, { x: minx, y: miny }]];
  const ids = [];
  for (const id of selectableIds(doc)) {
    const pts = tessellate(doc.entities.get(id));
    if (!crossing) { if (pts.every(inside)) ids.push(id); continue; }
    let hit = pts.some(inside);
    for (let i = 0; !hit && i < pts.length - 1; i++)
      for (const [c, d] of edges) if (segSeg(pts[i], pts[i + 1], c, d).length) { hit = true; break; }
    if (hit) ids.push(id);
  }
  return ids;
}
