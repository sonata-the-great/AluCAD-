import { ask } from './command-manager.js';
import { makeLine, makeRect, makeCircle } from '../document/entities.js';
import { dist, EPS } from '../engine/geometry.js';

const def = (name, aliases, category, description, run) => ({ name, aliases, category, description, status: 'available', run });

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
    { base: c, positive: true, preview: r => [makeCircle(c, r)] });
  ctx.doc.commit([{ op: 'add', entity: makeCircle(c, r) }], 'CIRCLE');
});
