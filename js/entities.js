// Entity factories. Rectangles are closed polylines flagged rect:true (same as AutoCAD).
export const makeLine = (p1, p2) => ({ type: 'line', p1: { ...p1 }, p2: { ...p2 } });
export const makeCircle = (c, r) => ({ type: 'circle', center: { ...c }, radius: r });
export const makeRect = (a, b) => ({
  type: 'polyline', rect: true, closed: true,
  vertices: [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }].map(v => ({ ...v, bulge: 0 })),
});
