import type { CapStyle, LineStyle, ShapeKind, ToolId } from "./types";

export interface PenPreset {
  id: string;
  label: string;
  size: number; // fraction of content height
}

export const PEN_PRESETS: PenPreset[] = [
  { id: "fine", label: "Fine", size: 0.004 },
  { id: "medium", label: "Medium", size: 0.008 },
  { id: "bold", label: "Bold", size: 0.016 },
];

export const INK_COLORS = [
  "#f5f1e8",
  "#ffd166",
  "#7ec8ff",
  "#ff8a7a",
  "#8ce99a",
  "#c79bff",
  "#111111",
];

export type PressureLevel = "off" | "low" | "medium" | "high";

export interface ToolPreset {
  id: string;
  name: string;
  tool: ToolId;
  color: string;
  size: number;
  opacity: number;
  pressure: PressureLevel;
}

export interface Prefs {
  tool: ToolId;
  penSize: number;
  penColor: string;
  highlighterSize: number;
  highlighterColor: string;
  highlighterOpacity: number;
  shapeSize: number;
  shapeKind: ShapeKind;
  lineStyle: LineStyle;
  startCap: CapStyle;
  endCap: CapStyle;
  shapeFill: boolean;
  eraserMode: "stroke" | "freehand" | "rect" | "circle";
  eraserSize: number;
  pressure: PressureLevel;
  smoothing: number;
  recognize: boolean;
  touchDrawing: boolean;
  text: {
    fontSize: number;
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    color: string;
    background: string;
    border: string;
  };
  recentColors: string[];
  favoriteColors: string[];
  presets: ToolPreset[];
  libraryView: "smallGrid" | "largeGrid" | "list" | "detail";
  librarySort: "creation" | "newest" | "oldest" | "manual" | "timestamp" | "modified";
  exportFormat: "png" | "jpeg" | "pdf" | "zip" | "json";
  filenameTemplate: string;
  captureReminder: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  tool: "pen",
  penSize: PEN_PRESETS[1]!.size,
  penColor: INK_COLORS[0]!,
  highlighterSize: 0.012,
  highlighterColor: "#ffd166",
  highlighterOpacity: 0.35,
  shapeSize: 0.005,
  shapeKind: "rect",
  lineStyle: "solid",
  startCap: "none",
  endCap: "none",
  shapeFill: false,
  eraserMode: "stroke",
  eraserSize: 0.02,
  pressure: "medium",
  smoothing: 0.5,
  recognize: false,
  touchDrawing: true,
  text: {
    fontSize: 0.05,
    fontFamily: "Inter, system-ui, sans-serif",
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    color: "#f5f1e8",
    background: "transparent",
    border: "transparent",
  },
  recentColors: [],
  favoriteColors: INK_COLORS.slice(0, 5),
  presets: [
    {
      id: "p-lecture",
      name: "Lecture pen",
      tool: "pen",
      color: "#f5f1e8",
      size: 0.008,
      opacity: 1,
      pressure: "high",
    },
    {
      id: "p-highlight",
      name: "Highlight",
      tool: "highlighter",
      color: "#ffd166",
      size: 0.014,
      opacity: 0.35,
      pressure: "off",
    },
    {
      id: "p-diagram",
      name: "Diagram arrow",
      tool: "arrow",
      color: "#7ec8ff",
      size: 0.005,
      opacity: 1,
      pressure: "off",
    },
  ],
  libraryView: "smallGrid",
  librarySort: "manual",
  exportFormat: "pdf",
  filenameTemplate: "{videoTitle}_{date}_{type}",
  captureReminder: true,
};

const KEY = "videoink.prefs.v1";

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed, text: { ...DEFAULT_PREFS.text, ...parsed.text } };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function pressureFactor(level: PressureLevel, pressure: number): number {
  if (level === "off") return 1;
  const amount = level === "low" ? 0.25 : level === "medium" ? 0.5 : 0.85;
  return 1 - amount + amount * (pressure * 2);
}

/**
 * How strongly stylus pressure modulates stroke width (perfect-freehand
 * `thinning`). Applied per point, not as a whole-stroke scale factor.
 */
export function pressureThinning(level: PressureLevel): number {
  switch (level) {
    case "off":
      return 0;
    case "low":
      return 0.25;
    case "high":
      return 0.72;
    default:
      return 0.48;
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120) || "VideoInk";
}

export function applyTemplate(
  template: string,
  vars: { videoTitle: string; date: string; type: string },
): string {
  return sanitizeFilename(
    template
      .replace(/\{videoTitle\}/g, vars.videoTitle)
      .replace(/\{date\}/g, vars.date)
      .replace(/\{type\}/g, vars.type),
  );
}
