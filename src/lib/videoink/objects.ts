import type { ContentRect } from "./geometry";
import { strokeToPath2D } from "./ink";
import type {
  CapStyle,
  PageObject,
  ShapeKind,
  ShapeObject,
  Stroke,
  TextObject,
} from "./types";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Pt = { x: number; y: number };

const norm = (a: Pt, b: Pt): Box => ({
  x0: Math.min(a.x, b.x),
  y0: Math.min(a.y, b.y),
  x1: Math.max(a.x, b.x),
  y1: Math.max(a.y, b.y),
});

/* ------------------------------------------------------------------ */
/* shape geometry — normalized space, returns sub-paths                */
/* ------------------------------------------------------------------ */

export interface SubPath {
  pts: Pt[];
  closed: boolean;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return out;
}

function roundRectPts(b: Box, r: number): Pt[] {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 8; i++) {
      const t = from + (i / 8) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(t) * rad, y: cy + Math.sin(t) * rad });
    }
  };
  corner(b.x1 - rad, b.y0 + rad, -Math.PI / 2);
  corner(b.x1 - rad, b.y1 - rad, 0);
  corner(b.x0 + rad, b.y1 - rad, Math.PI / 2);
  corner(b.x0 + rad, b.y0 + rad, Math.PI);
  return out;
}

export function shapeGeometry(shape: ShapeKind, a: Pt, b: Pt): SubPath[] {
  const box = norm(a, b);
  const { x0, y0, x1, y1 } = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;

  switch (shape) {
    case "line":
    case "arrow":
    case "doubleArrow":
      return [{ pts: [a, b], closed: false }];
    case "rect":
      return [
        {
          pts: [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
          closed: true,
        },
      ];
    case "square": {
      const s = Math.min(Math.abs(w), Math.abs(h)) / 2;
      return [
        {
          pts: [
            { x: cx - s, y: cy - s },
            { x: cx + s, y: cy - s },
            { x: cx + s, y: cy + s },
            { x: cx - s, y: cy + s },
          ],
          closed: true,
        },
      ];
    }
    case "roundRect":
      return [{ pts: roundRectPts(box, Math.min(w, h) * 0.18), closed: true }];
    case "circle": {
      const r = Math.min(w, h) / 2;
      return [{ pts: ellipsePts(cx, cy, r, r), closed: true }];
    }
    case "ellipse":
      return [{ pts: ellipsePts(cx, cy, w / 2, h / 2), closed: true }];
    case "triangle":
      return [
        {
          pts: [
            { x: cx, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
          closed: true,
        },
      ];
    case "rightTriangle":
      return [
        {
          pts: [
            { x: x0, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
          closed: true,
        },
      ];
    case "diamond":
      return [
        {
          pts: [
            { x: cx, y: y0 },
            { x: x1, y: cy },
            { x: cx, y: y1 },
            { x: x0, y: cy },
          ],
          closed: true,
        },
      ];
    case "star": {
      const pts: Pt[] = [];
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < 10; i++) {
        const t = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const f = i % 2 === 0 ? 1 : 0.42;
        pts.push({ x: cx + Math.cos(t) * rx * f, y: cy + Math.sin(t) * ry * f });
      }
      return [{ pts, closed: true }];
    }
    case "polygon": {
      const pts: Pt[] = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
        pts.push({ x: cx + (Math.cos(t) * w) / 2, y: cy + (Math.sin(t) * h) / 2 });
      }
      return [{ pts, closed: true }];
    }
    case "arc": {
      const pts: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = Math.PI + (i / 40) * Math.PI;
        pts.push({ x: cx + (Math.cos(t) * w) / 2, y: y1 + Math.sin(t) * h });
      }
      return [{ pts, closed: false }];
    }
    case "bracket":
      return [
        {
          pts: [
            { x: x1, y: y0 },
            { x: x0, y: y0 },
            { x: x0, y: y1 },
            { x: x1, y: y1 },
          ],
          closed: false,
        },
      ];
    case "curlyBracket": {
      const pts: Pt[] = [];
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = y0 + t * h;
        // two lobes meeting at a middle spike
        const k = Math.sin(t * Math.PI * 2 - Math.PI / 2);
        const spike = 1 - Math.abs(t - 0.5) * 2;
        pts.push({ x: x0 + (w * (0.5 + 0.5 * k) * 0.5 + w * spike * 0.5) * 0.9, y });
      }
      return [{ pts, closed: false }];
    }
    case "callout": {
      const bodyBottom = y1 - h * 0.22;
      return [
        {
          pts: [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: bodyBottom },
            { x: x0 + w * 0.34, y: bodyBottom },
            { x: x0 + w * 0.18, y: y1 },
            { x: x0 + w * 0.2, y: bodyBottom },
            { x: x0, y: bodyBottom },
          ],
          closed: true,
        },
      ];
    }
    default:
      return [{ pts: [a, b], closed: false }];
  }
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

const toPx = (p: Pt, rect: ContentRect) => ({
  x: rect.left + p.x * rect.width,
  y: rect.top + p.y * rect.height,
});

function drawCap(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  cap: CapStyle,
  widthPx: number,
) {
  if (cap === "none") return;
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.max(widthPx * 3.2, 6);
  const spread = 0.42;
  const p1 = {
    x: to.x - Math.cos(ang - spread) * len,
    y: to.y - Math.sin(ang - spread) * len,
  };
  const p2 = {
    x: to.x - Math.cos(ang + spread) * len,
    y: to.y - Math.sin(ang + spread) * len,
  };
  ctx.beginPath();
  if (cap === "filledArrow") {
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  s: ShapeObject,
  rect: ContentRect,
) {
  const widthPx = Math.max(1, s.size * rect.height);
  const paths = shapeGeometry(s.shape, s.a, s.b);
  ctx.save();
  ctx.globalAlpha = s.opacity;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.fill || s.color;
  ctx.lineWidth = widthPx;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (s.lineStyle === "dashed") ctx.setLineDash([widthPx * 3.5, widthPx * 2.5]);
  else if (s.lineStyle === "dotted") ctx.setLineDash([0.1, widthPx * 2.2]);
  else ctx.setLineDash([]);

  for (const sp of paths) {
    if (sp.pts.length < 2) continue;
    ctx.beginPath();
    const first = toPx(sp.pts[0]!, rect);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < sp.pts.length; i++) {
      const p = toPx(sp.pts[i]!, rect);
      ctx.lineTo(p.x, p.y);
    }
    if (sp.closed) ctx.closePath();
    if (s.fill && sp.closed) {
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.fillStyle = s.color;
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);
  const a = toPx(s.a, rect);
  const b = toPx(s.b, rect);
  const endCap =
    s.shape === "arrow" || s.shape === "doubleArrow" ? s.endCap || "filledArrow" : s.endCap;
  const startCap = s.shape === "doubleArrow" ? s.startCap || "filledArrow" : s.startCap;
  drawCap(ctx, a, b, endCap, widthPx);
  drawCap(ctx, b, a, startCap, widthPx);
  ctx.restore();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  t: TextObject,
  rect: ContentRect,
) {
  const x = rect.left + t.x * rect.width;
  const y = rect.top + t.y * rect.height;
  const w = t.w * rect.width;
  const h = t.h * rect.height;
  const fs = Math.max(6, t.fontSize * rect.height);
  ctx.save();
  ctx.globalAlpha = t.opacity;
  if (t.background && t.background !== "transparent") {
    ctx.fillStyle = t.background;
    ctx.fillRect(x, y, w, h);
  }
  if (t.border && t.border !== "transparent") {
    ctx.strokeStyle = t.border;
    ctx.lineWidth = Math.max(1, fs * 0.06);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = t.color;
  ctx.textBaseline = "top";
  ctx.font = `${t.italic ? "italic " : ""}${t.bold ? "700 " : "400 "}${fs}px ${t.fontFamily}`;
  const pad = fs * 0.3;
  const lines = wrapText(ctx, t.text, Math.max(4, w - pad * 2));
  const lh = fs * 1.28;
  lines.forEach((line, i) => {
    const tw = ctx.measureText(line).width;
    const lx =
      t.align === "center"
        ? x + (w - tw) / 2
        : t.align === "right"
          ? x + w - pad - tw
          : x + pad;
    const ly = y + pad + i * lh;
    ctx.fillText(line, lx, ly);
    if (t.underline) {
      ctx.fillRect(lx, ly + fs * 1.05, tw, Math.max(1, fs * 0.06));
    }
  });
  ctx.restore();
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: PageObject,
  rect: ContentRect,
) {
  if (o.kind === "stroke") {
    const path = strokeToPath2D(o, rect);
    if (!path) return;
    ctx.save();
    ctx.globalAlpha = o.opacity;
    ctx.globalCompositeOperation = o.tool === "highlighter" ? "multiply" : "source-over";
    ctx.fillStyle = o.color;
    ctx.fill(path);
    ctx.restore();
    return;
  }
  if (o.kind === "shape") return drawShape(ctx, o, rect);
  return drawText(ctx, o, rect);
}

export function renderObjects(
  ctx: CanvasRenderingContext2D,
  objects: PageObject[],
  rect: ContentRect,
) {
  for (const o of [...objects].sort((a, b) => a.z - b.z)) drawObject(ctx, o, rect);
}

/* ------------------------------------------------------------------ */
/* bounds & hit testing                                                */
/* ------------------------------------------------------------------ */

export function objectBounds(o: PageObject): Box {
  if (o.kind === "stroke") {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of o.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const pad = o.size * (o.tool === "highlighter" ? 1.8 : 0.6);
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }
  if (o.kind === "shape") {
    const b = norm(o.a, o.b);
    const pad = o.size;
    return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
  }
  return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
}

export function unionBounds(objs: PageObject[]): Box | null {
  if (!objs.length) return null;
  return objs.reduce<Box>(
    (acc, o) => {
      const b = objectBounds(o);
      return {
        x0: Math.min(acc.x0, b.x0),
        y0: Math.min(acc.y0, b.y0),
        x1: Math.max(acc.x1, b.x1),
        y1: Math.max(acc.y1, b.y1),
      };
    },
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );
}

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

export function outlinePoints(o: PageObject): Pt[] {
  if (o.kind === "stroke") return o.points;
  if (o.kind === "shape") return shapeGeometry(o.shape, o.a, o.b).flatMap((s) => s.pts);
  const b = objectBounds(o);
  return [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ];
}

export function hitTest(o: PageObject, x: number, y: number, tol: number): boolean {
  const b = objectBounds(o);
  if (x < b.x0 - tol || x > b.x1 + tol || y < b.y0 - tol || y > b.y1 + tol) return false;
  if (o.kind === "text") return true;
  const pts = outlinePoints(o);
  const r = tol + (o.kind === "stroke" ? o.size * 0.8 : o.size * 0.8);
  if (pts.length === 1) return Math.hypot(pts[0]!.x - x, pts[0]!.y - y) <= r;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment({ x, y }, pts[i - 1]!, pts[i]!) <= r) return true;
  }
  if (o.kind === "shape" && o.fill) return true;
  return false;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function objectsInPolygon(objs: PageObject[], poly: Pt[]): PageObject[] {
  if (poly.length < 3) return [];
  return objs.filter((o) => {
    const pts = outlinePoints(o);
    const hits = pts.filter((p) => pointInPolygon(p, poly)).length;
    return hits > 0 && hits >= Math.min(pts.length, Math.ceil(pts.length * 0.5));
  });
}

export function objectsInBox(objs: PageObject[], box: Box): PageObject[] {
  return objs.filter((o) => {
    const b = objectBounds(o);
    return b.x0 >= box.x0 && b.x1 <= box.x1 && b.y0 >= box.y0 && b.y1 <= box.y1;
  });
}

export function objectsIntersectingBox(objs: PageObject[], box: Box): PageObject[] {
  return objs.filter((o) => {
    const b = objectBounds(o);
    return !(b.x1 < box.x0 || b.x0 > box.x1 || b.y1 < box.y0 || b.y0 > box.y1);
  });
}

/* ------------------------------------------------------------------ */
/* transforms                                                          */
/* ------------------------------------------------------------------ */

export function translateObject<T extends PageObject>(o: T, dx: number, dy: number): T {
  if (o.kind === "stroke") {
    return { ...o, points: o.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  }
  if (o.kind === "shape") {
    return {
      ...o,
      a: { x: o.a.x + dx, y: o.a.y + dy },
      b: { x: o.b.x + dx, y: o.b.y + dy },
    };
  }
  return { ...o, x: o.x + dx, y: o.y + dy };
}

export function scaleObject<T extends PageObject>(o: T, from: Box, to: Box): T {
  const sx = (to.x1 - to.x0) / Math.max(1e-6, from.x1 - from.x0);
  const sy = (to.y1 - to.y0) / Math.max(1e-6, from.y1 - from.y0);
  const map = (p: Pt): Pt => ({
    x: to.x0 + (p.x - from.x0) * sx,
    y: to.y0 + (p.y - from.y0) * sy,
  });
  const avg = (Math.abs(sx) + Math.abs(sy)) / 2;
  if (o.kind === "stroke") {
    return {
      ...o,
      size: o.size * avg,
      points: o.points.map((p) => ({ ...p, ...map(p) })),
    };
  }
  if (o.kind === "shape") {
    return { ...o, a: map(o.a), b: map(o.b), size: o.size * avg };
  }
  const p0 = map({ x: o.x, y: o.y });
  return {
    ...o,
    x: p0.x,
    y: p0.y,
    w: o.w * sx,
    h: o.h * sy,
    fontSize: o.fontSize * sy,
  };
}

/* ------------------------------------------------------------------ */
/* erasing                                                             */
/* ------------------------------------------------------------------ */

export interface EraseResult {
  removed: PageObject[];
  added: Stroke[];
}

/** Whole-object eraser: any object touched by the point is removed. */
export function eraseObjectsAt(
  objs: PageObject[],
  x: number,
  y: number,
  radius: number,
): PageObject[] {
  return objs.filter((o) => hitTest(o, x, y, radius));
}

/**
 * Freehand (partial) eraser: strokes are split around the erased region,
 * other object kinds are removed whole.
 */
export function erasePartial(
  objs: PageObject[],
  x: number,
  y: number,
  radius: number,
): EraseResult {
  const removed: PageObject[] = [];
  const added: Stroke[] = [];
  for (const o of objs) {
    if (o.kind !== "stroke") {
      if (hitTest(o, x, y, radius)) removed.push(o);
      continue;
    }
    const near = o.points.some((p) => Math.hypot(p.x - x, p.y - y) <= radius);
    if (!near) continue;
    removed.push(o);
    let run: typeof o.points = [];
    const flush = () => {
      if (run.length >= 2) {
        added.push({
          ...o,
          id: `${o.id}-${added.length}-${Math.random().toString(36).slice(2, 7)}`,
          points: run,
        });
      }
      run = [];
    };
    for (const p of o.points) {
      if (Math.hypot(p.x - x, p.y - y) <= radius) flush();
      else run.push(p);
    }
    flush();
  }
  return { removed, added };
}

export function nextZ(objs: PageObject[]): number {
  return objs.reduce((m, o) => Math.max(m, o.z), 0) + 1;
}
