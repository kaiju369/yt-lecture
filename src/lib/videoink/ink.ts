import getStroke from "perfect-freehand";
import type { Stroke } from "./types";
import type { ContentRect } from "./geometry";

export { PEN_PRESETS, INK_COLORS, type PenPreset } from "./prefs";

export const HIGHLIGHTER_COLORS = ["#ffd166", "#7ec8ff", "#8ce99a", "#ff8a7a"];

function strokeOptions(stroke: Stroke, sizePx: number) {
  if (stroke.tool === "highlighter") {
    return {
      size: sizePx,
      thinning: 0,
      smoothing: 0.62,
      streamline: 0.32,
      simulatePressure: false,
      easing: (t: number) => t,
      last: true,
    };
  }
  const real = stroke.pressureMode === "real";
  // Points are already low-pass filtered and resampled by smooth.ts, so a low
  // streamline keeps the ink glued to the nib while staying wobble-free.
  return {
    size: sizePx,
    thinning: stroke.thinning ?? (real ? 0.55 : 0.35),
    smoothing: stroke.smoothing ?? 0.62,
    streamline: 0.3,
    simulatePressure: !real,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    last: true,
  };
}

export function strokeToPath2D(stroke: Stroke, rect: ContentRect): Path2D | null {
  if (stroke.points.length === 0) return null;
  const sizePx =
    Math.max(1, stroke.size * rect.height) * (stroke.tool === "highlighter" ? 3.2 : 1);
  const input = stroke.points.map((p) => [
    rect.left + p.x * rect.width,
    rect.top + p.y * rect.height,
    p.pressure,
  ]);
  const outline = getStroke(input, strokeOptions(stroke, sizePx));
  if (outline.length < 2) return null;
  const path = new Path2D();
  const first = outline[0]!;
  path.moveTo(first[0]!, first[1]!);
  // Quadratic segments through midpoints — removes the faceted look that plain
  // lineTo() leaves on the outline.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    path.quadraticCurveTo(a[0]!, a[1]!, (a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2);
  }
  path.closePath();
  return path;
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  rect: ContentRect,
) {
  const path = strokeToPath2D(stroke, rect);
  if (!path) return;
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.globalCompositeOperation =
    stroke.tool === "highlighter" ? "multiply" : "source-over";
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  rect: ContentRect,
) {
  for (const s of strokes) drawStroke(ctx, s, rect);
}

/** Hit test used by the stroke eraser. */
export function strokeHitsPoint(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const r = radius + stroke.size * 0.8;
  for (const p of stroke.points) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}
