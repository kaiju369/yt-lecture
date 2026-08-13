import type { InkPoint } from "./types";

/**
 * Ink smoothing pipeline modelled on the feel of OneNote / Xournal++ / rnote:
 *   live low-pass filter  ->  distance gate  ->  arc-length resample  ->  Chaikin
 * The result is a dense, evenly spaced polyline that perfect-freehand can turn
 * into a clean tapered outline without visible wobble or corner artefacts.
 */

const MIN_STEP = 0.0018; // normalized units between accepted input samples

export function pointDistance(a: InkPoint, b: InkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Exponential low-pass with a velocity-aware cutoff (one-euro style). */
export class InkFilter {
  private last: InkPoint | null = null;
  private lastRaw: InkPoint | null = null;

  constructor(private strength = 0.5) {}

  reset() {
    this.last = null;
    this.lastRaw = null;
  }

  /** Returns the filtered point, or null when the sample is too close to keep. */
  push(p: InkPoint, force = false): InkPoint | null {
    if (!this.last || !this.lastRaw) {
      this.last = { ...p };
      this.lastRaw = { ...p };
      return this.last;
    }
    const speed = pointDistance(p, this.lastRaw);
    if (!force && speed < MIN_STEP) return null;
    this.lastRaw = { ...p };
    // Fast strokes need less smoothing (keeps them responsive); slow strokes
    // need more (kills stylus jitter).
    const base = 0.2 + 0.7 * (1 - Math.min(1, this.strength));
    const alpha = Math.min(1, base + speed * 45);
    const out: InkPoint = {
      x: this.last.x + alpha * (p.x - this.last.x),
      y: this.last.y + alpha * (p.y - this.last.y),
      pressure: this.last.pressure + 0.35 * (p.pressure - this.last.pressure),
    };
    this.last = out;
    return out;
  }
}

/** Remove duplicate / near-duplicate samples. */
export function dedupe(points: InkPoint[], eps = 1e-5): InkPoint[] {
  const out: InkPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || pointDistance(last, p) > eps) out.push(p);
  }
  return out;
}

/** Uniform arc-length resampling with linear pressure interpolation. */
export function resample(points: InkPoint[], spacing: number): InkPoint[] {
  if (points.length < 2 || spacing <= 0) return points.slice();
  const out: InkPoint[] = [{ ...points[0]! }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    let seg = pointDistance(a, b);
    if (seg <= 0) continue;
    let t = 0;
    while (carry + seg >= spacing) {
      const need = (spacing - carry) / seg;
      t += need * (1 - t);
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      });
      seg = pointDistance(out[out.length - 1]!, b);
      carry = 0;
    }
    carry += seg;
  }
  const last = points[points.length - 1]!;
  if (pointDistance(out[out.length - 1]!, last) > spacing * 0.35) out.push({ ...last });
  return out;
}

/** Chaikin corner cutting; endpoints preserved. */
export function chaikin(points: InkPoint[], iterations = 1): InkPoint[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const next: InkPoint[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push(
        {
          x: a.x * 0.75 + b.x * 0.25,
          y: a.y * 0.75 + b.y * 0.25,
          pressure: a.pressure * 0.75 + b.pressure * 0.25,
        },
        {
          x: a.x * 0.25 + b.x * 0.75,
          y: a.y * 0.25 + b.y * 0.75,
          pressure: a.pressure * 0.25 + b.pressure * 0.75,
        },
      );
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

/** Moving-average pass over pressure only, so width changes stay gradual. */
export function smoothPressure(points: InkPoint[], window = 4): InkPoint[] {
  if (points.length < 3) return points;
  return points.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - window; k <= i + window; k++) {
      const q = points[k];
      if (!q) continue;
      sum += q.pressure;
      n++;
    }
    return { ...p, pressure: n ? sum / n : p.pressure };
  });
}

/**
 * Final commit-time smoothing. `amount` is 0..1 (prefs.smoothing).
 */
export function smoothStroke(points: InkPoint[], amount = 0.5): InkPoint[] {
  const clean = dedupe(points);
  if (clean.length < 3) return clean;
  const spacing = 0.0022 + 0.0035 * amount;
  const resampled = resample(clean, spacing);
  const iterations = amount > 0.66 ? 2 : amount > 0.15 ? 1 : 0;
  const smoothed = iterations ? chaikin(resampled, iterations) : resampled;
  const capped =
    smoothed.length > 1400 ? resample(smoothed, spacing * (smoothed.length / 1400)) : smoothed;
  return smoothPressure(capped, 3);
}
