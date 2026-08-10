export const SCHEMA_VERSION = 1;

export type SourceType = "youtube" | "file" | "url";

export type ToolKind = "pen" | "highlighter" | "eraser";

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

export interface Stroke {
  id: string;
  tool: ToolKind;
  color: string;
  opacity: number;
  /** normalized size: fraction of the video content height */
  size: number;
  pressureMode: "real" | "simulated";
  points: InkPoint[];
}

export interface SnapshotInfo {
  status: SnapshotStatus;
  /** data URL of flattened frame + ink (or reference image) */
  dataUrl?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  captureMethod?: "html5-video" | "youtube-thumbnail" | "ink-only" | "none" | undefined;
}

export interface Annotation {
  id: string;
  schemaVersion: number;
  sourceType: SourceType;
  sourceKey: string;
  sourceUrl?: string | undefined;
  youtubeVideoId?: string | undefined;
  title: string;
  /** high precision seconds */
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
  title: string;
  sourceType: SourceType;
  sourceKey: string;
  youtubeVideoId?: string | undefined;
  timestamp: number;
  duration: number;
  videoAspectRatio: number;
  strokes: Stroke[];
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
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}
