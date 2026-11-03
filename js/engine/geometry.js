// Pure geometry (world units = millimetres). No DOM access.
export const EPS = 1e-7;
const clean = v => (Math.abs(v) < 1e-10 ? 0 : v);
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const toRad = d => (d * Math.PI) / 180;
export const toDeg = r => (r * 180) / Math.PI;
export const polar = (p, d, a) => ({ x: clean(p.x + d * Math.cos(a)), y: clean(p.y + d * Math.sin(a)) });

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < EPS * EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function segmentsOf(e) {
  if (e.type === 'line') return [[e.p1, e.p2]];
  if (e.type === 'polyline') {
    const v = e.vertices, s = [];
    for (let i = 0; i < v.length - 1; i++) s.push([v[i], v[i + 1]]);
    if (e.closed && v.length > 2) s.push([v[v.length - 1], v[0]]);
    return s;
  }
  return [];
}

export function distToEntity(p, e) {
  if (e.type === 'circle') return Math.abs(dist(p, e.center) - e.radius);
  let m = Infinity;
  for (const [a, b] of segmentsOf(e)) m = Math.min(m, distToSegment(p, a, b));
  return m;
}

export function entityBBox(e) {
  if (e.type === 'circle') {
    const { center: c, radius: r } = e;
    return { minx: c.x - r, miny: c.y - r, maxx: c.x + r, maxy: c.y + r };
  }
  const pts = e.type === 'line' ? [e.p1, e.p2] : e.vertices;
  return {
    minx: Math.min(...pts.map(p => p.x)), miny: Math.min(...pts.map(p => p.y)),
    maxx: Math.max(...pts.map(p => p.x)), maxy: Math.max(...pts.map(p => p.y)),
  };
}
export const mergeBBox = (a, b) => !a ? b : {
  minx: Math.min(a.minx, b.minx), miny: Math.min(a.miny, b.miny),
  maxx: Math.max(a.maxx, b.maxx), maxy: Math.max(a.maxy, b.maxy),
};
