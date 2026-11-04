import { Doc } from './document/document.js';
import { Viewport } from './engine/viewport.js';
import { render } from './engine/renderer.js';
import { entityBBox, mergeBBox } from './engine/geometry.js';
import { formatLength } from './engine/units.js';
import { CommandManager } from './commands/command-manager.js';
import { ALL_COMMANDS } from './commands/index.js';
import { InputRouter } from './controllers/input-router.js';
import { attachCanvasInput } from './controllers/touch-controller.js';
import { attachVirtualMouse } from './controllers/virtual-mouse.js';
import { initPrecisionUI } from './ui/precision-ui.js';

const $ = id => document.getElementById(id);
const doc = new Doc(), vp = new Viewport(), mgr = new CommandManager(doc);
ALL_COMMANDS.forEach(c => mgr.register(c));
mgr.pickTol = () => 10 / vp.scale;
const router = new InputRouter(doc, vp, mgr);
const state = { touchMode: 'offset' };
const cv = $('cv'), stage = $('stage'), cin = $('cin');

let pending = false, first = true;
const req = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };
const onView = () => { router.refresh(); req(); };      // zoom/pan changes the snap pick size in world units
const css = () => { const s = getComputedStyle(document.documentElement), g = n => s.getPropertyValue(n).trim();
  return { bg: g('--bg'), grid: g('--grid'), grid2: g('--grid2'), axis: g('--axis'), ink: g('--ink'), sel: g('--sel'), prev: g('--prev'), cur: g('--cur'), win: g('--win'), cross: g('--cross'), snap: g('--snap') }; };

function draw() {
  pending = false;
  const st = doc.settings, f = v => formatLength(v, st.units, st.precision);
  render(cv, { doc, vp, cursor: router.cursor, preview: mgr.getPreview(), dyn: mgr.dynInput(), selBox: mgr.selectionBox(), snap: router.snap, track: router.track, theme: css() });
  $('status').textContent = `X ${f(router.cursor.x)}  Y ${f(router.cursor.y)}  |  ${doc.entities.size} objects  |  ${doc.selection.size} selected  |  ${st.units}`;
}
function resize() {
  const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  vp.resize(r.width, r.height, dpr);
  if (first) { first = false; vp.scale = r.width / 3500; vp.cx = 1500; vp.cy = 900; router.setCursorScreen(r.width / 2, r.height / 2); }
  onView();
}
new ResizeObserver(resize).observe(stage);

doc.on('change', () => { router.refresh(); req(); }); doc.on('selection', req);
mgr.on('preview', req); router.on('cursor', req);
mgr.on('prompt', () => { $('prompt').textContent = mgr.prompt ? mgr.prompt.text : 'Command:'; req(); });
mgr.on('message', m => { $('log').textContent = m; });

attachCanvasInput(cv, vp, router, onView, state);
attachVirtualMouse($('vm'), router);
initPrecisionUI({ doc, router, req });

cin.addEventListener('input', () => mgr.setTyped(cin.value));
cin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = cin.value; cin.value = ''; mgr.feedText(v); } });
document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => mgr.start(b.dataset.cmd)));
$('bUndo').onclick = () => mgr.start('UNDO'); $('bRedo').onclick = () => mgr.start('REDO');
$('bTouch').onclick = e => { state.touchMode = state.touchMode === 'offset' ? 'tap' : 'offset'; e.target.textContent = 'Touch: ' + (state.touchMode === 'offset' ? 'Offset' : 'Tap'); };
$('bFit').onclick = () => {
  let b = null; for (const e of doc.entities.values()) b = mergeBBox(b, entityBBox(e));
  if (b) vp.fit(b); else { vp.scale = vp.w / 3500; vp.cx = 1500; vp.cy = 900; }
  onView();
};
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { mgr.cancel(); doc.deselectAll(); cin.value = ''; mgr.setTyped(''); }
  else if (e.key === 'Delete' && !mgr.gen && doc.selection.size) mgr.start('ERASE');
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); mgr.start('UNDO'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); mgr.start('REDO'); }
});
window.__alucad = { doc, vp, mgr, router };   // for debugging in the browser console
