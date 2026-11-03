import { Emitter } from '../core/emitter.js';
import { pickEntity } from '../engine/selection.js';

// The ONE place cursor position lives. Virtual mouse, touch and mouse all call these methods,
// so a click can only reach the command system through primaryClick()/secondaryClick().
export class InputRouter extends Emitter {
  constructor(doc, vp, mgr) {
    super();
    this.doc = doc; this.vp = vp; this.mgr = mgr;
    this.cursor = { x: 0, y: 0 };
    this.speeds = [{ name: 'Fine', px: 1 }, { name: 'Normal', px: 5 }, { name: 'Fast', px: 16 }];
    this.speedIdx = 1;
  }
  get stepPx() { return this.speeds[this.speedIdx].px; }
  cycleSpeed() { this.speedIdx = (this.speedIdx + 1) % this.speeds.length; return this.speeds[this.speedIdx].name; }
  _set(p) { this.cursor = { x: p.x, y: p.y }; this.mgr.setCursor(this.cursor); this.emit('cursor'); }
  setCursorScreen(x, y) {
    const m = 2;
    this._set(this.vp.toWorld({ x: Math.min(this.vp.w - m, Math.max(m, x)), y: Math.min(this.vp.h - m, Math.max(m, y)) }));
  }
  // Move by screen pixels (converted to world units via zoom); auto-pans at the canvas edge.
  moveBy(dxPx, dyPx) {
    const vp = this.vp, s = vp.toScreen(this.cursor), m = 10;
    let nx = s.x + dxPx, ny = s.y + dyPx;
    if (nx < m) { vp.pan(m - nx, 0); nx = m; } else if (nx > vp.w - m) { vp.pan(vp.w - m - nx, 0); nx = vp.w - m; }
    if (ny < m) { vp.pan(0, m - ny); ny = m; } else if (ny > vp.h - m) { vp.pan(0, vp.h - m - ny); ny = vp.h - m; }
    this._set(vp.toWorld({ x: nx, y: ny }));
  }
  primaryClick() {
    if (this.mgr.gen) return this.mgr.feedPoint(this.cursor);
    const id = pickEntity(this.doc, this.cursor, 10 / this.vp.scale);
    id ? this.doc.toggleSelect(id) : this.doc.deselectAll();
  }
  secondaryClick() { this.mgr.enter(); }   // active: finish/cancel. idle: repeat last command.
}
