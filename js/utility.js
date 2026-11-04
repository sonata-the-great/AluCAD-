import { def, selectObjects } from './common.js';
import { ask } from './command-manager.js';
import { makeLine } from '../document/entities.js';
import { dist, angleOf, toDeg } from '../engine/geometry.js';
import { formatLength } from '../engine/units.js';

export const ERASE = def('ERASE', ['E'], 'Edit', 'Delete objects (current selection, click, window or crossing)', function* (ctx) {
  const doc = ctx.doc;
  const ids = yield* selectObjects(ctx, 'ERASE  Select objects (click, drag right=window, left=crossing, ALL; Enter to finish):');
  if (!ids.length) return;
  const ops = ids.map(id => ({ op: 'remove', entity: doc.entities.get(id) }));
  doc.selection.clear();
  doc.commit(ops, 'ERASE');
  ctx.say(`${ops.length} object(s) erased.`);
});

export const UNDO = def('UNDO', ['U'], 'Utilities', 'Undo the last operation', function* (ctx) {
  if (!ctx.doc.undo()) ctx.say('Nothing to undo.');
});
export const REDO = def('REDO', ['RE'], 'Utilities', 'Redo the last undone operation', function* (ctx) {
  if (!ctx.doc.redo()) ctx.say('Nothing to redo.');
});

export const DIST = def('DIST', ['DI'], 'Utilities', 'Measure distance and angle between two points', function* (ctx) {
  const a = yield ask.point('DIST  Specify first point:');
  const b = yield ask.point('DIST  Specify second point:', { base: a, preview: p => [makeLine(a, p)] });
  const st = ctx.doc.settings, f = v => formatLength(v, st.units, st.precision);
  const ang = ((toDeg(angleOf(a, b)) % 360) + 360) % 360;
  ctx.say(`Distance = ${f(dist(a, b))},  Angle in XY plane = ${ang.toFixed(2)}°,  Delta X = ${f(b.x - a.x)},  Delta Y = ${f(b.y - a.y)}`);
});
