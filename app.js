import { Doc } from './document/document.js';
import { Viewport } from './engine/viewport.js';
import { render } from './engine/renderer.js';
import { entityBBox, mergeBBox } from './engine/geometry.js';
import { CommandManager } from './commands/command-manager.js';
import { LINE, RECTANGLE, CIRCLE } from './commands/draw.js';
import { ERASE, UNDO, REDO } from './commands/utility.js';
import { InputRouter } from './controllers/input-router.js';
import { attachCanvasInput } from './controllers/touch-controller.js';
import { attachVirtualMouse } from './controllers/virtual-mouse.js';

const $ = id => document.getElementById(id);
const doc = new Doc(), vp = new Viewport(), mgr = new CommandManager(doc);
[LINE, RECTANGLE, CIRCLE, ERASE, UNDO, REDO].forEach(c => mgr.register(c));
mgr.pickTol = () => 10 / vp.scale;
const router = new InputRouter(doc, vp, mgr);
const state = { touchMode: 'offset' };
const cv = $('cv'), stage = $('stage'), cin = $('cin');

let pending = false, first = true;
const req = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };
const css = () => { const s = getComputedStyle(document.documentElement), g = n => s.getPropertyValue(n).trim();
  return { bg: g('--bg'), grid: g('--grid'), grid2: g('--grid2'), axis: g('--axis'), ink: g('--ink'), sel: g('--sel'), prev: g('--prev'), cur: g('--cur') }; };

function draw() {
  pending = false;
  render(cv, { doc, vp, cursor: router.cursor, preview: mgr.getPreview(), readout: mgr.readout(), theme: css() });
  $('status').textContent = `X ${router.cursor.x.toFixed(2)}  Y ${router.cursor.y.toFixed(2)}  |  ${doc.entities.size} objects  |  ${doc.selection.size} selected  |  ${vp.scale.toFixed(3)} px/mm`;
}
function resize() {
  const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  vp.resize(r.width, r.height, dpr);
  if (first) { first = false; vp.scale = r.width / 3500; vp.cx = 1500; vp.cy = 900; router.setCursorScreen(r.width / 2, r.height / 2); }
  req();
}
new ResizeObserver(resize).observe(stage);

doc.on('change', req); doc.on('selection', req);
mgr.on('preview', req); router.on('cursor', req);
mgr.on('prompt', () => { $('prompt').textContent = mgr.prompt ? mgr.prompt.text : 'Command:'; req(); });
mgr.on('message', m => { $('log').textContent = m; });

attachCanvasInput(cv, vp, router, req, state);
attachVirtualMouse($('vm'), router);

cin.addEventListener('input', () => mgr.setTyped(cin.value));
cin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = cin.value; cin.value = ''; mgr.feedText(v); } });
document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => mgr.start(b.dataset.cmd)));
$('bUndo').onclick = () => mgr.start('UNDO'); $('bRedo').onclick = () => mgr.start('REDO');
$('bTouch').onclick = e => { state.touchMode = state.touchMode === 'offset' ? 'tap' : 'offset'; e.target.textContent = 'Touch: ' + (state.touchMode === 'offset' ? 'Offset' : 'Tap'); };
$('bFit').onclick = () => {
  let b = null; for (const e of doc.entities.values()) b = mergeBBox(b, entityBBox(e));
  if (b) vp.fit(b); else { vp.scale = vp.w / 3500; vp.cx = 1500; vp.cy = 900; }
  req();
};
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { mgr.cancel(); doc.deselectAll(); cin.value = ''; mgr.setTyped(''); }
  else if (e.key === 'Delete' && !mgr.gen && doc.selection.size) mgr.start('ERASE');
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); mgr.start('UNDO'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); mgr.start('REDO'); }
});
window.__alucad = { doc, vp, mgr, router };   // for debugging in the browser console
