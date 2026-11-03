// Maps world (mm, Y up) <-> screen (px, Y down). Only these numbers change on zoom/pan/resize.
export class Viewport {
  constructor() { this.scale = 0.2; this.cx = 0; this.cy = 0; this.w = 300; this.h = 300; this.dpr = 1; }
  resize(w, h, dpr = 1) { this.w = w; this.h = h; this.dpr = dpr; }
  toScreen(p) { return { x: (p.x - this.cx) * this.scale + this.w / 2, y: this.h / 2 - (p.y - this.cy) * this.scale }; }
  toWorld(s) { return { x: (s.x - this.w / 2) / this.scale + this.cx, y: (this.h / 2 - s.y) / this.scale + this.cy }; }
  pan(dx, dy) { this.cx -= dx / this.scale; this.cy += dy / this.scale; }
  zoomAt(sx, sy, factor) {
    const wp = this.toWorld({ x: sx, y: sy });
    this.scale = Math.min(200, Math.max(0.0005, this.scale * factor));
    this.cx = wp.x - (sx - this.w / 2) / this.scale;
    this.cy = wp.y + (sy - this.h / 2) / this.scale;
  }
  fit(b, margin = 0.85) {
    const bw = Math.max(b.maxx - b.minx, 1), bh = Math.max(b.maxy - b.miny, 1);
    this.scale = Math.min(this.w / bw, this.h / bh) * margin;
    this.cx = (b.minx + b.maxx) / 2; this.cy = (b.miny + b.maxy) / 2;
  }
}
