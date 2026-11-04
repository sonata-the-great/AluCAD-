// Internal unit is always millimetres. These functions only convert typed / displayed text.
const N = '(?:\\d+\\.?\\d*|\\.\\d+)';
export const MM_PER_IN = 25.4;
export const UNIT_NAMES = { mm: 'Millimetres', in: 'Inches', 'ft-in': 'Feet & inches' };

// Parse a typed length into millimetres. A bare number is read in the drawing unit
// (mm for 'mm', inches for 'in' and 'ft-in'). Accepts: 12mm 3cm 2m 10" 5' 5'-3 1/2" 3 1/2" 1/2"
export function parseLength(str, units = 'mm') {
  let s = String(str).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let sign = 1;
  if (s[0] === '-') { sign = -1; s = s.slice(1).trim(); } else if (s[0] === '+') s = s.slice(1).trim();
  let m = s.match(new RegExp(`^(${N})\\s*(mm|cm|m)$`));
  if (m) return sign * parseFloat(m[1]) * { mm: 1, cm: 10, m: 1000 }[m[2]];
  if (new RegExp(`^${N}$`).test(s)) return sign * parseFloat(s) * (units === 'mm' ? 1 : MM_PER_IN);
  let rest = s, feet = 0, found = false;
  const fm = rest.match(new RegExp(`^(${N})\\s*(?:'|ft)\\s*-?\\s*`));
  if (fm) { feet = parseFloat(fm[1]); found = true; rest = rest.slice(fm[0].length); }
  let inch = 0;
  if (rest) {
    const im = rest.match(new RegExp(`^(?:(${N})(?:\\s+(\\d+)\\s*/\\s*(\\d+))?|(\\d+)\\s*/\\s*(\\d+))\\s*("|in)?$`));
    if (!im || (!found && !im[6])) return null;
    if (im[1] !== undefined) { inch = parseFloat(im[1]); if (im[2] !== undefined) { if (+im[3] === 0) return null; inch += +im[2] / +im[3]; } }
    else { if (+im[5] === 0) return null; inch = +im[4] / +im[5]; }
  } else if (!found) return null;
  return sign * (feet * 12 + inch) * MM_PER_IN;
}

// Format millimetres for display in the drawing unit.
export function formatLength(mm, units = 'mm', precision = 2) {
  if (!Number.isFinite(mm)) return '?';
  if (Math.abs(mm) < 0.5 * Math.pow(10, -precision) * (units === 'mm' ? 1 : MM_PER_IN)) mm = 0;
  if (units === 'in') return (mm / MM_PER_IN).toFixed(precision) + '"';
  if (units === 'ft-in') {
    const sign = mm < 0 ? '-' : '', total = Math.abs(mm) / MM_PER_IN;
    let ft = Math.floor(total / 12 + 1e-12), inch = Math.max(0, total - ft * 12);   // clamp: float error can leave -1e-15
    if (+inch.toFixed(precision) >= 12) { ft += 1; inch = 0; }
    return ft === 0 ? `${sign}${inch.toFixed(precision)}"` : `${sign}${ft}'-${inch.toFixed(precision)}"`;
  }
  return mm.toFixed(precision);
}
