// Pure modify algorithms. Each returns {error} or a result; commands turn results into transactions.
import { EPS, TAU, dist, angleOf, sub, add, mul, dot, len, unit, lerp, norm2pi, normPi, distToSegment,
  arcSweep, arcPoint, arcGeom, bulgeArc, primsOf } from './geometry.js';
import { intersect, lineLine } from './intersections.js';

const lineGeom = (p1, p2) => ({ type: 'line', p1: { ...p1 }, p2: { ...p2 } });
const par = (a, b, p) => { const d = sub(b, a); return dot(sub(p, a), d) / dot(d, d); };
const near = (a, b, t = 1e-4) => dist(a, b) < t;
const noSupport = (op, e) => ({ error: e.type === 'polyline' ? `${op}: EXPLODE the polyline first.` : `${op} does not support ${e.type} yet.` });

// ---------- OFFSET ----------
export function offsetEntity(e, d, side) {
  if (e.type === 'line') {
    const v = sub(e.p2, e.p1), L = len(v);
    if (L < EPS) return { error: 'Zero-length line.' };
    const n = { x: -v.y / L, y: v.x / L }, o = mul(n, dot(sub(side, e.p1), n) >= 0 ? d : -d);
    return { entity: lineGeom(add(e.p1, o), add(e.p2, o)) };
  }
  if (e.type === 'circle' || e.type === 'arc') {
    const r = dist(side, e.center) < e.radius ? e.radius - d : e.radius + d;
    if (r <= EPS) return { error: 'Offset distance too large.' };
    return { entity: e.type === 'circle' ? { type: 'circle', center: { ...e.center }, radius: r }
      : { type: 'arc', center: { ...e.center }, radius: r, start: e.start, end: e.end } };
  }
  if (e.type === 'polyline') {
    if (e.vertices.some(v => Math.abs(v.bulge || 0) > 1e-12)) return { error: 'OFFSET of polylines with arc segments is not supported yet.' };
    const V = e.vertices, n = V.length, cnt = e.closed ? n : n - 1, segs = [];
    for (let i = 0; i < cnt; i++) {
      const a = V[i], b = V[(i + 1) % n], v = sub(b, a), L = len(v);
      if (L < EPS) return { error: 'Polyline has a zero-length segment.' };
      segs.push({ a, b, dir: v, n: { x: -v.y / L, y: v.x / L } });
    }
    let best = Infinity, sg = 1;
    for (const s of segs) { const dd = distToSegment(side, s.a, s.b); if (dd < best) { best = dd; sg = dot(sub(side, s.a), s.n) >= 0 ? 1 : -1; } }
    const off = segs.map(s => ({ a: add(s.a, mul(s.n, d * sg)), b: add(s.b, mul(s.n, d * sg)) }));
    const meet = (s1, s2) => lineLine(s1.a, s1.b, s2.a, s2.b) || s1.b, out = [];
    if (e.closed) for (let i = 0; i < n; i++) out.push(meet(off[(i - 1 + n) % n], off[i]));
    else { out.push(off[0].a); for (let i = 1; i < n - 1; i++) out.push(meet(off[i - 1], off[i])); out.push(off[n - 2].b); }
    for (let i = 0; i < cnt; i++) if (dot(sub(out[(i + 1) % n], out[i]), segs[i].dir) <= 0) return { error: 'Offset distance too large for this shape.' };
    return { entity: { type: 'polyline', closed: e.closed, rect: e.rect, vertices: out.map(p => ({ x: p.x, y: p.y, bulge: 0 })) } };
  }
  return noSupport('OFFSET', e);
}

// ---------- TRIM ----------
export function trimEntity(e, prims, pick) {
  if (e.type === 'line') {
    const { p1: a, p2: b } = e, P = { k: 'seg', a, b };
    const ts = prims.flatMap(q => intersect(P, q).map(p => par(a, b, p))), tp = par(a, b, pick);
    const lo = Math.max(-Infinity, ...ts.filter(t => t < tp - 1e-9)), hi = Math.min(Infinity, ...ts.filter(t => t > tp + 1e-9));
    if (lo === -Infinity && hi === Infinity) return { error: 'No cutting edge crosses this object.' };
    const pieces = [];
    if (lo !== -Infinity && lo > 1e-9) pieces.push(lineGeom(a, lerp(a, b, lo)));
    if (hi !== Infinity && hi < 1 - 1e-9) pieces.push(lineGeom(lerp(a, b, hi), b));
    return { pieces };
  }
  if (e.type === 'arc' || e.type === 'circle') {
    const c = e.center, st = e.type === 'arc' ? e.start : 0, sw = e.type === 'arc' ? arcSweep(e) : TAU;
    const P = primsOf(e)[0], rel = p => norm2pi(angleOf(c, p) - st), sp = rel(pick);
    let ts = prims.flatMap(q => intersect(P, q).map(rel)).sort((x, y) => x - y);
    ts = ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-9);
    if (e.type === 'circle') {
      if (ts.length < 2) return { error: 'A circle needs at least two crossing points to trim.' };
      const lo = Math.max(-Infinity, ...ts.filter(t => t < sp)), hi = Math.min(Infinity, ...ts.filter(t => t > sp));
      const a = hi === Infinity ? ts[0] : hi, b = lo === -Infinity ? ts[ts.length - 1] : lo;   // wrap around
      return { pieces: [arcGeom(c, e.radius, a, norm2pi(b - a) || TAU)] };
    }
    const lo = Math.max(-Infinity, ...ts.filter(t => t < sp - 1e-9)), hi = Math.min(Infinity, ...ts.filter(t => t > sp + 1e-9));
    if (lo === -Infinity && hi === Infinity) return { error: 'No cutting edge crosses this object.' };
    const pieces = [];
    if (lo !== -Infinity && lo > 1e-9) pieces.push(arcGeom(c, e.radius, st, lo));
    if (hi !== Infinity && hi < sw - 1e-9) pieces.push(arcGeom(c, e.radius, st + hi, sw - hi));
    return { pieces };
  }
  return noSupport('TRIM', e);
}

// ---------- EXTEND ----------
export function extendEntity(e, prims, pick) {
  if (e.type === 'line') {
    const { p1: a, p2: b } = e, P = { k: 'seg', a, b };
    const ts = prims.flatMap(q => intersect(P, q, { ext: true }).map(p => par(a, b, p)));
    if (par(a, b, pick) >= 0.5) {
      const t = Math.min(Infinity, ...ts.filter(t => t > 1 + 1e-9));
      return t === Infinity ? { error: 'No boundary found beyond that end.' } : { entity: lineGeom(a, lerp(a, b, t)) };
    }
    const t = Math.max(-Infinity, ...ts.filter(t => t < -1e-9));
    return t === -Infinity ? { error: 'No boundary found beyond that end.' } : { entity: lineGeom(lerp(a, b, t), b) };
  }
  if (e.type === 'arc') {
    const c = e.center, sw = arcSweep(e), P = primsOf(e)[0], rel = p => norm2pi(angleOf(c, p) - e.start);
    const ss = prims.flatMap(q => intersect(P, q, { ext: true }).map(rel)).filter(s => s > sw + 1e-9);
    if (!ss.length) return { error: 'No boundary found beyond that end.' };
    if (rel(pick) > sw / 2) { const s = Math.min(...ss); return { entity: arcGeom(c, e.radius, e.start, s) }; }
    const s = Math.max(...ss); return { entity: arcGeom(c, e.radius, e.start + s, TAU - s + sw) };
  }
  return e.type === 'circle' ? { error: 'A circle cannot be extended.' } : noSupport('EXTEND', e);
}

// ---------- FILLET / CHAMFER (line-line) ----------
function corner(l1, k1, l2, k2) {
  const X = lineLine(l1.p1, l1.p2, l2.p1, l2.p2);
  if (!X) return { error: 'Lines are parallel.' };
  const far = (l, k) => (par(l.p1, l.p2, k) >= par(l.p1, l.p2, X) ? l.p2 : l.p1);
  const f1 = far(l1, k1), f2 = far(l2, k2), L1 = dist(X, f1), L2 = dist(X, f2);
  if (L1 < EPS || L2 < EPS) return { error: 'The corner lies on a line end; pick the other side.' };
  const u1 = unit(sub(f1, X)), u2 = unit(sub(f2, X));
  return { X, f1, f2, L1, L2, u1, u2, phi: Math.acos(Math.max(-1, Math.min(1, dot(u1, u2)))) };
}
export function filletLines(l1, k1, l2, k2, R) {
  const c = corner(l1, k1, l2, k2); if (c.error) return c;
  if (R <= EPS) return { l1: lineGeom(c.f1, c.X), l2: lineGeom(c.f2, c.X), extra: null };
  if (c.phi < 1e-6 || c.phi > Math.PI - 1e-6) return { error: 'Lines are collinear.' };
  const T = R / Math.tan(c.phi / 2);
  if (T > c.L1 + EPS || T > c.L2 + EPS) return { error: 'Radius too large for these lines.' };
  const T1 = add(c.X, mul(c.u1, T)), T2 = add(c.X, mul(c.u2, T));
  const C = add(c.X, mul(unit(add(c.u1, c.u2)), R / Math.sin(c.phi / 2)));
  const a1 = angleOf(C, T1), sw = normPi(angleOf(C, T2) - a1);
  return { l1: lineGeom(c.f1, T1), l2: lineGeom(c.f2, T2), extra: sw > 0 ? arcGeom(C, R, a1, sw) : arcGeom(C, R, a1 + sw, -sw) };
}
export function chamferLines(l1, k1, l2, k2, d1, d2) {
  const c = corner(l1, k1, l2, k2); if (c.error) return c;
  if (d1 > c.L1 + EPS || d2 > c.L2 + EPS) return { error: 'Chamfer distance too large for these lines.' };
  const T1 = add(c.X, mul(c.u1, d1)), T2 = add(c.X, mul(c.u2, d2));
  return { l1: lineGeom(c.f1, T1), l2: lineGeom(c.f2, T2), extra: d1 + d2 > EPS ? lineGeom(T1, T2) : null };
}

// ---------- JOIN ----------
export function joinEntities(list) {
  const segs = [];
  for (const e of list) {
    if (e.type === 'line') segs.push({ a: e.p1, b: e.p2, bulge: 0, id: e.id });
    else if (e.type === 'arc') segs.push({ a: arcPoint(e, e.start), b: arcPoint(e, e.end), bulge: Math.tan(arcSweep(e) / 4), id: e.id });
    else if (e.type === 'polyline' && !e.closed) {
      for (let i = 0; i < e.vertices.length - 1; i++) segs.push({ a: e.vertices[i], b: e.vertices[i + 1], bulge: e.vertices[i].bulge || 0, id: e.id });
    }
  }
  const rev = s => ({ a: s.b, b: s.a, bulge: -s.bulge, id: s.id }), used = new Set(), polylines = [], consumed = new Set();
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    used.add(i); const chain = [segs[i]];
    for (let grew = true; grew;) {
      grew = false;
      const end = chain[chain.length - 1].b, start = chain[0].a;
      for (let j = 0; j < segs.length && !grew; j++) {
        if (used.has(j)) continue;
        const s = segs[j];
        if (near(s.a, end)) { chain.push(s); used.add(j); grew = true; }
        else if (near(s.b, end)) { chain.push(rev(s)); used.add(j); grew = true; }
        else if (near(s.b, start)) { chain.unshift(s); used.add(j); grew = true; }
        else if (near(s.a, start)) { chain.unshift(rev(s)); used.add(j); grew = true; }
      }
    }
    const ids = new Set(chain.map(s => s.id));
    if (ids.size < 2) continue;
    const closed = chain.length > 1 && near(chain[chain.length - 1].b, chain[0].a);
    const vertices = chain.map(s => ({ x: s.a.x, y: s.a.y, bulge: s.bulge }));
    if (!closed) { const l = chain[chain.length - 1].b; vertices.push({ x: l.x, y: l.y, bulge: 0 }); }
    polylines.push({ type: 'polyline', closed, vertices });
    ids.forEach(id => consumed.add(id));
  }
  return { polylines, consumed: [...consumed] };
}

// ---------- BREAK ----------
export function breakEntity(e, p1, p2) {
  if (e.type === 'line') {
    const { p1: a, p2: b } = e;
    let t1 = Math.max(0, Math.min(1, par(a, b, p1))), t2 = Math.max(0, Math.min(1, par(a, b, p2)));
    if (t1 > t2) [t1, t2] = [t2, t1];
    const pieces = [];
    if (t1 > 1e-9) pieces.push(lineGeom(a, lerp(a, b, t1)));
    if (t2 < 1 - 1e-9) pieces.push(lineGeom(lerp(a, b, t2), b));
    return { pieces };
  }
  if (e.type === 'arc') {
    const sw = arcSweep(e), rel = p => Math.max(0, Math.min(sw, norm2pi(angleOf(e.center, p) - e.start)));
    let s1 = rel(p1), s2 = rel(p2); if (s1 > s2) [s1, s2] = [s2, s1];
    const pieces = [];
    if (s1 > 1e-9) pieces.push(arcGeom(e.center, e.radius, e.start, s1));
    if (s2 < sw - 1e-9) pieces.push(arcGeom(e.center, e.radius, e.start + s2, sw - s2));
    return { pieces };
  }
  if (e.type === 'circle') {
    const a1 = angleOf(e.center, p1), a2 = angleOf(e.center, p2), gap = norm2pi(a2 - a1);
    if (gap < 1e-9) return { error: 'Break points must differ on a circle.' };
    return { pieces: [arcGeom(e.center, e.radius, a2, TAU - gap)] };   // removes CCW from first to second point
  }
  return noSupport('BREAK', e);
}

// ---------- EXPLODE ----------
export function explodeEntity(e) {
  if (e.type !== 'polyline') return { error: 'EXPLODE works on polylines only.' };
  const V = e.vertices, n = V.length, cnt = e.closed ? n : n - 1, out = [];
  for (let i = 0; i < cnt; i++) {
    const a = V[i], b = V[(i + 1) % n];
    if (Math.abs(a.bulge || 0) < 1e-12) out.push(lineGeom(a, b));
    else { const g = bulgeArc(a, b, a.bulge); out.push(g.sweep > 0 ? arcGeom(g.c, g.r, g.a0, g.sweep) : arcGeom(g.c, g.r, angleOf(g.c, b), -g.sweep)); }
  }
  return { pieces: out };
}
