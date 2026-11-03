import { distToEntity } from './geometry.js';
// Returns id of the topmost visible, unlocked entity within `tol` world units of p.
export function pickEntity(doc, p, tol) {
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const e = doc.entities.get(doc.order[i]);
    const L = doc.layers.find(l => l.id === e.layerId);
    if (L && (!L.visible || L.locked)) continue;
    if (distToEntity(p, e) <= tol) return e.id;
  }
  return null;
}
