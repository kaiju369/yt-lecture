import { useCallback, useEffect, useRef } from "react";
import type { ContentRect } from "@/lib/videoink/geometry";
import { drawStroke, drawStrokes, strokeHitsPoint } from "@/lib/videoink/ink";
import type { InkPoint, Stroke, ToolKind } from "@/lib/videoink/types";
import { uid } from "@/lib/videoink/types";

interface Props {
  rect: ContentRect;
  width: number;
  height: number;
  strokes: Stroke[];
  tool: ToolKind;
  color: string;
  size: number;
  opacity: number;
  enabled: boolean;
  touchDrawing: boolean;
  onCommit: (stroke: Stroke) => void;
  onErase: (ids: string[]) => void;
}

export function InkCanvas({
  rect,
  width,
  height,
  strokes,
  tool,
  color,
  size,
  opacity,
  enabled,
  touchDrawing,
  onCommit,
  onErase,
}: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ id: number; points: InkPoint[]; pressureMode: "real" | "simulated" } | null>(null);
  const raf = useRef<number | null>(null);

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(width * dpr));
      const h = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    [width, height],
  );

  // Redraw committed strokes when the document or geometry changes.
  useEffect(() => {
    const ctx = setupCanvas(baseRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawStrokes(ctx, strokes, rect);
  }, [strokes, rect, width, height, setupCanvas]);

  useEffect(() => {
    setupCanvas(liveRef.current);
  }, [setupCanvas]);

  const toNormalized = (e: React.PointerEvent): InkPoint => {
    const canvas = liveRef.current!;
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) - rect.left) / rect.width;
    const y = ((e.clientY - box.top) - rect.top) / rect.height;
    const hasPressure = e.pointerType === "pen" && e.pressure > 0 && e.pressure !== 0.5;
    return { x, y, pressure: hasPressure ? e.pressure : 0.5 };
  };

  const renderLive = () => {
    raf.current = null;
    const ctx = setupCanvas(liveRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const d = drawing.current;
    if (!d || d.points.length === 0) return;
    drawStroke(
      ctx,
      {
        id: "live",
        tool,
        color,
        opacity,
        size,
        pressureMode: d.pressureMode,
        points: d.points,
      },
      rect,
    );
  };

  const scheduleRender = () => {
    if (raf.current == null) raf.current = requestAnimationFrame(renderLive);
  };

  const eraseAt = (p: InkPoint) => {
    const radius = Math.max(size * 1.5, 0.012);
    const hit = strokes.filter((s) => strokeHitsPoint(s, p.x, p.y, radius));
    if (hit.length) onErase(hit.map((s) => s.id));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "touch" && !touchDrawing) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toNormalized(e);
    if (tool === "eraser") {
      drawing.current = { id: e.pointerId, points: [], pressureMode: "simulated" };
      eraseAt(p);
      return;
    }
    drawing.current = {
      id: e.pointerId,
      points: [p],
      pressureMode: e.pointerType === "pen" && e.pressure > 0 ? "real" : "simulated",
    };
    scheduleRender();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    if (tool === "eraser") {
      eraseAt(toNormalized(e));
      return;
    }
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    if (events.length > 1) {
      const canvas = liveRef.current!;
      const box = canvas.getBoundingClientRect();
      for (const ev of events) {
        d.points.push({
          x: (ev.clientX - box.left - rect.left) / rect.width,
          y: (ev.clientY - box.top - rect.top) / rect.height,
          pressure: d.pressureMode === "real" && ev.pressure > 0 ? ev.pressure : 0.5,
        });
      }
    } else {
      d.points.push(toNormalized(e));
    }
    scheduleRender();
  };

  const finish = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    const ctx = setupCanvas(liveRef.current);
    ctx?.clearRect(0, 0, width, height);
    if (tool === "eraser" || d.points.length === 0) return;
    onCommit({
      id: uid(),
      tool,
      color,
      opacity,
      size,
      pressureMode: d.pressureMode,
      points: d.points,
    });
  };

  return (
    <div className="absolute inset-0" style={{ touchAction: enabled ? "none" : "auto" }}>
      <canvas ref={baseRef} className="pointer-events-none absolute inset-0" />
      <canvas
        ref={liveRef}
        className="absolute inset-0"
        style={{
          pointerEvents: enabled ? "auto" : "none",
          cursor: enabled ? (tool === "eraser" ? "cell" : "crosshair") : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
      />
    </div>
  );
}
