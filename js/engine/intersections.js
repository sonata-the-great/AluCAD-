import { dist, angleOf, angleInArc, cross, sub, dot } from './geometry.js';

const TE = 1e-9;   // parameter tolerance
const arcFilter = (pts, A) => (A.full ? pts : pts.filter(p => angleInArc(angleOf(A.c, p), A.a0, A.sweep)));

// Infinite-line intersection (null when parallel).
export function lineLine(a, b, c, d) {
  const d1 = sub(b, a), d2 = sub(d, c), den = cross(d1, d2);
  if (Math.abs(den) < 1e-12 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return null;
  const t = cross(sub(c, a), d2) / den;
  return { x: a.x + t * d1.x, y: a.y + t * d1.y };
}
// Segment a-b with segment c-d. ext=true treats a-b as an infinite line.
export function segSeg(a, b, c, d, ext = false) {
  const d1 = sub(b, a), d2 = sub(d, c), den = cross(d1, d2);
  if (Math.abs(den) < 1e-12 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return [];
  const t = cross(sub(c, a), d2) / den, u = cross(sub(c, a), d1) / den;
  if ((!ext && (t < -TE || t > 1 + TE)) || u < -TE || u > 1 + TE) return [];
  return [{ x: a.x + t * d1.x, y: a.y + t * d1.y }];
}
export function segCircle(a, b, c, r, ext = false) {
  const d = sub(b, a), f = sub(a, c), A = dot(d, d), B = 2 * dot(d, f), C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < 0) { if (disc > -1e-9 * Math.max(1, B * B)) disc = 0; else return []; }
  const sq = Math.sqrt(disc), ts = disc === 0 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  return ts.filter(t => ext || (t >= -TE && t <= 1 + TE)).map(t => ({ x: a.x + t * d.x, y: a.y + t * d.y }));
}
export function circleCircle(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < 1e-9 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d, px = c1.x + a * ux, py = c1.y + a * uy;
  return h < 1e-9 ? [{ x: px, y: py }] : [{ x: px - h * uy, y: py + h * ux }, { x: px + h * uy, y: py - h * ux }];
}
// Intersect primitives P and Q. ext=true extends P to its infinite line / full circle.
export function intersect(P, Q, { ext = false } = {}) {
  if (P.k === 'seg' && Q.k === 'seg') return segSeg(P.a, P.b, Q.a, Q.b, ext);
  if (P.k === 'seg') return arcFilter(segCircle(P.a, P.b, Q.c, Q.r, ext), Q);
  if (Q.k === 'seg') { const pts = segCircle(Q.a, Q.b, P.c, P.r, false); return ext ? pts : arcFilter(pts, P); }
  const pts = circleCircle(P.c, P.r, Q.c, Q.r);
  return arcFilter(ext ? pts : arcFilter(pts, P), Q);
}
