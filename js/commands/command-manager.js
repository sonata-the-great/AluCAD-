import { Emitter } from '../core/emitter.js';
import { dist, angleOf, polar, toRad, toDeg } from '../engine/geometry.js';
import { pickEntity } from '../engine/selection.js';

// Prompt builders used by command generators (yield ask.point(...)).
export const ask = {
  point: (text, o = {}) => ({ type: 'point', text, ...o }),
  number: (text, o = {}) => ({ type: 'number', text, ...o }),
  entity: (text, o = {}) => ({ type: 'entity', text, ...o }),
};

const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
export const parseNumber = s => (new RegExp(`^${NUM}$`).test(s.trim()) ? parseFloat(s) : null);

// Accepts "x,y"  "@dx,dy"  "@dist<angleDeg"  or a bare distance (direction taken from cursor).
export function parsePoint(s, { base = null, cursor = null, dimensions = false } = {}) {
  s = s.trim();
  const b = base || { x: 0, y: 0 };
  let m = s.match(new RegExp(`^(@?)(${NUM})\\s*,\\s*(${NUM})$`));
  if (m) {
    const x = +m[2], y = +m[3];
    return (m[1] || (dimensions && base)) ? { x: b.x + x, y: b.y + y } : { x, y };
  }
  m = s.match(new RegExp(`^@(${NUM})\\s*<\\s*(${NUM})$`));
  if (m) return polar(b, +m[1], toRad(+m[2]));
  const n = parseNumber(s);
  if (n !== null && base) return polar(base, n, cursor && dist(base, cursor) > 0 ? angleOf(base, cursor) : 0);
  return null;
}

export class CommandManager extends Emitter {
  constructor(doc) {
    super();
    this.doc = doc; this.defs = new Map(); this.alias = new Map();
    this.gen = null; this.prompt = null; this.active = null; this.last = null;
    this.cursor = { x: 0, y: 0 }; this.typed = ''; this.history = [];
    this.pickTol = () => 1;
    this.ctx = { doc, say: m => this.say(m), pick: p => pickEntity(doc, p, this.pickTol()) };
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
    this.prompt = r.value; this.typed = '';
    this.emit('prompt'); this.emit('preview');
  }
  _end() { this.gen = null; this.active = null; this.prompt = null; this.typed = ''; this.emit('prompt'); this.emit('preview'); }
  cancel(silent = false) {
    if (!this.gen) return;
    try { this.gen.return(); } catch { /* ignore */ }
    if (!silent) this.say('*Cancel*');
    this._end();
  }
  _accept(v) {
    if (this.prompt.positive && !(v > 0)) return this.say('Value must be greater than zero.');
    this._step(v);
  }

  feedPoint(p) {
    const pr = this.prompt; if (!this.gen || !pr) return;
    if (pr.type === 'point') this._step({ x: p.x, y: p.y });
    else if (pr.type === 'number') { if (pr.base) this._accept(dist(pr.base, p)); }
    else if (pr.type === 'entity') {
      const id = this.ctx.pick(p);
      id ? this._step(id) : this.say('No object at that point.');
    }
  }
  feedText(s) {
    s = s.trim(); this.typed = '';
    if (!s) return this.enter();
    if (this.find(s)) return void this.start(s);          // typing a command name switches commands
    if (!this.gen) return void this.say(`Unknown command: ${s}`);
    const pr = this.prompt;
    if (pr.type === 'point') {
      const p = parsePoint(s, { base: pr.base, cursor: this.cursor, dimensions: pr.dimensions });
      p ? this._step(p) : this.say('Invalid point. Use x,y  @dx,dy  @dist<angle  or a distance.');
    } else if (pr.type === 'number') {
      const n = parseNumber(s);
      n === null ? this.say('Enter a number.') : this._accept(n);
    } else this.say('Click an object, or press Enter to finish.');
  }
  enter() {
    if (this.gen) { this.prompt.allowEnd ? this._step(null) : this.cancel(); }
    else if (this.last) this.start(this.last);
  }
  setCursor(p) { this.cursor = p; this.emit('preview'); }
  setTyped(s) { this.typed = s; this.emit('preview'); }

  _effPoint() {
    const pr = this.prompt, t = this.typed.trim();
    return (t && parsePoint(t, { base: pr.base, cursor: this.cursor, dimensions: pr.dimensions })) || this.cursor;
  }
  getPreview() {
    const pr = this.prompt; if (!pr || !pr.preview) return [];
    if (pr.type === 'point') return pr.preview(this._effPoint()) || [];
    if (pr.type === 'number') {
      const n = this.typed.trim() ? parseNumber(this.typed) : null;
      const v = n !== null && n > 0 ? n : pr.base ? dist(pr.base, this.cursor) : 0;
      return v > 0 ? pr.preview(v) || [] : [];
    }
    return [];
  }
  readout() {
    const pr = this.prompt; if (!pr || !pr.base) return null;
    const p = pr.type === 'point' ? this._effPoint() : this.cursor;
    return { d: dist(pr.base, p), a: toDeg(angleOf(pr.base, p)) };
  }
}
