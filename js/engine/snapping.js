import { dist, angleOf, TAU, norm2pi, arcPoint, arcSweep, angleInArc, bulgeArc, primsOf, entityBBox, ellipsePoint, sub, dot } from './geometry.js';
import { intersect } from './intersections.js';
import { selectableIds } from './selection.js';

export const SNAP_TYPES = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'perpendicular', 'tangent', 'nearest'];
export const DEFAULT_OSNAP = { endpoint: true, midpoint: true, center: true, quadrant: true, intersection: true, perpendicular: true, tangent: false, nearest: false };
const PRI = Object.fromEntries(SNAP_TYPES.map((t, i) => [t, i]));

const cache = new WeakMap();   // entities are replaced (never mutated) on edit, so this is safe
const info = e => { let i = cache.get(e); if (!i) { i = { bbox: entityBBox(e), prims: primsOf(e) }; cache.set(e, i); } return i; };

function staticPoints(e, push) {
  switch (e.type) {
    case 'line': push(e.p1, 'endpoint'); push(e.p2, 'endpoint'); push({ x: (e.p1.x + e.p2.x) / 2, y: (e.p1.y + e.p2.y) / 2 }, 'midpoint'); break;
    case 'circle': push(e.center, 'center'); for (let k = 0; k < 4; k++) push(arcPoint(e, k * Math.PI / 2), 'quadrant'); break;
    case 'arc': {
      const sw = arcSweep(e);
      push(arcPoint(e, e.start), 'endpoint'); push(arcPoint(e, e.end), 'endpoint'); push(arcPoint(e, e.start + sw / 2), 'midpoint'); push(e.center, 'center');
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; if (angleInArc(a, e.start, sw)) push(arcPoint(e, a), 'quadrant'); }
      break;
    }
    case 'ellipse':
      push(e.center, 'center');
      if (Math.abs(e.end - e.start - TAU) < 1e-9) for (let k = 0; k < 4; k++) push(ellipsePoint(e, k * Math.PI / 2), 'quadrant');
      else { push(ellipsePoint(e, e.start), 'endpoint'); push(ellipsePoint(e, e.end), 'endpoint'); }
      break;
    case 'polyline': {
      const V = e.vertices, n = V.length, cnt = e.closed ? n : n - 1;
      V.forEach(v => push(v, 'endpoint'));
      for (let i = 0; i < cnt; i++) {
        const a = V[i], b = V[(i + 1) % n], bl = a.bulge || 0;
        if (Math.abs(bl) < 1e-12) push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint');
        else { const g = bulgeArc(a, b, bl); push({ x: g.c.x + g.r * Math.cos(g.a0 + g.sweep / 2), y: g.c.y + g.r * Math.sin(g.a0 + g.sweep / 2) }, 'midpoint'); }
      }
    }
  }
}
const onArc = (P, a) => P.full || angleInArc(a, P.a0, P.sweep);
const at = (P, a) => ({ x: P.c.x + P.r * Math.cos(a), y: P.c.y + P.r * Math.sin(a) });
function segParam(P, p) { const d = sub(P.b, P.a); return dot(sub(p, P.a), d) / dot(d, d); }
function primNearest(P, p) {
  if (P.k === 'seg') { const t = Math.max(0, Math.min(1, segParam(P, p))); return { x: P.a.x + t * (P.b.x - P.a.x), y: P.a.y + t * (P.b.y - P.a.y) }; }
  const a = angleOf(P.c, p);
  if (onArc(P, a)) return at(P, a);
  const s = at(P, P.a0), e = at(P, P.a0 + P.sweep);
  return dist(p, s) < dist(p, e) ? s : e;
}
function primFeet(P, base) {   // feet of perpendiculars from base
  if (P.k === 'seg') { const t = segParam(P, base); return t >= 0 && t <= 1 ? [{ x: P.a.x + t * (P.b.x - P.a.x), y: P.a.y + t * (P.b.y - P.a.y) }] : []; }
  const a = angleOf(P.c, base);
  return [a, a + Math.PI].filter(x => onArc(P, x)).map(x => at(P, x));
}
function primTangents(P, base) {   // tangent points from base to an arc/circle
  if (P.k !== 'arc') return [];
  const d = dist(base, P.c); if (d <= P.r + 1e-9) return [];
  const a = angleOf(P.c, base), al = Math.acos(P.r / d);
  return [a + al, a - al].filter(x => onArc(P, x)).map(x => at(P, x));
}

// Best object-snap near p (world coords). tol in world units. base = previous point (for perpendicular/tangent).
// Closest candidate wins; ties go to the type priority order; 'nearest' is only used if nothing else qualifies.
export function findSnap(doc, p, tol, modes, base = null) {
  const cands = [], push = (pt, type) => { if (!modes[type]) return; const d = dist(p, pt); if (d <= tol) cands.push({ x: pt.x, y: pt.y, type, d }); };
  const nearInfos = [];
  for (const id of selectableIds(doc)) {
    const e = doc.entities.get(id), inf = info(e), b = inf.bbox;
    staticPoints(e, push);
    if (p.x < b.minx - tol || p.x > b.maxx + tol || p.y < b.miny - tol || p.y > b.maxy + tol) continue;
    let touching = false;
    for (const P of inf.prims) {
      const np = primNearest(P, p);
      if (dist(np, p) <= tol) touching = true;
      if (modes.nearest) push(np, 'nearest');
      if (base && modes.perpendicular) primFeet(P, base).forEach(q => push(q, 'perpendicular'));
      if (base && modes.tangent) primTangents(P, base).forEach(q => push(q, 'tangent'));
    }
    if (touching && modes.intersection) nearInfos.push(inf);
  }
  for (let i = 0; i < nearInfos.length; i++) for (let j = i + 1; j < nearInfos.length; j++)
    for (const P of nearInfos[i].prims) for (const Q of nearInfos[j].prims) intersect(P, Q).forEach(q => push(q, 'intersection'));
  const real = cands.filter(c => c.type !== 'nearest'), pool = real.length ? real : cands;
  pool.sort((a, b) => (Math.abs(a.d - b.d) < 1e-9 ? PRI[a.type] - PRI[b.type] : a.d - b.d));
  return pool[0] || null;
}
