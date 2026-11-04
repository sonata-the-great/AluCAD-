export class Emitter {
  constructor() { this._l = {}; }
  on(evt, fn) { (this._l[evt] ||= []).push(fn); return this; }
  emit(evt, ...a) { (this._l[evt] || []).forEach(fn => fn(...a)); }
}
