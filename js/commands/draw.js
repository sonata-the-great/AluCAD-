import { ask } from './command-manager.js';
import { def } from './common.js';
import { makeLine, makeRect, makeCircle } from '../document/entities.js';
import { dist, EPS, TAU, angleOf, normPi, arc3, ellipseFromAxis, lerp, sub, len, unit, cross } from '../engine/geometry.js';

export const LINE = def('LINE', ['L'], 'Draw', 'Draw straight line segments', function* (ctx) {
  let p1 = yield ask.point('LINE  Specify first point:');
  while (true) {
    const p2 = yield ask.point('LINE  Specify next point (type length, x,y, @dx,dy or @d<a; Enter to finish):',
      { base: p1, allowEnd: true, preview: p => [makeLine(p1, p)] });
    if (!p2) return;
    if (dist(p1, p2) < EPS) { ctx.say('Zero-length segment ignored.'); continue; }
    ctx.doc.commit([{ op: 'add', entity: makeLine(p1, p2) }], 'LINE');
    p1 = p2;
  }
});

export const RECTANGLE = def('RECTANGLE', ['REC'], 'Draw', 'Draw a rectangle from two corners', function* (ctx) {
  const a = yield ask.point('RECTANGLE  Specify first corner:');
  while (true) {
    const b = yield ask.point('RECTANGLE  Specify opposite corner (type width,height or click):',
      { base: a, dimensions: true, preview: p => [makeRect(a, p)] });
    if (Math.abs(b.x - a.x) < EPS || Math.abs(b.y - a.y) < EPS) { ctx.say('Width and height must be non-zero.'); continue; }
    ctx.doc.commit([{ op: 'add', entity: makeRect(a, b) }], 'RECTANGLE');
    return;
  }
});

export const CIRCLE = def('CIRCLE', ['C'], 'Draw', 'Draw a circle from center and radius', function* (ctx) {
  const c = yield ask.point('CIRCLE  Specify center point:');
  const r = yield ask.number('CIRCLE  Specify radius (type value or click):',
    { base: c, positive: true, label: 'Radius', preview: r => [makeCircle(c, r)] });
  ctx.doc.commit([{ op: 'add', entity: makeCircle(c, r) }], 'CIRCLE');
});

// bulge of a tangent-continuing arc from a to b when the path arrives with direction `tan`
const tangentBulge = (a, b, tan) => { const al = normPi(angleOf(a, b) - tan); return { al, bulge: Math.tan(al / 2) }; };

export const POLYLINE = def('POLYLINE', ['PL'], 'Draw', 'Draw connected line and arc segments as one object', function* (ctx) {
  const start = yield ask.point('POLYLINE  Specify start point:');
  const V = [{ x: start.x, y: start.y, bulge: 0 }];
  let mode = 'line', tangent = 0, closed = false;
  const shape = (p, bulge) => {
    const vs = V.map(v => ({ ...v })); vs[vs.length - 1].bulge = bulge; vs.push({ x: p.x, y: p.y, bulge: 0 });
    return { type: 'polyline', closed: false, vertices: vs };
  };
  while (true) {
    const last = V[V.length - 1];
    const r = yield ask.point(`POLYLINE  Specify next point [${mode === 'line' ? 'Arc' : 'Line'}/Close] (Enter to finish):`,
      { base: last, allowEnd: true, keywords: [mode === 'line' ? 'Arc' : 'Line', 'Close'],
        preview: p => [shape(p, mode === 'arc' ? tangentBulge(last, p, tangent).bulge : 0)] });
    if (!r) break;
    if (r.keyword === 'Arc') { mode = 'arc'; continue; }
    if (r.keyword === 'Line') { mode = 'line'; continue; }
    if (r.keyword === 'Close') {
      if (dist(last, start) > EPS) last.bulge = mode === 'arc' ? tangentBulge(last, start, tangent).bulge : 0;
      closed = true; break;
    }
    if (dist(last, r) < EPS) { ctx.say('Zero-length segment ignored.'); continue; }
    if (mode === 'arc') {
      const { al, bulge } = tangentBulge(last, r, tangent);
      if (Math.abs(al) > Math.PI - 1e-3) { ctx.say('Cannot draw an arc back along the tangent.'); continue; }
      last.bulge = bulge; tangent += 2 * al;
    } else { last.bulge = 0; tangent = angleOf(last, r); }
    V.push({ x: r.x, y: r.y, bulge: 0 });
  }
  if (V.length < 2) return;
  ctx.doc.commit([{ op: 'add', entity: { type: 'polyline', closed, vertices: V } }], 'POLYLINE');
});

export const ARC = def('ARC', ['A'], 'Draw', 'Draw an arc through three points', function* (ctx) {
  const p1 = yield ask.point('ARC  Specify start point:');
  const p2 = yield ask.point('ARC  Specify second point on the arc:', { base: p1, preview: p => [makeLine(p1, p)] });
  while (true) {
    const p3 = yield ask.point('ARC  Specify end point:', { base: p2,
      preview: p => { const a = arc3(p1, p2, p); return a ? [a] : [makeLine(p1, p2), makeLine(p2, p)]; } });
    const a = arc3(p1, p2, p3);
    if (!a) { ctx.say('The three points are collinear or coincident.'); continue; }
    ctx.doc.commit([{ op: 'add', entity: a }], 'ARC');
    return;
  }
});

export const ELLIPSE = def('ELLIPSE', ['EL'], 'Draw', 'Draw an ellipse from an axis and the other half-axis', function* (ctx) {
  const a = yield ask.point('ELLIPSE  Specify axis start point:');
  let b;
  while (true) {
    b = yield ask.point('ELLIPSE  Specify axis end point:', { base: a, preview: p => [makeLine(a, p)] });
    if (dist(a, b) >= EPS) break;
    ctx.say('Axis endpoints must differ.');
  }
  const mid = lerp(a, b, 0.5), M = sub(b, mid), u = unit(M);
  const d = yield ask.number('ELLIPSE  Specify distance to other axis (type value or click):', {
    base: mid, positive: true, label: 'Axis', fromPoint: p => Math.abs(cross(u, sub(p, mid))),
    preview: d => [ellipseFromAxis(mid, M, d)] });
  ctx.doc.commit([{ op: 'add', entity: ellipseFromAxis(mid, M, d) }], 'ELLIPSE');
});
