import { ask } from './command-manager.js';
import { selectableIds } from '../engine/selection.js';

export const def = (name, aliases, category, description, run) => ({ name, aliases, category, description, status: 'available', run });

// Select objects: uses an existing selection (pick-first) or prompts. Returns array of ids.
export function* selectObjects(ctx, text, { pickfirst = true, allIfEmpty = false } = {}) {
  const doc = ctx.doc;
  if (!(pickfirst && doc.selection.size)) {
    doc.deselectAll();
    yield ask.select(text, { allowEnd: true });
  }
  let ids = [...doc.selection];
  if (!ids.length && allIfEmpty) ids = selectableIds(doc);
  return ids;
}

// Turn trim/break pieces into ops: first piece replaces the original, the rest are added; none = delete.
export function piecesOps(e, pieces, retype) {
  if (!pieces.length) return [{ op: 'remove', entity: e }];
  return pieces.map((g, i) => i === 0
    ? { op: 'modify', id: e.id, before: e, after: { ...retype(e, g), id: e.id } }
    : { op: 'add', entity: retype(e, g) });
}
