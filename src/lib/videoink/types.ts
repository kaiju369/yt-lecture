export const SCHEMA_VERSION = 2;

export type SourceType = "youtube" | "file" | "url";

/** Drawing / editing tools. */
export type ToolId =
  | "select"
  | "lasso"
  | "move"
  | "pen"
  | "highlighter"
  | "eraser"
  | "freehandEraser"
  | "rectEraser"
  | "circleEraser"
  | "text"
  | "line"
  | "arrow"
  | "shape";

/** Legacy alias kept so older modules keep compiling. */
export type ToolKind = "pen" | "highlighter" | "eraser";

export type ShapeKind =
  | "line"
  | "arrow"
  | "doubleArrow"
  | "rect"
  | "roundRect"
  | "square"
  | "circle"
  | "ellipse"
  | "triangle"
  | "rightTriangle"
  | "diamond"
  | "star"
  | "polygon"
  | "arc"
  | "bracket"
  | "curlyBracket"
  | "callout";

export type LineStyle = "solid" | "dashed" | "dotted";
export type CapStyle = "none" | "arrow" | "filledArrow";

export type SnapshotStatus =
  | "captured"
  | "reference-only"
  | "unavailable"
  | "pending"
  | "failed";

export interface InkPoint {
  /** normalized 0..1 relative to the visible video content rect */
  x: number;
  y: number;
  pressure: number;
}

interface ObjectBase {
  id: string;
  /** z-order within the page; higher paints later */
  z: number;
  createdAt: number;
}

export interface Stroke extends ObjectBase {
  kind: "stroke";
  tool: "pen" | "highlighter";
  color: string;
  opacity: number;
  /** normalized size: fraction of the video content height */
  size: number;
  pressureMode: "real" | "simulated";
  /** perfect-freehand thinning (0..1); derived from the pressure setting */
  thinning?: number | undefined;
  /** extra outline smoothing (0..1) */
  smoothing?: number | undefined;
  points: InkPoint[];
}

export interface ShapeObject extends ObjectBase {
  kind: "shape";
  shape: ShapeKind;
  /** normalized bounding corners (a may be > b; render handles it) */
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: string;
  fill?: string | undefined;
  opacity: number;
  size: number;
  lineStyle: LineStyle;
  startCap: CapStyle;
  endCap: CapStyle;
  sides?: number | undefined;
}

export interface TextObject extends ObjectBase {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** font size as a fraction of content height */
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  background: string;
  border: string;
  opacity: number;
}

export type PageObject = Stroke | ShapeObject | TextObject;

export interface SnapshotInfo {
  status: SnapshotStatus;
  /** data URL of flattened frame + ink (or reference image) */
  dataUrl?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  captureMethod?: "html5-video" | "youtube-thumbnail" | "ink-only" | "none" | undefined;
  /**
   * True when the ink is already flattened into `dataUrl` (legacy pages and
   * screen grabs). When false the snapshot is a clean background frame and the
   * objects must be drawn on top at render/export time.
   */
  inkBaked?: boolean | undefined;
}

export type PageType = "video" | "blank" | "custom";

/** The single canonical document every view references. */
export interface Page {
  id: string;
  schemaVersion: number;
  type: PageType;
  /** permanent, never changes once assigned */
  createdRank: number;
  /** manual ordering, changed by drag & drop */
  currentOrder: number;
  title: string;
  notes?: string | undefined;
  sourceType?: SourceType | undefined;
  sourceKey?: string | undefined;
  sourceUrl?: string | undefined;
  youtubeVideoId?: string | undefined;
  videoTitle?: string | undefined;
  timestamp?: number | undefined;
  duration?: number | undefined;
  aspectRatio: number;
  objects: PageObject[];
  snapshot: SnapshotInfo;
  /** small cached preview, regenerated on save */
  thumbnail?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

/** Legacy record shape (schema v1) kept for migration. */
export interface Annotation {
  id: string;
  schemaVersion: number;
  sourceType: SourceType;
  sourceKey: string;
  sourceUrl?: string | undefined;
  youtubeVideoId?: string | undefined;
  title: string;
  timestamp: number;
  duration: number;
  videoAspectRatio: number;
  strokes: Stroke[];
  snapshot: SnapshotInfo;
  createdAt: number;
  updatedAt: number;
}

export interface RecoveryDoc {
  id: "active";
  pageId?: string | undefined;
  title: string;
  sourceType?: SourceType | undefined;
  sourceKey?: string | undefined;
  youtubeVideoId?: string | undefined;
  timestamp: number;
  duration: number;
  videoAspectRatio: number;
  objects: PageObject[];
  updatedAt: number;
}

export interface VideoRecord {
  key: string;
  title: string;
  sourceType: SourceType;
  youtubeVideoId?: string | undefined;
  lastPosition: number;
  duration: number;
  updatedAt: number;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}

export function uid(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
