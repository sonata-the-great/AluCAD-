import { ask } from './command-manager.js';
import { def, selectObjects, piecesOps } from './common.js';
import { retype } from '../document/entities.js';
import { primsOf } from '../engine/geometry.js';
import { offsetEntity, trimEntity, extendEntity, filletLines, chamferLines, joinEntities, breakEntity, explodeEntity } from '../engine/modify.js';

const edgePrims = (doc, edgeIds, selfId) => edgeIds.filter(i => i !== selfId && doc.entities.has(i)).flatMap(i => primsOf(doc.entities.get(i)));

export const OFFSET = def('OFFSET', ['O'], 'Modify', 'Offset lines, arcs, circles and straight polylines', function* (ctx) {
  const doc = ctx.doc, s = doc.settings;
  const d0 = yield ask.number(`OFFSET  Specify offset distance${s.offsetDist > 0 ? ` <${s.offsetDist}>` : ''}:`, { positive: true, allowEnd: true });
  const d = d0 ?? s.offsetDist;
  if (!(d > 0)) { ctx.say('An offset distance is required.'); return; }
  s.offsetDist = d;
  while (true) {
    const id = yield ask.entity('OFFSET  Select object to offset (Enter to finish):', { allowEnd: true });
    if (!id) return;
    const e = doc.entities.get(id);
    const side = yield ask.point('OFFSET  Specify point on the side to offset:', {
      preview: p => { const r = offsetEntity(e, d, p); return r.entity ? [r.entity] : []; } });
    const r = offsetEntity(e, d, side);
    if (r.error) { ctx.say(r.error); continue; }
    doc.commit([{ op: 'add', entity: retype(e, r.entity) }], 'OFFSET');
  }
});

function* trimOrExtend(ctx, name, fn) {
  const doc = ctx.doc;
  const edges = yield* selectObjects(ctx, `${name}  Select boundary objects (Enter = all objects):`, { pickfirst: false, allIfEmpty: true });
  while (true) {
    const id = yield ask.entity(`${name}  Select object (Enter to finish):`, { allowEnd: true });
    if (!id) break;
    const e = doc.entities.get(id), r = fn(e, edgePrims(doc, edges, id), ctx.lastPoint);
    if (r.error) { ctx.say(r.error); continue; }
    doc.commit(r.pieces ? piecesOps(e, r.pieces, retype)
      : [{ op: 'modify', id, before: e, after: { ...retype(e, r.entity), id } }], name);
  }
  doc.deselectAll();
}
export const TRIM = def('TRIM', ['TR'], 'Modify', 'Trim lines, arcs and circles at cutting edges', function* (ctx) { yield* trimOrExtend(ctx, 'TRIM', trimEntity); });
export const EXTEND = def('EXTEND', ['EX'], 'Modify', 'Extend lines and arcs to boundary edges', function* (ctx) { yield* trimOrExtend(ctx, 'EXTEND', extendEntity); });

function* cornerCommand(ctx, name, key, build) {
  const doc = ctx.doc, s = doc.settings;
  while (true) {
    const id1 = yield ask.entity(`${name}  Select first line [${key}] (Enter to finish):`, { allowEnd: true, keywords: [key] });
    if (!id1) return;
    if (id1.keyword) { yield* build.setup(ctx); continue; }
    const k1 = ctx.lastPoint, l1 = doc.entities.get(id1);
    const id2 = yield ask.entity(`${name}  Select second line:`);
    const l2 = doc.entities.get(id2), k2 = ctx.lastPoint;
    if (l1.type !== 'line' || l2.type !== 'line') { ctx.say(`${name} works on two lines in this version.`); continue; }
    if (id1 === id2) { ctx.say('Select two different lines.'); continue; }
    const r = build.run(l1, k1, l2, k2, s);
    if (r.error) { ctx.say(r.error); continue; }
    const ops = [{ op: 'modify', id: id1, before: l1, after: { ...retype(l1, r.l1), id: id1 } },
                 { op: 'modify', id: id2, before: l2, after: { ...retype(l2, r.l2), id: id2 } }];
    if (r.extra) ops.push({ op: 'add', entity: retype(l1, r.extra) });
    doc.commit(ops, name);
    return;
  }
}
export const FILLET = def('FILLET', ['F'], 'Modify', 'Round the corner between two lines (type R to set radius)', function* (ctx) {
  yield* cornerCommand(ctx, 'FILLET', 'Radius', {
    setup: function* (c) { c.doc.settings.filletRadius = yield ask.number(`FILLET  Specify radius <${c.doc.settings.filletRadius}>:`, { min: 0 }); },
    run: (l1, k1, l2, k2, s) => filletLines(l1, k1, l2, k2, s.filletRadius) });
});
export const CHAMFER = def('CHAMFER', ['CHA'], 'Modify', 'Bevel the corner between two lines (type D to set distances)', function* (ctx) {
  yield* cornerCommand(ctx, 'CHAMFER', 'Distance', {
    setup: function* (c) {
      const s = c.doc.settings;
      s.chamferD1 = yield ask.number(`CHAMFER  First distance <${s.chamferD1}>:`, { min: 0 });
      s.chamferD2 = yield ask.number(`CHAMFER  Second distance <${s.chamferD2}>:`, { min: 0 });
    },
    run: (l1, k1, l2, k2, s) => chamferLines(l1, k1, l2, k2, s.chamferD1, s.chamferD2) });
});

export const JOIN = def('JOIN', ['J'], 'Modify', 'Join end-to-end lines, arcs and polylines into one polyline', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'JOIN  Select objects to join (click, window, ALL; Enter to finish):');
  const r = joinEntities(ids.map(id => doc.entities.get(id)));
  if (!r.polylines.length) { ctx.say('Nothing could be joined (objects must touch end to end).'); doc.deselectAll(); return; }
  const first = doc.entities.get(r.consumed[0]);
  const ops = r.consumed.map(id => ({ op: 'remove', entity: doc.entities.get(id) }));
  r.polylines.forEach(p => ops.push({ op: 'add', entity: retype(first, p) }));
  doc.selection.clear(); doc.commit(ops, 'JOIN'); ctx.say(`${r.polylines.length} polyline(s) created.`);
});

export const BREAK = def('BREAK', ['BR'], 'Modify', 'Break a line, arc or circle between two points', function* (ctx) {
  const doc = ctx.doc;
  const id = yield ask.entity('BREAK  Select object (the pick point is the first break point):');
  const e = doc.entities.get(id), p1 = ctx.lastPoint;
  const p2 = yield ask.point('BREAK  Specify second break point:');
  const r = breakEntity(e, p1, p2);
  if (r.error) return void ctx.say(r.error);
  doc.commit(piecesOps(e, r.pieces, retype), 'BREAK');
});

export const EXPLODE = def('EXPLODE', ['X'], 'Modify', 'Split a polyline into lines and arcs', function* (ctx) {
  const doc = ctx.doc, ids = yield* selectObjects(ctx, 'EXPLODE  Select polylines (Enter to finish):');
  const ops = [];
  for (const id of ids) {
    const e = doc.entities.get(id), r = explodeEntity(e);
    if (r.error) { ctx.say(r.error); continue; }
    ops.push({ op: 'remove', entity: e }); r.pieces.forEach(g => ops.push({ op: 'add', entity: retype(e, g) }));
  }
  doc.selection.clear(); doc.commit(ops, 'EXPLODE');
});
