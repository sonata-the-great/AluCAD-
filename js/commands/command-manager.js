import { Emitter } from '../core/emitter.js';
import { dist, angleOf, polar, toRad, toDeg } from '../engine/geometry.js';
import { pickEntity, boxSelect, selectableIds } from '../engine/selection.js';
import { parseLength, formatLength } from '../engine/units.js';

// Prompt builders used by command generators (yield ask.point(...)).
// Common options: keywords:[..] (typed -> {keyword}), allowEnd (Enter returns null), preview(value) -> entities.
export const ask = {
  point: (text, o = {}) => ({ type: 'point', text, ...o }),
  number: (text, o = {}) => ({ type: 'number', text, ...o }),   // o.fromPoint(p) -> value for a click; positive; min
  // number prompts: kind 'length' (default, unit-aware) | 'angle' (degrees) | 'factor'; label shown in dynamic input
  entity: (text, o = {}) => ({ type: 'entity', text, ...o }),   // click one object (ctx.lastPoint = pick point)
  select: (text, o = {}) => ({ type: 'select', text, ...o }),   // fills doc.selection (click / window / crossing / ALL)
  keyword: (text, o = {}) => ({ type: 'keyword', text, ...o }),
};

const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
export const parseNumber = s => (new RegExp(`^${NUM}$`).test(s.trim()) ? parseFloat(s) : null);

// Accepts "x,y"  "@dx,dy"  "@dist<angleDeg"  "dist<angleDeg"  or a bare distance (direction taken from the cursor).
// Lengths are read in `units` (mm / in / ft-in) and returned in mm.
export function parsePoint(s, { base = null, cursor = null, dimensions = false, units = 'mm' } = {}) {
  s = s.trim();
  const rel = s[0] === '@'; if (rel) s = s.slice(1);
  const b = base || { x: 0, y: 0 };
  if (s.includes('<')) {
    const [d, a, ...extra] = s.split('<'), L = parseLength(d, units), A = parseNumber(a || '');
    return extra.length || L === null || A === null ? null : polar(rel ? b : { x: 0, y: 0 }, L, toRad(A));
  }
  if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length !== 2) return null;
    const x = parseLength(parts[0], units), y = parseLength(parts[1], units);
    if (x === null || y === null) return null;
    return rel || (dimensions && base) ? { x: b.x + x, y: b.y + y } : { x, y };
  }
  if (rel) return null;
  const n = parseLength(s, units);
  return n !== null && base ? polar(base, n, cursor && dist(base, cursor) > 0 ? angleOf(base, cursor) : 0) : null;
}

export class CommandManager extends Emitter {
  constructor(doc) {
    super();
    this.doc = doc; this.defs = new Map(); this.alias = new Map();
    this.gen = null; this.prompt = null; this.active = null; this.last = null;
    this.cursor = { x: 0, y: 0 }; this.typed = ''; this.history = [];
    this.boxStart = null;                       // first corner of a pending window/crossing selection
    this.pickTol = () => 1;
    this.ctx = { doc, lastPoint: null, say: m => this.say(m), pick: p => pickEntity(doc, p, this.pickTol()) };
  }
  register(def) {
    this.defs.set(def.name.toLowerCase(), def);
    for (const a of [def.name, ...def.aliases]) this.alias.set(a.toLowerCase(), def);
  }
  find(n) { return this.alias.get(n.trim().toLowerCase()) || null; }
  say(m) { this.emit('message', m); }

  start(name) {
    const def = this.find(name);
    if (!def) { this.say(`Unknown command: ${name}`); return false; }
    if (def.status !== 'available') { this.say(`${def.name} is planned, not available yet.`); return false; }
    this.cancel(true);
    this.active = def; this.last = def.name; this.history.push(def.name);
    this.gen = def.run(this.ctx);
    this._step(undefined);
    return true;
  }
  _step(v) {
    let r;
    try { r = this.gen.next(v); } catch (err) { this.say('Error: ' + err.message); return this._end(); }
    if (r.done) return this._end();
    this.prompt = r.value; this.typed = ''; this.boxStart = null;
    this.emit('prompt'); this.emit('preview');
  }
  _end() { this.gen = null; this.active = null; this.prompt = null; this.typed = ''; this.boxStart = null; this.emit('prompt'); this.emit('preview'); }
  cancel(silent = false) {
    if (this.boxStart) { this.boxStart = null; this.emit('preview'); }
    if (!this.gen) return;
    try { this.gen.return(); } catch { /* ignore */ }
    if (!silent) this.say('*Cancel*');
    this._end();
  }
  _accept(v) {
    const pr = this.prompt;
    if (pr.positive && !(v > 0)) return this.say('Value must be greater than zero.');
    if (pr.min !== undefined && v < pr.min) return this.say(`Value must be at least ${pr.min}.`);
    this._step(v);
  }
  _val(s, pr) { return (pr.kind || 'length') === 'length' ? parseLength(s, this.doc.settings.units) : parseNumber(s); }
  _kw(pr, s) {
    const l = s.toLowerCase();
    for (const k of pr.keywords || []) if (k.toLowerCase() === l || (l.length === 1 && k[0].toLowerCase() === l)) return k;
    return null;
  }

  // ---- AutoCAD-style selection: click object, or click empty space then a 2nd corner.
  //      2nd corner to the RIGHT = window (fully inside), to the LEFT = crossing (touching).
  selectClick(p, toggle) {
    if (this.boxStart) {
      const a = this.boxStart; this.boxStart = null;
      const ids = boxSelect(this.doc, a, p); ids.forEach(id => this.doc.select(id));
      this.say(`${ids.length} found by ${p.x >= a.x ? 'window' : 'crossing'}; ${this.doc.selection.size} selected.`);
      this.emit('preview'); return;
    }
    const id = pickEntity(this.doc, p, this.pickTol());
    if (id) { toggle ? this.doc.toggleSelect(id) : this.doc.select(id); if (!toggle) this.say(`${this.doc.selection.size} selected.`); }
    else { this.boxStart = { x: p.x, y: p.y }; this.say('Specify opposite corner: right = window, left = crossing.'); this.emit('preview'); }
  }
  beginBox(p) {   // used by mouse/touch drag
    if ((!this.gen || this.prompt?.type === 'select') && !this.boxStart && !pickEntity(this.doc, p, this.pickTol())) {
      this.boxStart = { x: p.x, y: p.y }; this.emit('preview'); return true;
    }
    return false;
  }
  selectionBox() { return this.boxStart ? { a: this.boxStart, b: this.cursor, crossing: this.cursor.x < this.boxStart.x } : null; }

  feedPoint(p) {
    const pr = this.prompt; if (!this.gen || !pr) return;
    this.ctx.lastPoint = { x: p.x, y: p.y };
    if (pr.type === 'point') this._step({ x: p.x, y: p.y });
    else if (pr.type === 'number') {
      const v = pr.fromPoint ? pr.fromPoint(p) : pr.base ? dist(pr.base, p) : null;
      v == null ? this.say('Type a value.') : this._accept(v);
    } else if (pr.type === 'entity') {
      const id = this.ctx.pick(p);
      id ? this._step(id) : this.say('No object at that point.');
    } else if (pr.type === 'select') this.selectClick(p, false);
  }
  feedText(s) {
    s = s.trim(); this.typed = '';
    if (!s) return this.enter();
    const pr = this.prompt;
    const kw = pr && this._kw(pr, s);
    if (kw) return void this._step({ keyword: kw });
    if (pr && pr.type === 'select' && s.toLowerCase() === 'all') {
      selectableIds(this.doc).forEach(id => this.doc.select(id));
      return void this.say(`${this.doc.selection.size} selected.`);
    }
    if (this.find(s)) return void this.start(s);          // typing a command name switches commands
    if (!this.gen) return void this.say(`Unknown command: ${s}`);
    if (pr.type === 'point') {
      const p = parsePoint(s, { base: pr.base, cursor: this.cursor, dimensions: pr.dimensions, units: this.doc.settings.units });
      p ? this._step(p) : this.say('Invalid point. Use x,y  @dx,dy  @dist<angle  or a distance.');
    } else if (pr.type === 'number') {
      const n = this._val(s, pr);
      n === null ? this.say('Enter a number (units: ' + this.doc.settings.units + ').') : this._accept(n);
    } else if (pr.type === 'select') this.say('Click objects, drag a window (right) or crossing (left), type ALL, or press Enter.');
    else if (pr.type === 'keyword') this.say('Choose one of: ' + pr.keywords.join(' / '));
    else this.say('Click an object, or press Enter to finish.');
  }
  enter() {
    if (this.boxStart) { this.boxStart = null; this.emit('preview'); if (!this.gen) return; }
    if (this.gen) { this.prompt.allowEnd ? this._step(null) : this.cancel(); }
    else if (this.last) this.start(this.last);
  }
  setCursor(p) { this.cursor = p; this.emit('preview'); }
  setTyped(s) { this.typed = s; this.emit('preview'); }

  _effPoint() {
    const pr = this.prompt, t = this.typed.trim();
    return (t && parsePoint(t, { base: pr.base, cursor: this.cursor, dimensions: pr.dimensions, units: this.doc.settings.units })) || this.cursor;
  }
  getPreview() {
    const pr = this.prompt; if (!pr || !pr.preview) return [];
    if (pr.type === 'point') return pr.preview(this._effPoint()) || [];
    if (pr.type === 'number') {
      const n = this.typed.trim() ? this._val(this.typed, pr) : null;
      const v = n !== null ? n : pr.fromPoint ? pr.fromPoint(this.cursor) : pr.base ? dist(pr.base, this.cursor) : null;
      return v == null || (pr.positive && !(v > 0)) ? [] : pr.preview(v) || [];
    }
    return [];
  }
  // Lines of text shown next to the cursor (Dynamic Input).
  dynInput() {
    const st = this.doc.settings; if (!st.dyn) return [];
    const f = mm => formatLength(mm, st.units, st.precision), pr = this.prompt, t = this.typed.trim(), c = this.cursor;
    const deg = r => ((toDeg(r) % 360) + 360) % 360;
    let lines;
    if (!pr || pr.type !== 'point' && pr.type !== 'number') lines = [`${f(c.x)}, ${f(c.y)}`];
    else if (pr.type === 'point') {
      const p = this._effPoint();
      if (!pr.base) lines = [`X ${f(p.x)}`, `Y ${f(p.y)}`];
      else if (pr.dimensions) lines = [`W ${f(Math.abs(p.x - pr.base.x))}`, `H ${f(Math.abs(p.y - pr.base.y))}`];
      else lines = [`Dist ${f(dist(pr.base, p))}`, `Ang ${deg(angleOf(pr.base, p)).toFixed(1)}°`];
    } else {
      const n = t ? this._val(t, pr) : null, v = n !== null ? n : pr.fromPoint ? pr.fromPoint(c) : pr.base ? dist(pr.base, c) : null, k = pr.kind || 'length';
      lines = v == null ? [] : [`${pr.label || 'Value'} ${k === 'length' ? f(v) : k === 'angle' ? v.toFixed(2) + '°' : +v.toFixed(4)}`];
    }
    if (t) lines.push('> ' + t);
    return lines;
  }
  readout() {
    const pr = this.prompt; if (!pr || !pr.base) return null;
    const p = pr.type === 'point' ? this._effPoint() : this.cursor;
    return { d: dist(pr.base, p), a: toDeg(angleOf(pr.base, p)) };
  }
}
