import { SNAP_TYPES } from '../engine/snapping.js';
import { formatLength, parseLength } from '../engine/units.js';

// Mode toggles (OSNAP GRID SNAP ORTHO POLAR DYN) and the precision settings dialog.
export function initPrecisionUI({ doc, router, req }) {
  const s = doc.settings, $ = id => document.getElementById(id);
  const toggles = { bOsnap: 'osnapOn', bGrid: 'gridVisible', bSnap: 'gridSnap', bOrtho: 'ortho', bPolar: 'polar', bDyn: 'dyn' };
  const sync = () => { for (const [id, k] of Object.entries(toggles)) $(id).classList.toggle('on', !!s[k]); router.refresh(); req(); };
  const flip = k => { s[k] = !s[k]; if (k === 'ortho' && s.ortho) s.polar = false; if (k === 'polar' && s.polar) s.ortho = false; sync(); };
  for (const [id, k] of Object.entries(toggles)) $(id).addEventListener('click', () => flip(k));
  const keys = { F3: 'osnapOn', F7: 'gridVisible', F8: 'ortho', F9: 'gridSnap', F10: 'polar', F12: 'dyn' };
  window.addEventListener('keydown', e => { if (keys[e.key]) { e.preventDefault(); flip(keys[e.key]); } });

  const dlg = document.createElement('dialog'); dlg.id = 'dlg';
  dlg.innerHTML = `<form method="dialog"><h3>Drafting settings</h3>
    <label>Units <select id="sUnits"><option value="mm">Millimetres</option><option value="in">Inches</option><option value="ft-in">Feet &amp; inches</option></select></label>
    <label>Decimals <select id="sPrec">${[0, 1, 2, 3, 4].map(n => `<option>${n}</option>`).join('')}</select></label>
    <label>Grid spacing <input id="sGrid" type="text" inputmode="decimal"></label>
    <label>Polar increment <select id="sPolar">${[15, 30, 45, 90].map(n => `<option>${n}</option>`).join('')}<option value="custom">Custom…</option></select>
      <input id="sPolarC" type="number" min="1" max="180" step="any" style="width:5em"> °</label>
    <label>Snap pick size <input id="sTol" type="number" min="4" max="40" style="width:5em"> px</label>
    <fieldset><legend>Object snaps</legend>${SNAP_TYPES.map(t => `<label class="chk"><input type="checkbox" data-snap="${t}"> ${t[0].toUpperCase() + t.slice(1)}</label>`).join('')}</fieldset>
    <button value="close">Close</button></form>`;
  document.body.appendChild(dlg);
  const fmtGrid = () => { $('sGrid').value = formatLength(s.gridSpacing, s.units, s.precision).replace(/"$/, ''); };
  const load = () => {
    $('sUnits').value = s.units; $('sPrec').value = s.precision; fmtGrid(); $('sTol').value = s.snapTolPx;
    const preset = [15, 30, 45, 90].includes(s.polarAngle); $('sPolar').value = preset ? String(s.polarAngle) : 'custom';
    $('sPolarC').value = s.polarAngle; $('sPolarC').disabled = preset;
    dlg.querySelectorAll('[data-snap]').forEach(cb => { cb.checked = !!s.osnap[cb.dataset.snap]; });
  };
  $('sUnits').onchange = e => { s.units = e.target.value; fmtGrid(); sync(); };
  $('sPrec').onchange = e => { s.precision = +e.target.value; fmtGrid(); sync(); };
  $('sGrid').onchange = e => { const v = parseLength(e.target.value, s.units); if (v > 0) s.gridSpacing = v; fmtGrid(); sync(); };
  $('sTol').onchange = e => { const v = +e.target.value; if (v >= 4 && v <= 40) s.snapTolPx = v; sync(); };
  $('sPolar').onchange = e => { if (e.target.value !== 'custom') s.polarAngle = +e.target.value; load(); sync(); };
  $('sPolarC').onchange = e => { const v = +e.target.value; if (v > 0 && v <= 180) s.polarAngle = v; sync(); };
  dlg.querySelectorAll('[data-snap]').forEach(cb => cb.addEventListener('change', () => { s.osnap[cb.dataset.snap] = cb.checked; sync(); }));
  $('bSettings').addEventListener('click', () => { load(); dlg.showModal(); });
  sync();
}
