// Pure geometry (world units = millimetres, Y up, angles in radians CCW). No DOM access.
export const EPS = 1e-7;
export const TAU = Math.PI * 2;
const clean = v => (Math.abs(v) < 1e-10 ? 0 : v);
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const toRad = d => (d * Math.PI) / 180;
export const toDeg = r => (r * 180) / Math.PI;
export const polar = (p, d, a) => ({ x: clean(p.x + d * Math.cos(a)), y: clean(p.y + d * Math.sin(a)) });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = v => Math.hypot(v.x, v.y);
export const unit = v => { const l = len(v); return { x: v.x / l, y: v.y / l }; };
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const norm2pi = a => { a %= TAU; if (a < 0) a += TAU; return a >= TAU - 1e-15 ? 0 : a; };
export const normPi = a => norm2pi(a + Math.PI) - Math.PI;

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < EPS * EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// ---- arcs (entity arcs are always CCW from start to end) ----
export const arcSweep = e => { const s = norm2pi(e.end - e.start); return s < 1e-12 ? TAU : s; };
export const arcPoint = (e, a) => ({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) });
export const angleInArc = (a, start, sweep, tol = 1e-9) => { const d = norm2pi(a - start); return d <= sweep + tol || d >= TAU - tol; };

// Polyline bulge segment a->b  =>  {c, r, a0 (angle of a), sweep (signed, + = CCW)}
export function bulgeArc(a, b, bulge) {
  const th = 4 * Math.atan(bulge), L = dist(a, b);
  const r = L / (2 * Math.sin(Math.abs(th) / 2)), h = (L / 2) / Math.tan(th / 2);
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  const c = { x: (a.x + b.x) / 2 + n.x * h, y: (a.y + b.y) / 2 + n.y * h };
  return { c, r, a0: angleOf(c, a), sweep: th };
}
export const arcGeom = (c, r, a0, sweep) => ({ type: 'arc', center: { ...c }, radius: r, start: norm2pi(a0), end: norm2pi(a0 + sweep) });

// Three-point arc through p1, p2, p3. Returns arc geometry or null if collinear.
export function arc3(p1, p2, p3) {
  const ab = sub(p2, p1), bc = sub(p3, p2);
  if (Math.abs(cross(ab, bc)) < 1e-9 * len(ab) * len(bc) || len(ab) < EPS || len(bc) < EPS) return null;
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  const s1 = p1.x * p1.x + p1.y * p1.y, s2 = p2.x * p2.x + p2.y * p2.y, s3 = p3.x * p3.x + p3.y * p3.y;
  const c = { x: (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d,
              y: (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d };
  const r = dist(c, p1), ccw = cross(ab, bc) > 0;
  return { type: 'arc', center: c, radius: r, start: norm2pi(angleOf(c, ccw ? p1 : p3)), end: norm2pi(angleOf(c, ccw ? p3 : p1)) };
}

// ---- ellipse: center, major (half-axis vector), ratio = minor/major, params start..end ----
export const ellipsePoint = (e, t) => {
  const M = e.major, P = { x: -M.y * e.ratio, y: M.x * e.ratio };
  return { x: e.center.x + M.x * Math.cos(t) + P.x * Math.sin(t), y: e.center.y + M.y * Math.cos(t) + P.y * Math.sin(t) };
};
export function ellipseFromAxis(center, M, d) {       // d = half-length of the other axis
  const L = len(M);
  return d <= L ? { type: 'ellipse', center, major: M, ratio: d / L, start: 0, end: TAU }
    : { type: 'ellipse', center, major: { x: -M.y * d / L, y: M.x * d / L }, ratio: L / d, start: 0, end: TAU };
}

// ---- tessellation (used for drawing, picking, box-select and ellipse intersections) ----
const segCount = (r, sweep, tol) => {
  const da = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI / 4;
  return Math.min(720, Math.max(2, Math.ceil(sweep / da)));
};
const arcPts = (c, r, a0, sweep, tol) => {
  const n = segCount(r, Math.abs(sweep), tol), out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n; out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
  return out;
};
export function tessellate(e, tol = 0.05) {
  switch (e.type) {
    case 'line': return [e.p1, e.p2];
    case 'circle': return arcPts(e.center, e.radius, 0, TAU, tol);
    case 'arc': return arcPts(e.center, e.radius, e.start, arcSweep(e), tol);
    case 'ellipse': {
      let sw = e.end - e.start; if (sw <= 0) sw += TAU;
      const n = segCount(Math.max(len(e.major), len(e.major) * e.ratio), sw, tol), out = [];
      for (let i = 0; i <= n; i++) out.push(ellipsePoint(e, e.start + (sw * i) / n));
      return out;
    }
    case 'polyline': {
      const V = e.vertices, n = V.length, cnt = e.closed ? n : n - 1, out = [V[0]];
      for (let i = 0; i < cnt; i++) {
        const a = V[i], b = V[(i + 1) % n], bl = a.bulge || 0;
        if (Math.abs(bl) < 1e-12) out.push(b);
        else {
          const g = bulgeArc(a, b, bl), pts = arcPts(g.c, g.r, g.a0, g.sweep, tol);
          for (let k = 1; k < pts.length - 1; k++) out.push(pts[k]);
          out.push(b);
        }
      }
      return out;
    }
  }
  return [];
}
export function segmentsOf(e) {
  const p = tessellate(e), s = [];
  for (let i = 0; i < p.length - 1; i++) s.push([p[i], p[i + 1]]);
  return s;
}
export function distToEntity(p, e) {
  if (e.type === 'circle') return Math.abs(dist(p, e.center) - e.radius);
  let m = Infinity;
  for (const [a, b] of segmentsOf(e)) m = Math.min(m, distToSegment(p, a, b));
  return m;
}
export function entityBBox(e) {
  if (e.type === 'circle') { const { center: c, radius: r } = e; return { minx: c.x - r, miny: c.y - r, maxx: c.x + r, maxy: c.y + r }; }
  const pts = tessellate(e);
  return { minx: Math.min(...pts.map(p => p.x)), miny: Math.min(...pts.map(p => p.y)),
           maxx: Math.max(...pts.map(p => p.x)), maxy: Math.max(...pts.map(p => p.y)) };
}
export const mergeBBox = (a, b) => !a ? b : {
  minx: Math.min(a.minx, b.minx), miny: Math.min(a.miny, b.miny), maxx: Math.max(a.maxx, b.maxx), maxy: Math.max(a.maxy, b.maxy) };

// ---- intersection primitives of an entity: {k:'seg',a,b} | {k:'arc',c,r,a0,sweep,full} ----
export function primsOf(e) {
  if (e.type === 'line') return [{ k: 'seg', a: e.p1, b: e.p2 }];
  if (e.type === 'circle') return [{ k: 'arc', c: e.center, r: e.radius, a0: 0, sweep: TAU, full: true }];
  if (e.type === 'arc') return [{ k: 'arc', c: e.center, r: e.radius, a0: e.start, sweep: arcSweep(e) }];
  if (e.type === 'polyline') {
    const V = e.vertices, n = V.length, cnt = e.closed ? n : n - 1, out = [];
    for (let i = 0; i < cnt; i++) {
      const a = V[i], b = V[(i + 1) % n], bl = a.bulge || 0;
      if (Math.abs(bl) < 1e-12) out.push({ k: 'seg', a, b });
      else { const g = bulgeArc(a, b, bl); out.push(g.sweep > 0 ? { k: 'arc', c: g.c, r: g.r, a0: g.a0, sweep: g.sweep } : { k: 'arc', c: g.c, r: g.r, a0: angleOf(g.c, b), sweep: -g.sweep }); }
    }
    return out;
  }
  return segmentsOf(e).map(([a, b]) => ({ k: 'seg', a, b }));   // ellipse: approximated
}

// ---- affine transforms: x' = a x + c y + e ; y' = b x + d y + f ----
export const M = {
  translate: (dx, dy) => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }),
  rotate: (ang, o) => { const cs = Math.cos(ang), sn = Math.sin(ang); return { a: cs, b: sn, c: -sn, d: cs, e: o.x - (cs * o.x - sn * o.y), f: o.y - (sn * o.x + cs * o.y) }; },
  scale: (k, o) => ({ a: k, b: 0, c: 0, d: k, e: o.x * (1 - k), f: o.y * (1 - k) }),
  mirror: (p1, p2) => {
    const phi = angleOf(p1, p2), a = Math.cos(2 * phi), b = Math.sin(2 * phi);
    return { a, b, c: b, d: -a, e: p1.x - (a * p1.x + b * p1.y), f: p1.y - (b * p1.x - a * p1.y) };
  },
};
export const applyPt = (m, p) => ({ x: clean(m.a * p.x + m.c * p.y + m.e), y: clean(m.b * p.x + m.d * p.y + m.f) });
export const applyVec = (m, v) => ({ x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y });
export const det = m => m.a * m.d - m.b * m.c;

export function xformEntity(e, m) {
  const r = structuredClone(e), s = Math.sqrt(Math.abs(det(m))), refl = det(m) < 0;
  switch (e.type) {
    case 'line': r.p1 = applyPt(m, e.p1); r.p2 = applyPt(m, e.p2); break;
    case 'circle': r.center = applyPt(m, e.center); r.radius = e.radius * s; break;
    case 'arc': {
      const c = applyPt(m, e.center), a = applyPt(m, arcPoint(e, e.start)), b = applyPt(m, arcPoint(e, e.end));
      r.center = c; r.radius = e.radius * s;
      r.start = norm2pi(angleOf(c, refl ? b : a)); r.end = norm2pi(angleOf(c, refl ? a : b)); break;
    }
    case 'ellipse':
      r.center = applyPt(m, e.center); r.major = applyVec(m, e.major);
      if (refl) { r.start = -e.end; r.end = -e.start; }
      break;
    case 'polyline': r.vertices = e.vertices.map(v => ({ ...applyPt(m, v), bulge: refl ? -(v.bulge || 0) : (v.bulge || 0) })); break;
  }
  return r;
}
