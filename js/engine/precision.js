import { dist, angleOf, polar, normPi, toRad } from './geometry.js';
import { findSnap } from './snapping.js';

// Turns the raw pointer position into the point CAD actually uses.
// Order: ortho/polar constraint from the base point -> grid snap -> object snap (overrides all).
// o: { doc, base, ortho, polar, polarAngle(deg), gridSnap, gridSpacing, tol(world), osnapOn, modes }
export function resolveCursor(raw, o) {
  let pt = { x: raw.x, y: raw.y }, track = null, snap = null, constrained = false;
  const d = o.base ? dist(o.base, raw) : 0;
  if (o.base && d > 1e-9 && (o.ortho || o.polar)) {
    const ang = angleOf(o.base, raw);
    let a = null, L = 0;
    if (o.ortho) { a = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2); L = d * Math.cos(ang - a); }
    else {
      const inc = toRad(o.polarAngle > 0 ? o.polarAngle : 45);
      const cand = Math.round(ang / inc) * inc, diff = normPi(ang - cand);
      if (d * Math.abs(Math.sin(diff)) <= o.tol) { a = cand; L = d * Math.cos(diff); }
    }
    if (a !== null) {
      if (o.gridSnap && o.gridSpacing > 0) L = Math.round(L / o.gridSpacing) * o.gridSpacing;
      pt = polar(o.base, L, a); track = { from: o.base, angle: a }; constrained = true;
    }
  }
  if (!constrained && o.gridSnap && o.gridSpacing > 0) pt = { x: Math.round(raw.x / o.gridSpacing) * o.gridSpacing, y: Math.round(raw.y / o.gridSpacing) * o.gridSpacing };
  if (o.osnapOn) {
    snap = findSnap(o.doc, raw, o.tol, o.modes, o.base);
    if (snap) { pt = { x: snap.x, y: snap.y }; track = null; }
  }
  return { point: pt, snap, track };
}
