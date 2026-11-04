// Canvas pointer input. One finger = cursor (offset or tap mode), two fingers = pinch/pan,
// mouse = hover cursor, left click, right click, wheel zoom, middle-drag pan.
export function attachCanvasInput(cv, vp, router, onView, state) {
  const OFFSET = 64, P = new Map();
  let multi = false, pinch = null, panning = false;
  cv.style.touchAction = 'none';
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const place = e => {
    const p = pos(e);
    router.setCursorScreen(p.x, e.pointerType === 'touch' && state.touchMode === 'offset' ? p.y - OFFSET : p.y);
  };
  const snap = () => {
    const [a, b] = [...P.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    P.set(e.pointerId, { ...pos(e), sx: pos(e).x, sy: pos(e).y, btn: e.button, type: e.pointerType, drag: false });
    if (P.size >= 2) { multi = true; pinch = snap(); }
    else if (e.button === 1) panning = true;
    else place(e);
  });
  cv.addEventListener('pointermove', e => {
    const rec = P.get(e.pointerId);
    if (!rec) { if (e.pointerType === 'mouse') place(e); return; }
    const p = pos(e), dx = p.x - rec.x, dy = p.y - rec.y;
    rec.x = p.x; rec.y = p.y;
    if (P.size >= 2) {
      const s = snap();
      if (pinch && pinch.d > 0) { vp.zoomAt(s.mx, s.my, s.d / pinch.d); vp.pan(s.mx - pinch.mx, s.my - pinch.my); }
      pinch = s; onView();
    } else if (panning) { vp.pan(dx, dy); onView(); }
    else {
      place(e);
      const canDrag = rec.btn === 0 && (rec.type === 'mouse' || state.touchMode === 'tap');
      if (canDrag && !rec.drag && Math.hypot(p.x - rec.sx, p.y - rec.sy) > 8) {
        rec.drag = router.mgr.beginBox(router.vp.toWorld({ x: rec.sx, y: rec.sy }));
      }
    }
  });
  const end = (e, cancelled) => {
    const rec = P.get(e.pointerId); P.delete(e.pointerId);
    if (!rec || P.size > 0) return;
    if (!multi && !panning && !cancelled) {
      if (rec.btn === 2) router.secondaryClick();
      else if (rec.btn === 0 && (rec.type === 'mouse' || state.touchMode === 'tap')) {
        if (!rec.drag && Math.hypot(rec.x - rec.sx, rec.y - rec.sy) > 8 && router.mgr.boxStart === null) { /* drag that started on an object: ignore */ }
        else router.primaryClick();
      }
    }
    multi = false; panning = false; pinch = null;
  };
  cv.addEventListener('pointerup', e => end(e, false));
  cv.addEventListener('pointercancel', e => end(e, true));
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const p = pos(e); vp.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); onView();
  }, { passive: false });
}
