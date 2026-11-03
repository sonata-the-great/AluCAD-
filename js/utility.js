import { ask } from './command-manager.js';

const def = (name, aliases, category, description, run) => ({ name, aliases, category, description, status: 'available', run });

export const ERASE = def('ERASE', ['E'], 'Edit', 'Delete objects (uses current selection if any)', function* (ctx) {
  const doc = ctx.doc;
  if (doc.selection.size === 0) {
    while (true) {
      const id = yield ask.entity('ERASE  Select object (Enter to finish):', { allowEnd: true });
      if (!id) break;
      doc.select(id);
    }
  }
  if (doc.selection.size === 0) return;
  const ops = [...doc.selection].map(id => ({ op: 'remove', entity: doc.entities.get(id) }));
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
