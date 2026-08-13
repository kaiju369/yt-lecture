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
  for (let i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return l;
}

/** Uniform resample of a polyline into `n` points. */
function resamplePath(pts: Pt[], n: number): Pt[] {
  const total = pathLength(pts);
  if (total <= 0) return pts.slice();
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]!];
  let d = 0;
  let i = 1;
  let prev = pts[0]!;
  while (i < pts.length && out.length < n) {
    const cur = pts[i]!;
    const seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (d + seg >= step) {
      const t = (step - d) / (seg || 1e-9);
      const np = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(np);
      prev = np;
      d = 0;
    } else {
      d += seg;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out;
}

/** Shoelace area of a closed polygon. */
function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Corner detection on a closed, resampled polygon: turning angle over a
 * window, with non-maximum suppression.
 */
function findCorners(pts: Pt[], threshold = 0.75): number[] {
  const n = pts.length;
  const w = Math.max(2, Math.round(n / 16));
  const turn: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - w + n) % n]!;
    const b = pts[i]!;
    const c = pts[(i + w) % n]!;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    turn[i] = d;
  }
  const corners: number[] = [];
  const suppress = Math.max(2, Math.round(n / 10));
  for (let i = 0; i < n; i++) {
    const t = turn[i]!;
    if (t < threshold) continue;
    let isMax = true;
    for (let k = -suppress; k <= suppress; k++) {
      const j = (i + k + n) % n;
      if (turn[j]! > t) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    if (corners.some((c) => Math.min(Math.abs(c - i), n - Math.abs(c - i)) < suppress)) continue;
    corners.push(i);
  }
  return corners;
}

/**
 * Recognize a geometric intent from a completed freehand stroke.
 * Conservative enough that handwriting is never mangled, but reliable for
 * rectangles, triangles, ellipses, lines and arrows.
 */
export function recognizeShape(stroke: Stroke): Recognized | null {
  const raw = stroke.points.map((p) => ({ x: p.x, y: p.y }));
  if (raw.length < 6) return null;
  const box = bbox(raw);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const diag = Math.hypot(w, h);
  if (diag < 0.04) return null;

  const first = raw[0]!;
  const last = raw[raw.length - 1]!;
  const len = pathLength(raw);
  if (len < diag * 0.55) return null;

  const closeGap = Math.hypot(last.x - first.x, last.y - first.y);
  // Generous: people rarely close a hand-drawn rectangle exactly.
  const closed = closeGap < diag * 0.38 && len > diag * 1.6;

  /* --- open strokes: line / arrow --- */
  if (!closed) {
    let maxDev = 0;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const den = Math.hypot(dx, dy) || 1e-9;
    for (const p of raw) {
      const d = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / den;
      maxDev = Math.max(maxDev, d);
    }
    if (maxDev < diag * 0.07 && len < den * 1.25) {
      return { shape: "line", a: first, b: last };
    }

    const simp = simplify(raw, diag * 0.045);
    if (simp.length >= 4 && simp.length <= 7) {
      const segs = simp.slice(1).map((p, i) => ({
        p0: simp[i]!,
        p1: p,
        len: Math.hypot(p.x - simp[i]!.x, p.y - simp[i]!.y),
      }));
      const shaft = segs[0]!;
      const rest = segs.slice(1);
      const restLen = rest.reduce((s, r) => s + r.len, 0);
      if (shaft.len > diag * 0.5 && restLen < shaft.len * 0.7) {
        return { shape: "arrow", a: shaft.p0, b: shaft.p1 };
      }
    }
    return null;
  }

  /* --- closed strokes: rect / triangle / circle / ellipse --- */
  const poly = resamplePath(raw, 64);
  const area = polygonArea(poly);
  const bboxArea = Math.max(w * h, 1e-9);
  const fill = area / bboxArea;
  if (fill < 0.28) return null; // scribble / loopy handwriting

  const corners = findCorners(poly);
  const aBox = { x: box.x0, y: box.y0 };
  const bBox = { x: box.x1, y: box.y1 };

  // Rectangle: four dominant corners and a well-filled bounding box.
  if (corners.length === 4 && fill > 0.62) {
    return { shape: "rect", a: aBox, b: bBox };
  }
  // Triangle: three dominant corners, roughly half the bounding box filled.
  if (corners.length === 3 && fill > 0.3 && fill < 0.72) {
    return { shape: "triangle", a: aBox, b: bBox };
  }

  // Ellipse / circle: smooth outline (few corners) and near-π/4 fill.
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const radii = poly.map((p) =>
    Math.hypot((p.x - cx) / (w || 1e-9), (p.y - cy) / (h || 1e-9)),
  );
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = radii.reduce((a, r) => a + (r - mean) * (r - mean), 0) / radii.length;
  if (corners.length <= 1 && variance < 0.02 && fill > 0.6 && fill < 0.92) {
    const ratio = w / (h || 1e-9);
    return { shape: ratio > 0.82 && ratio < 1.22 ? "circle" : "ellipse", a: aBox, b: bBox };
  }

  // Squarish, very full box with slightly noisy corners is still a rectangle.
  if (fill > 0.82 && corners.length >= 3 && corners.length <= 6) {
    return { shape: "rect", a: aBox, b: bBox };
  }
  return null;
}
