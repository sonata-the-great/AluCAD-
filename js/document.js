import { Emitter } from '../core/emitter.js';

// Single source of truth. Every change is a transaction: a list of ops
// {op:'add',entity} | {op:'remove',entity} | {op:'modify',id,before,after}.
export class Doc extends Emitter {
  constructor() {
    super();
    this.entities = new Map(); this.order = [];
    this.layers = [{ id: '0', name: '0', color: null, visible: true, locked: false }];
    this.activeLayerId = '0';
    this.selection = new Set();
    this.settings = {
      filletRadius: 0, chamferD1: 0, chamferD2: 0, offsetDist: 0,
      units: 'mm', precision: 2,
      osnapOn: true, osnap: { endpoint: true, midpoint: true, center: true, quadrant: true, intersection: true, perpendicular: true, tangent: false, nearest: false },
      ortho: false, polar: false, polarAngle: 45, gridVisible: true, gridSnap: false, gridSpacing: 100, snapTolPx: 12, dyn: true,
    };
    this.undoStack = []; this.redoStack = []; this.seq = 0;
  }
  commit(ops, label = '') {
    if (!ops.length) return;
    for (const o of ops) if (o.op === 'add') { o.entity.id ??= 'e' + (++this.seq); o.entity.layerId ??= this.activeLayerId; }
    this._run(ops, false);
    this.undoStack.push({ label, ops }); this.redoStack.length = 0;
    this.emit('change');
  }
  _put(e) { this.entities.set(e.id, e); if (!this.order.includes(e.id)) this.order.push(e.id); }
  _del(id) { this.entities.delete(id); this.order = this.order.filter(i => i !== id); }
  _run(ops, rev) {
    for (const o of rev ? [...ops].reverse() : ops) {
      if (o.op === 'add') rev ? this._del(o.entity.id) : this._put(o.entity);
      else if (o.op === 'remove') rev ? this._put(o.entity) : this._del(o.entity.id);
      else if (o.op === 'modify') this._put(structuredClone(rev ? o.before : o.after));
    }
  }
  _pruneSelection() { for (const id of [...this.selection]) if (!this.entities.has(id)) this.selection.delete(id); this.emit('selection'); }
  undo() { const t = this.undoStack.pop(); if (!t) return false; this._run(t.ops, true); this.redoStack.push(t); this._pruneSelection(); this.emit('change'); return true; }
  redo() { const t = this.redoStack.pop(); if (!t) return false; this._run(t.ops, false); this.undoStack.push(t); this._pruneSelection(); this.emit('change'); return true; }
  select(id) { this.selection.add(id); this.emit('selection'); }
  toggleSelect(id) { this.selection.has(id) ? this.selection.delete(id) : this.selection.add(id); this.emit('selection'); }
  deselectAll() { if (this.selection.size) { this.selection.clear(); this.emit('selection'); } }
  toJSON() {
    return { version: 1, units: this.settings.units, layers: this.layers, activeLayerId: this.activeLayerId, settings: this.settings,
      entities: this.order.map(id => this.entities.get(id)) };
  }
}
