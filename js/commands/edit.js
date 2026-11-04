import { ask } from './command-manager.js';
import { def, selectObjects } from './common.js';
import { M, xformEntity, angleOf, dist, toRad, toDeg, EPS } from '../engine/geometry.js';

const modifyOps = (doc, ids, m) => ids.map(id => { const before = doc.entities.get(id); return { op: 'modify', id, before, after: xformEntity(before, m) }; });
const copyOps = (doc, ids, m) => ids.map(id => { const c = xformEntity(doc.entities.get(id), m); delete c.id; return { op: 'add', entity: c }; });
const previews = (doc, ids, m) => ids.map(id => xformEntity(doc.entities.get(id), m));
const SEL = 'Select objects (click, drag right=window, left=crossing, ALL; Enter to finish):';

export const MOVE = def('MOVE', ['M'], 'Edit', 'Move objects', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'MOVE  ' + SEL); if (!ids.length) return;
  const base = yield ask.point('MOVE  Specify base point:');
  const p = yield ask.point('MOVE  Specify second point (or type distance / @dx,dy):',
    { base, preview: p => previews(doc, ids, M.translate(p.x - base.x, p.y - base.y)) });
  doc.commit(modifyOps(doc, ids, M.translate(p.x - base.x, p.y - base.y)), 'MOVE'); doc.deselectAll();
});

export const COPY = def('COPY', ['CO'], 'Edit', 'Copy objects (repeat until Enter)', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'COPY  ' + SEL); if (!ids.length) return;
  const base = yield ask.point('COPY  Specify base point:');
  while (true) {
    const p = yield ask.point('COPY  Specify second point (Enter to finish):',
      { base, allowEnd: true, preview: p => previews(doc, ids, M.translate(p.x - base.x, p.y - base.y)) });
    if (!p) break;
    doc.commit(copyOps(doc, ids, M.translate(p.x - base.x, p.y - base.y)), 'COPY');
  }
  doc.deselectAll();
});

export const ROTATE = def('ROTATE', ['RO'], 'Edit', 'Rotate objects about a base point', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'ROTATE  ' + SEL); if (!ids.length) return;
  const base = yield ask.point('ROTATE  Specify base point:');
  const a = yield ask.number('ROTATE  Specify rotation angle in degrees (type value or click):', {
    base, kind: 'angle', label: 'Angle', fromPoint: p => toDeg(angleOf(base, p)), preview: a => previews(doc, ids, M.rotate(toRad(a), base)) });
  doc.commit(modifyOps(doc, ids, M.rotate(toRad(a), base)), 'ROTATE'); doc.deselectAll();
});

export const MIRROR = def('MIRROR', ['MI'], 'Edit', 'Mirror objects about a line', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'MIRROR  ' + SEL); if (!ids.length) return;
  const a = yield ask.point('MIRROR  Specify first point of mirror line:');
  let b;
  while (true) {
    b = yield ask.point('MIRROR  Specify second point of mirror line:',
      { base: a, preview: p => (dist(a, p) > EPS ? previews(doc, ids, M.mirror(a, p)) : []) });
    if (dist(a, b) > EPS) break;
    ctx.say('Mirror line points must differ.');
  }
  const r = yield ask.keyword('MIRROR  Delete source objects? [Yes/No] <No>:', { keywords: ['Yes', 'No'], allowEnd: true });
  const m = M.mirror(a, b);
  const ops = r && r.keyword === 'Yes' ? modifyOps(doc, ids, m) : copyOps(doc, ids, m);
  doc.commit(ops, 'MIRROR'); doc.deselectAll();
});

export const SCALE = def('SCALE', ['SC'], 'Edit', 'Scale objects about a base point', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'SCALE  ' + SEL); if (!ids.length) return;
  const base = yield ask.point('SCALE  Specify base point:');
  const k = yield ask.number('SCALE  Specify scale factor (type a value):', {
    base, positive: true, kind: 'factor', label: 'Scale', fromPoint: () => null, preview: k => previews(doc, ids, M.scale(k, base)) });
  doc.commit(modifyOps(doc, ids, M.scale(k, base)), 'SCALE'); doc.deselectAll();
});
