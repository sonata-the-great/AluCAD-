import { Emitter } from '../core/emitter.js';
import { resolveCursor } from '../engine/precision.js';

// The ONE place cursor position lives. Virtual mouse, touch and mouse all move the RAW cursor;
// the RESOLVED cursor (after ortho / polar / grid / object snap) is what commands receive.
export class InputRouter extends Emitter {
  constructor(doc, vp, mgr) {
    super();
    this.doc = doc; this.vp = vp; this.mgr = mgr;
    this.raw = { x: 0, y: 0 }; this.cursor = { x: 0, y: 0 }; this.snap = null; this.track = null;
    this.speeds = [{ name: 'Fine', px: 1 }, { name: 'Normal', px: 5 }, { name: 'Fast', px: 16 }];
    this.speedIdx = 1;
    mgr.on('prompt', () => this.refresh());
  }
  get stepPx() { return this.speeds[this.speedIdx].px; }
  cycleSpeed() { this.speedIdx = (this.speedIdx + 1) % this.speeds.length; return this.speeds[this.speedIdx].name; }
  get base() { const pr = this.mgr.prompt; return pr && pr.type === 'point' ? pr.base || null : null; }
  refresh() {
    const s = this.doc.settings;
    const r = resolveCursor(this.raw, { doc: this.doc, base: this.base, ortho: s.ortho, polar: s.polar, polarAngle: s.polarAngle,
      gridSnap: s.gridSnap, gridSpacing: s.gridSpacing, tol: s.snapTolPx / this.vp.scale, osnapOn: s.osnapOn, modes: s.osnap });
    this.cursor = r.point; this.snap = r.snap; this.track = r.track;
    this.mgr.setCursor(this.cursor); this.emit('cursor');
  }
  _set(p) { this.raw = { x: p.x, y: p.y }; this.refresh(); }
  setCursorScreen(x, y) {
    const m = 2;
    this._set(this.vp.toWorld({ x: Math.min(this.vp.w - m, Math.max(m, x)), y: Math.min(this.vp.h - m, Math.max(m, y)) }));
  }
  // Move the raw cursor by screen pixels (converted to world units via zoom); auto-pans at the canvas edge.
  moveBy(dxPx, dyPx) {
    const vp = this.vp, s = vp.toScreen(this.raw), m = 10;
    let nx = s.x + dxPx, ny = s.y + dyPx;
    if (nx < m) { vp.pan(m - nx, 0); nx = m; } else if (nx > vp.w - m) { vp.pan(vp.w - m - nx, 0); nx = vp.w - m; }
    if (ny < m) { vp.pan(0, m - ny); ny = m; } else if (ny > vp.h - m) { vp.pan(0, vp.h - m - ny); ny = vp.h - m; }
    this._set(vp.toWorld({ x: nx, y: ny }));
  }
  primaryClick() {
    if (this.mgr.gen) return this.mgr.feedPoint(this.cursor);
    this.mgr.selectClick(this.cursor, true);   // AutoCAD-style: object, or window/crossing corners
  }
  secondaryClick() { this.mgr.enter(); }   // active: finish/cancel. idle: repeat last command.
}
