// On-screen CAD mouse. Arrows move the cursor (hold to repeat), L/R call the same router as touch.
export function attachVirtualMouse(root, router) {
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const hold = (btn, fn) => {
    let t1 = null, t2 = null, n = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); n = 0; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); btn.setPointerCapture(e.pointerId); fn(0);
      t1 = setTimeout(() => { t2 = setInterval(() => fn(++n), 50); }, 350);
    });
    ['pointerup', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  };
  root.querySelectorAll('[data-dir]').forEach(btn => {
    const [dx, dy] = dirs[btn.dataset.dir];
    hold(btn, n => {
      const k = router.speedIdx === 0 ? 1 : 1 + Math.min(n / 15, 3);   // accelerate while held (not in Fine)
      router.moveBy(dx * router.stepPx * k, dy * router.stepPx * k);
    });
  });
  const act = {
    L: () => router.primaryClick(),
    R: () => router.secondaryClick(),
    speed: b => { b.textContent = router.cycleSpeed(); },
    min: () => root.classList.toggle('min'),
  };
  root.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('pointerdown', e => {
    e.preventDefault(); act[btn.dataset.act](btn);
  }));
  // Drag the grip to reposition.
  const grip = root.querySelector('.grip'); let off = null;
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const r = root.getBoundingClientRect(); off = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  grip.addEventListener('pointermove', e => {
    if (!off) return;
    const pr = root.parentElement.getBoundingClientRect();
    root.style.right = 'auto'; root.style.bottom = 'auto';
    root.style.left = Math.max(0, Math.min(pr.width - root.offsetWidth, e.clientX - pr.left - off.x)) + 'px';
    root.style.top = Math.max(0, Math.min(pr.height - root.offsetHeight, e.clientY - pr.top - off.y)) + 'px';
  });
  ['pointerup', 'pointercancel'].forEach(ev => grip.addEventListener(ev, () => { off = null; }));
}
