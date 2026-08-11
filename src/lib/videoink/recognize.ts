import type { Pt } from "./objects";
import type { ShapeKind, Stroke } from "./types";

/** Perpendicular-distance polyline simplification (Douglas–Peucker). */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const den = Math.hypot(dx, dy) || 1e-9;
    const d = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / den;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [first, last];
  return [
    ...simplify(pts.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(pts.slice(idx), tol),
  ];
}

export interface Recognized {
  shape: ShapeKind;
  a: Pt;
  b: Pt;
}

function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return l;
}

function angleBetween(a: Pt, b: Pt, c: Pt) {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(a2 - a1);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Recognize a geometric intent from a completed freehand stroke.
 * Deliberately conservative: returns null unless the stroke is a clear match,
 * so handwriting is never mangled.
 */
export function recognizeShape(stroke: Stroke): Recognized | null {
  const pts = stroke.points.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 6) return null;
  const box = bbox(pts);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const diag = Math.hypot(w, h);
  if (diag < 0.04) return null;

  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const len = pathLength(pts);
  if (len < diag * 0.6) return null;
  const closeGap = Math.hypot(last.x - first.x, last.y - first.y);
  const closed = closeGap < diag * 0.25;

  const simp = simplify(pts, diag * 0.045);

  /* --- open strokes: line / arrow --- */
  if (!closed) {
    // straightness
    let maxDev = 0;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const den = Math.hypot(dx, dy) || 1e-9;
    for (const p of pts) {
      const d = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / den;
      maxDev = Math.max(maxDev, d);
    }
    if (maxDev < diag * 0.06 && len < den * 1.2) {
      return { shape: "line", a: first, b: last };
    }

    // arrow: long shaft then two short back-swept segments
    if (simp.length >= 4 && simp.length <= 6) {
      const segs = simp.slice(1).map((p, i) => ({
        p0: simp[i]!,
        p1: p,
        len: Math.hypot(p.x - simp[i]!.x, p.y - simp[i]!.y),
      }));
      const shaft = segs[0]!;
      const rest = segs.slice(1);
      const restLen = rest.reduce((s, r) => s + r.len, 0);
      const sharp = rest.some(
        (_, i) => i > 0 && angleBetween(rest[i - 1]!.p0, rest[i]!.p0, rest[i]!.p1) > 1.3,
      );
      if (shaft.len > diag * 0.5 && restLen < shaft.len * 0.65 && sharp) {
        return { shape: "arrow", a: shaft.p0, b: shaft.p1 };
      }
    }
    return null;
  }

  /* --- closed strokes: circle / rect / triangle --- */
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const radii = pts.map((p) => Math.hypot((p.x - cx) / (w || 1e-9), (p.y - cy) / (h || 1e-9)));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance =
    radii.reduce((a, r) => a + (r - mean) * (r - mean), 0) / radii.length;
  if (variance < 0.014) {
    const ratio = w / (h || 1e-9);
    return {
      shape: ratio > 0.82 && ratio < 1.22 ? "circle" : "ellipse",
      a: { x: box.x0, y: box.y0 },
      b: { x: box.x1, y: box.y1 },
    };
  }

  const corners = simplify(pts, diag * 0.07);
  const n = corners.length - 1; // last repeats the first for closed shapes
  if (n === 4 || n === 5) {
    return { shape: "rect", a: { x: box.x0, y: box.y0 }, b: { x: box.x1, y: box.y1 } };
  }
  if (n === 3) {
    return { shape: "triangle", a: { x: box.x0, y: box.y0 }, b: { x: box.x1, y: box.y1 } };
  }
  return null;
}
