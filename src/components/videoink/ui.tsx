import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  FileX2,
  Highlighter,
  Lasso,
  Maximize,
  Minus,
  MonitorUp,
  MousePointer2,
  PaintBucket,
  Wand2,
  Pause,
  Pen,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ACTIONS,
  defaultKeyMap,
  eventCombo,
  findConflict,
  prettyCombo,
  type ActionId,
  type KeyMap,
} from "@/lib/videoink/shortcuts";
import { PEN_PRESETS, type Prefs } from "@/lib/videoink/prefs";
import { formatTime, type Page, type ShapeKind, type TextObject, type ToolId } from "@/lib/videoink/types";
import type { ExportFormat } from "@/lib/videoink/export";

/* ------------------------------ toolbar ------------------------------ */

const TOOL_BUTTONS: { tool: ToolId; action: ActionId; icon: typeof Pen; label: string }[] = [
  { tool: "select", action: "tool.select", icon: MousePointer2, label: "Select" },
  { tool: "pen", action: "tool.pen", icon: Pen, label: "Pen" },
  { tool: "highlighter", action: "tool.highlighter", icon: Highlighter, label: "Highlighter" },
  { tool: "eraser", action: "tool.eraser", icon: Eraser, label: "Eraser" },
  { tool: "text", action: "tool.text", icon: Type, label: "Text" },
  { tool: "line", action: "tool.line", icon: Minus, label: "Line" },
  { tool: "arrow", action: "tool.arrow", icon: ArrowUpRight, label: "Arrow" },
  { tool: "shape", action: "tool.shape", icon: Square, label: "Shape" },
  { tool: "lasso", action: "tool.lasso", icon: Lasso, label: "Lasso" },
];


export const SHAPE_KINDS: ShapeKind[] = [
  "line",
  "arrow",
  "doubleArrow",
  "rect",
  "roundRect",
  "square",
  "circle",
  "ellipse",
  "triangle",
  "rightTriangle",
  "diamond",
  "star",
  "polygon",
  "arc",
  "bracket",
  "curlyBracket",
  "callout",
];

interface ToolbarProps {
  tool: ToolId;
  setTool: (t: ToolId) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  keys: KeyMap;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenColor: () => void;
  captureActive: boolean;
  onToggleCapture: () => void;
  canDeletePage: boolean;
  onDeletePage: () => void;
}


function Hotkey({ combo }: { combo?: string | undefined }) {
  if (!combo) return null;
  return (
    <kbd className="ml-1 rounded bg-foreground/10 px-1 text-[10px] leading-4 text-muted-foreground">
      {prettyCombo(combo)}
    </kbd>
  );
}

export function InkToolbar(p: ToolbarProps) {
  return (
    <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur md:flex-wrap md:overflow-visible">
      {TOOL_BUTTONS.map((t) => (
        <Button
          key={t.tool}
          size="sm"
          variant={p.tool === t.tool ? "secondary" : "ghost"}
          title={`${t.label} (${prettyCombo(p.keys[t.action] ?? "")})`}
          onClick={() => p.setTool(t.tool)}
          className="gap-1 px-2"
        >
          <t.icon className="size-4" />
          <Hotkey combo={p.keys[t.action]} />
        </Button>
      ))}

      <span className="mx-1 h-6 w-px bg-border" />

      {p.tool === "shape" && (
        <Select value={p.prefs.shapeKind} onValueChange={(v) => p.setPrefs({ shapeKind: v as ShapeKind })}>
          <SelectTrigger className="h-8 w-[128px]" aria-label="Shape">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHAPE_KINDS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1">
        {p.prefs.favoriteColors.map((c) => (
          <button
            key={c}
            aria-label={`Colour ${c}`}
            onClick={() =>
              p.setPrefs(
                p.tool === "highlighter" ? { highlighterColor: c } : { penColor: c },
              )
            }
            className={cn(
              "size-5 rounded-full border transition-transform",
              (p.tool === "highlighter" ? p.prefs.highlighterColor : p.prefs.penColor) === c
                ? "scale-110 border-ring ring-2 ring-ring/50"
                : "border-border/70",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <Button size="sm" variant="ghost" onClick={p.onOpenColor} className="gap-1 px-2">
          <Circle className="size-4" />
          <Hotkey combo={p.keys["customColor"]} />
        </Button>
      </div>

      <span className="mx-1 h-6 w-px bg-border" />

      {PEN_PRESETS.map((preset, i) => (
        <Button
          key={preset.id}
          size="sm"
          variant={
            Math.abs(
              (p.tool === "highlighter" ? p.prefs.highlighterSize : p.prefs.penSize) - preset.size,
            ) < 1e-6
              ? "secondary"
              : "ghost"
          }
          className="gap-1 px-2"
          onClick={() =>
            p.setPrefs(
              p.tool === "highlighter"
                ? { highlighterSize: preset.size }
                : { penSize: preset.size },
            )
          }
        >
          {preset.label}
          <Hotkey combo={p.keys[`size.${["fine", "medium", "bold"][i]}` as ActionId]} />
        </Button>
      ))}

      <span className="mx-1 h-6 w-px bg-border" />

      <Button
        size="sm"
        variant={p.prefs.shapeFill ? "secondary" : "ghost"}
        className="shrink-0 gap-1 px-2"
        title="Fill shapes"
        onClick={() => p.setPrefs({ shapeFill: !p.prefs.shapeFill })}
      >
        <PaintBucket className="size-4" />
        <Hotkey combo={p.keys["shape.fill"]} />
      </Button>
      <Button
        size="sm"
        variant={p.prefs.recognize ? "secondary" : "ghost"}
        className="shrink-0 gap-1 px-2"
        title={
          p.prefs.recognize
            ? "Shape recognition on — freehand rectangles, circles, lines and arrows snap to shapes"
            : "Turn on shape recognition"
        }
        onClick={() => p.setPrefs({ recognize: !p.prefs.recognize })}
      >
        <Wand2 className="size-4" />
      </Button>
      <Button
        size="sm"
        variant={p.captureActive ? "secondary" : "ghost"}
        className="gap-1 px-2"
        title={p.captureActive ? "Screen capture on — click to stop" : "Enable screen capture for real frames"}
        onClick={p.onToggleCapture}
      >
        <MonitorUp className="size-4" />
        <Hotkey combo={p.keys["capture"]} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1 px-2 text-destructive"
        title="Delete this page"
        disabled={!p.canDeletePage}
        onClick={p.onDeletePage}
      >
        <FileX2 className="size-4" />
        <Hotkey combo={p.keys["page.delete"]} />
      </Button>

      <span className="mx-1 h-6 w-px bg-border" />



      <Button size="sm" variant="ghost" disabled={!p.canUndo} onClick={p.onUndo} className="gap-1 px-2">
        <Undo2 className="size-4" />
        <Hotkey combo={p.keys["undo"]} />
      </Button>
      <Button size="sm" variant="ghost" disabled={!p.canRedo} onClick={p.onRedo} className="gap-1 px-2">
        <Redo2 className="size-4" />
        <Hotkey combo={p.keys["redo"]} />
      </Button>
      <Button size="sm" variant="ghost" onClick={p.onClear} className="gap-1 px-2" title="Clear page">
        <Trash2 className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={p.onCancel} className="px-2" title="Cancel (Esc)">
        <X className="size-4" />
      </Button>
      <Button size="sm" onClick={p.onSave} className="gap-1">
        <Save className="size-4" /> Save
        <Hotkey combo={p.keys["save"]} />
      </Button>
    </div>
  );
}

/* --------------------------- tool indicator --------------------------- */

export function ToolIndicator({
  tool,
  prefs,
  keys,
  flash,
}: {
  tool: ToolId;
  prefs: Prefs;
  keys: KeyMap;
  flash: string | null;
}) {
  const size = tool === "highlighter" ? prefs.highlighterSize : prefs.penSize;
  const preset = PEN_PRESETS.find((p) => Math.abs(p.size - size) < 1e-6)?.label ?? "Custom";
  const combo = keys[(`tool.${tool}` as ActionId)] ?? "";
  return (
    <div className="pointer-events-none rounded-md bg-background/85 px-2.5 py-1 text-[11px] leading-tight text-muted-foreground">
      <span className="font-medium text-foreground">{flash ?? tool}</span>
      {" · "}
      {preset}
      {" · "}
      <span
        className="inline-block size-2.5 translate-y-[1px] rounded-full"
        style={{
          backgroundColor: tool === "highlighter" ? prefs.highlighterColor : prefs.penColor,
        }}
      />
      {combo ? ` · ${prettyCombo(combo)}` : ""}
    </div>
  );
}

/* ---------------------------- text overlay ---------------------------- */

export function TextEditorOverlay({
  obj,
  rect,
  onChange,
  onDone,
}: {
  obj: TextObject;
  rect: { left: number; top: number; width: number; height: number };
  onChange: (patch: Partial<TextObject>) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      value={obj.text}
      onChange={(e) => onChange({ text: e.target.value })}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
      className="absolute resize-none rounded border border-ring/70 bg-background/80 p-1 outline-none"
      style={{
        left: rect.left + obj.x * rect.width,
        top: rect.top + obj.y * rect.height,
        width: obj.w * rect.width,
        height: obj.h * rect.height,
        fontSize: obj.fontSize * rect.height,
        fontFamily: obj.fontFamily,
        fontWeight: obj.bold ? 700 : 400,
        fontStyle: obj.italic ? "italic" : "normal",
        textDecoration: obj.underline ? "underline" : "none",
        textAlign: obj.align,
        color: obj.color,
        lineHeight: 1.28,
      }}
      placeholder="Type…"
    />
  );
}

/* ------------------------------ library ------------------------------ */

export type LibraryView = Prefs["libraryView"];
export type LibrarySort = Prefs["librarySort"];

export interface LibraryProps {
  pages: Page[];
  currentSourceKey: string | null;
  activeId: string | null;
  selection: string[];
  view: LibraryView;
  sort: LibrarySort;
  compact?: boolean;
  onView: (v: LibraryView) => void;
  onSort: (s: LibrarySort) => void;
  onSelectionChange: (ids: string[]) => void;
  onOpen: (p: Page) => void;
  onEnlarge: (p: Page) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onReorder: (orderedIds: string[]) => void;
  onExport: (ids: string[]) => void;
  onAddBlank: () => void;
}

const FILTERS = [
  "all",
  "current",
  "annotations",
  "blank",
  "custom",
  "snapshot",
  "noSnapshot",
  "recent",
] as const;
type Filter = (typeof FILTERS)[number];

export function PageLibrary(p: LibraryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const dragId = useRef<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...p.pages];
    switch (p.sort) {
      case "creation":
        return list.sort((a, b) => a.createdRank - b.createdRank);
      case "newest":
        return list.sort((a, b) => b.createdAt - a.createdAt);
      case "oldest":
        return list.sort((a, b) => a.createdAt - b.createdAt);
      case "timestamp":
        return list.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      case "modified":
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      default:
        return list.sort((a, b) => a.currentOrder - b.currentOrder);
    }
  }, [p.pages, p.sort]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dayAgo = Date.now() - 86400000;
    return sorted.filter((a) => {
      if (filter === "current" && a.sourceKey !== p.currentSourceKey) return false;
      if (filter === "annotations" && a.type !== "video") return false;
      if (filter === "blank" && a.type !== "blank") return false;
      if (filter === "custom" && a.type !== "custom") return false;
      if (filter === "snapshot" && a.snapshot?.status !== "captured") return false;
      if (filter === "noSnapshot" && a.snapshot?.status === "captured") return false;
      if (filter === "recent" && a.updatedAt < dayAgo) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.videoTitle ?? "").toLowerCase().includes(q) ||
        (a.notes ?? "").toLowerCase().includes(q) ||
        new Date(a.createdAt).toLocaleDateString().includes(q) ||
        (a.timestamp != null && formatTime(a.timestamp).includes(q))
      );
    });
  }, [sorted, query, filter, p.currentSourceKey]);

  const toggle = (id: string, additive: boolean) => {
    const has = p.selection.includes(id);
    if (additive) {
      p.onSelectionChange(has ? p.selection.filter((x) => x !== id) : [...p.selection, id]);
    } else {
      p.onSelectionChange(has && p.selection.length === 1 ? [] : [id]);
    }
  };

  const gridClass =
    p.view === "smallGrid"
      ? "grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] content-start gap-2"
      : p.view === "largeGrid"
        ? "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] content-start gap-3"
        : "flex flex-col gap-1.5";

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg italic tracking-tight">Pages</h2>
        <span className="text-xs text-muted-foreground">{p.pages.length} local</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={p.onAddBlank}>
          + Blank
        </Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title, video, notes, time"
        aria-label="Search pages"
        className="h-8"
      />

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={p.sort} onValueChange={(v) => p.onSort(v as LibrarySort)}>
          <SelectTrigger className="h-7 w-[124px] text-xs" aria-label="Sort pages">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Current order</SelectItem>
            <SelectItem value="creation">Creation order</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="timestamp">Timestamp</SelectItem>
            <SelectItem value="modified">Modified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={p.view} onValueChange={(v) => p.onView(v as LibraryView)}>
          <SelectTrigger className="h-7 w-[112px] text-xs" aria-label="View mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smallGrid">Small grid</SelectItem>
            <SelectItem value="largeGrid">Large grid</SelectItem>
            <SelectItem value="list">List</SelectItem>
            <SelectItem value="detail">Detail</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => p.onSelectionChange(items.map((i) => i.id))}>
          All
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => p.onSelectionChange([])}>
          None
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() =>
            p.onSelectionChange(items.filter((i) => !p.selection.includes(i.id)).map((i) => i.id))
          }
        >
          Invert
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() =>
            p.onSelectionChange(
              items.filter((i) => i.sourceKey === p.currentSourceKey).map((i) => i.id),
            )
          }
        >
          This video
        </Button>
      </div>

      {p.selection.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/70 bg-muted/40 p-1.5 text-xs">
          <span className="px-1">{p.selection.length} selected</span>
          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => p.onExport(p.selection)}>
            Export
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => p.onDuplicate(p.selection)}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => p.onDelete(p.selection)}>
            Delete
          </Button>
        </div>
      )}

      <div className={cn("-mr-1 flex-1 overflow-y-auto pr-1", gridClass)}>
        {items.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            No pages yet. Press <kbd className="rounded bg-muted px-1">A</kbd> while watching to
            freeze a frame, or add a blank page.
          </p>
        )}
        {items.map((a, i) => (
          <article
            key={a.id}
            draggable
            onDragStart={() => (dragId.current = a.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragId.current;
              dragId.current = null;
              if (!from || from === a.id) return;
              const ids = items.map((x) => x.id).filter((x) => x !== from);
              ids.splice(i, 0, from);
              p.onReorder(ids);
            }}
            className={cn(
              "group cursor-pointer rounded-lg border border-border/70 bg-card p-2 transition-colors hover:border-ring/60",
              p.activeId === a.id && "border-ring ring-1 ring-ring/40",
              p.selection.includes(a.id) && "bg-primary/10",
              p.view === "list" || p.view === "detail" ? "flex gap-2.5" : "flex flex-col",
            )}
            onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggle(a.id, true) : p.onOpen(a))}
          >
            <div
              className={cn(
                "relative shrink-0 overflow-hidden rounded bg-muted",
                p.view === "list" ? "w-20" : p.view === "detail" ? "w-28" : "w-full",
              )}
              style={{ aspectRatio: String(a.aspectRatio || 16 / 9) }}
            >
              {a.thumbnail || a.snapshot?.dataUrl ? (
                <img
                  src={a.thumbnail ?? a.snapshot?.dataUrl}
                  alt={a.title}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {a.type === "video" ? "no frame" : "blank"}
                </div>
              )}
              <span className="absolute bottom-0.5 right-0.5 rounded bg-background/85 px-1 text-[10px] tabular-nums">
                {a.timestamp != null ? formatTime(a.timestamp) : a.type}
              </span>
              <span className="absolute left-0.5 top-0.5 rounded bg-background/85 px-1 text-[10px]">
                #{a.createdRank}
              </span>
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className="truncate text-sm font-medium">{a.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {a.objects.length} object{a.objects.length === 1 ? "" : "s"} ·{" "}
                {new Date(a.updatedAt).toLocaleDateString()}
              </p>
              {p.view === "detail" && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.videoTitle ?? "—"} · {a.snapshot?.status ?? "unavailable"}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onEnlarge(a);
                  }}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant={p.selection.includes(a.id) ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(a.id, true);
                  }}
                >
                  {p.selection.includes(a.id) ? "Deselect" : "Select"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  title="Duplicate page"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onDuplicate([a.id]);
                  }}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onDelete([a.id]);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- export dialog --------------------------- */

export interface ExportRequest {
  scope: "current" | "selected" | "all";
  order: "manual" | "creation" | "timestamp";
  format: ExportFormat;
  filename: string;
  includeDate: boolean;
  includePageNumbers: boolean;
}

export function ExportDialog({
  open,
  onOpenChange,
  defaultFilename,
  defaultFormat,
  counts,
  progress,
  onExport,
  onCancelExport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFilename: string;
  defaultFormat: ExportFormat;
  counts: { current: number; selected: number; all: number };
  progress: string | null;
  onExport: (req: ExportRequest) => void;
  onCancelExport: () => void;
}) {
  const [req, setReq] = useState<ExportRequest>({
    scope: counts.selected ? "selected" : "all",
    order: "manual",
    format: defaultFormat,
    filename: defaultFilename,
    includeDate: true,
    includePageNumbers: true,
  });
  useEffect(() => {
    if (open) setReq((r) => ({ ...r, filename: defaultFilename, format: defaultFormat }));
  }, [open, defaultFilename, defaultFormat]);

  const pageCount = counts[req.scope];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export pages</DialogTitle>
          <DialogDescription>Rendered locally on this device.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            {(["current", "selected", "all"] as const).map((s) => (
              <Button
                key={s}
                variant={req.scope === s ? "secondary" : "outline"}
                onClick={() => setReq({ ...req, scope: s })}
                disabled={counts[s] === 0}
              >
                {s} ({counts[s]})
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Order</Label>
              <Select value={req.order} onValueChange={(v) => setReq({ ...req, order: v as ExportRequest["order"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Current order</SelectItem>
                  <SelectItem value="creation">Creation order</SelectItem>
                  <SelectItem value="timestamp">Timestamp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Format</Label>
              <Select value={req.format} onValueChange={(v) => setReq({ ...req, format: v as ExportFormat })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="zip">ZIP</SelectItem>
                  <SelectItem value="json">JSON (portable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs" htmlFor="vi-filename">Filename</Label>
            <Input
              id="vi-filename"
              value={req.filename}
              onChange={(e) => setReq({ ...req, filename: e.target.value })}
            />
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={req.includeDate} onCheckedChange={(v) => setReq({ ...req, includeDate: v })} />
              Add date
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={req.includePageNumbers}
                onCheckedChange={(v) => setReq({ ...req, includePageNumbers: v })}
              />
              Page numbers
            </label>
          </div>

          <div className="rounded-md border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
            <div>Pages: {pageCount}</div>
            <div>Order: {req.order}</div>
            <div>
              File: {req.filename}
              {req.includeDate ? `_${new Date().toISOString().slice(0, 10)}` : ""}.
              {req.format === "jpeg" ? "jpg/zip" : req.format}
            </div>
            {progress && <div className="mt-1 text-foreground">{progress}</div>}
          </div>
        </div>

        <DialogFooter>
          {progress ? (
            <Button variant="outline" onClick={onCancelExport}>
              Cancel export
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => onExport(req)} disabled={pageCount === 0}>
                Export
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- settings dialog -------------------------- */

export function SettingsDialog({
  open,
  onOpenChange,
  prefs,
  setPrefs,
  keys,
  setKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  keys: KeyMap;
  setKeys: (k: KeyMap) => void;
}) {
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (["Shift", "Control", "Meta", "Alt"].includes(e.key)) return;
      const combo = eventCombo(e);
      const clash = findConflict(keys, capturing, combo);
      if (clash) {
        setConflict(
          `Shortcut conflict: ${prettyCombo(combo)} is already used by "${
            ACTIONS.find((a) => a.id === clash)?.label ?? clash
          }". Press another key, or click Replace.`,
        );
        (window as unknown as { __viPending?: [ActionId, string, ActionId] }).__viPending = [
          capturing,
          combo,
          clash,
        ];
        return;
      }
      setKeys({ ...keys, [capturing]: combo });
      setConflict(null);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, keys, setKeys]);

  const replace = () => {
    const pending = (window as unknown as { __viPending?: [ActionId, string, ActionId] }).__viPending;
    if (!pending) return;
    const [id, combo, clash] = pending;
    setKeys({ ...keys, [clash]: "", [id]: combo });
    setConflict(null);
    setCapturing(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Shortcuts, ink behaviour and export defaults.</DialogDescription>
        </DialogHeader>

        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Ink</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Custom pen width ({(prefs.penSize * 1000).toFixed(1)})</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[prefs.penSize * 1000]}
                  min={1}
                  max={40}
                  step={0.1}
                  onValueChange={([v]) => setPrefs({ penSize: (v ?? 8) / 1000 })}
                />
                <Input
                  type="number"
                  className="w-20"
                  step={0.1}
                  value={Number((prefs.penSize * 1000).toFixed(1))}
                  onChange={(e) => setPrefs({ penSize: Number(e.target.value) / 1000 })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Highlighter width ({(prefs.highlighterSize * 1000).toFixed(1)})</Label>
              <Slider
                value={[prefs.highlighterSize * 1000]}
                min={2}
                max={60}
                step={0.5}
                onValueChange={([v]) => setPrefs({ highlighterSize: (v ?? 12) / 1000 })}
              />
            </div>
            <div>
              <Label className="text-xs">Highlighter opacity ({prefs.highlighterOpacity.toFixed(2)})</Label>
              <Slider
                value={[prefs.highlighterOpacity * 100]}
                min={10}
                max={90}
                onValueChange={([v]) => setPrefs({ highlighterOpacity: (v ?? 35) / 100 })}
              />
            </div>
            <div>
              <Label className="text-xs">Shape / line width ({(prefs.shapeSize * 1000).toFixed(1)})</Label>
              <Slider
                value={[prefs.shapeSize * 1000]}
                min={1}
                max={30}
                step={0.1}
                onValueChange={([v]) => setPrefs({ shapeSize: (v ?? 5) / 1000 })}
              />
            </div>
            <div>
              <Label className="text-xs">Pressure sensitivity</Label>
              <Select value={prefs.pressure} onValueChange={(v) => setPrefs({ pressure: v as Prefs["pressure"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["off", "low", "medium", "high"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Eraser size ({(prefs.eraserSize * 1000).toFixed(0)})</Label>
              <Slider
                value={[prefs.eraserSize * 1000]}
                min={4}
                max={80}
                onValueChange={([v]) => setPrefs({ eraserSize: (v ?? 20) / 1000 })}
              />
            </div>
            <div>
              <Label className="text-xs">Default shape</Label>
              <Select value={prefs.shapeKind} onValueChange={(v) => setPrefs({ shapeKind: v as ShapeKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHAPE_KINDS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Line style</Label>
              <Select value={prefs.lineStyle} onValueChange={(v) => setPrefs({ lineStyle: v as Prefs["lineStyle"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={prefs.recognize} onCheckedChange={(v) => setPrefs({ recognize: v })} />
              Shape recognition
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={prefs.shapeFill} onCheckedChange={(v) => setPrefs({ shapeFill: v })} />
              Fill shapes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={prefs.touchDrawing} onCheckedChange={(v) => setPrefs({ touchDrawing: v })} />
              Touch drawing
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={prefs.captureReminder} onCheckedChange={(v) => setPrefs({ captureReminder: v })} />
              Capture reminder
            </label>
          </div>
        </section>

        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Export defaults</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Format</Label>
              <Select value={prefs.exportFormat} onValueChange={(v) => setPrefs({ exportFormat: v as Prefs["exportFormat"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pdf", "png", "jpeg", "zip", "json"].map((f) => (
                    <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Filename template</Label>
              <Input
                value={prefs.filenameTemplate}
                onChange={(e) => setPrefs({ filenameTemplate: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Keyboard shortcuts</h3>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setKeys(defaultKeyMap())}
            >
              Restore defaults
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const blob = new Blob([JSON.stringify(keys, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "videoink-shortcuts.json";
                a.click();
              }}
            >
              Export
            </Button>
            <label className="cursor-pointer text-sm underline">
              Import
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setKeys({ ...defaultKeyMap(), ...(JSON.parse(await f.text()) as KeyMap) });
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </label>
          </div>

          {conflict && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs">
              <span>{conflict}</span>
              <Button size="sm" variant="secondary" className="ml-auto h-7" onClick={replace}>
                Replace
              </Button>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-md border border-border/70">
            <table className="w-full text-sm">
              <tbody>
                {ACTIONS.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-1">{a.label}</td>
                    <td className="px-2 py-1 text-muted-foreground">{a.group}</td>
                    <td className="px-2 py-1">
                      <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {keys[a.id] ? prettyCombo(keys[a.id]!) : "—"}
                      </kbd>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        size="sm"
                        variant={capturing === a.id ? "secondary" : "ghost"}
                        className="h-7"
                        onClick={() => {
                          setConflict(null);
                          setCapturing(a.id);
                        }}
                      >
                        {capturing === a.id ? "Press a key…" : "Edit"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- video controls --------------------------- */

export interface VideoControlsProps {
  playing: boolean;
  current: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  disabled?: boolean;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onSkip: (delta: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onRate: (r: number) => void;
  onFullscreen: () => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoControls(p: VideoControlsProps) {
  return (
    <div className="pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
      <Button
        size="sm"
        variant="secondary"
        className="size-8 shrink-0 p-0"
        onClick={p.onPlayPause}
        disabled={p.disabled}
        aria-label={p.playing ? "Pause" : "Play"}
      >
        {p.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="size-8 shrink-0 p-0"
        onClick={() => p.onSkip(-10)}
        disabled={p.disabled}
        aria-label="Back 10 seconds"
      >
        <RotateCcw className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="size-8 shrink-0 p-0"
        onClick={() => p.onSkip(10)}
        disabled={p.disabled}
        aria-label="Forward 10 seconds"
      >
        <RotateCw className="size-4" />
      </Button>

      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatTime(p.current)}
      </span>
      <Slider
        className="min-w-16 flex-1"
        value={[Math.min(p.current, p.duration || 0)]}
        min={0}
        max={Math.max(p.duration, 1)}
        step={0.1}
        aria-label="Seek"
        onValueChange={([v]) => p.onSeek(v ?? 0)}
      />
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatTime(p.duration)}
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="size-8 shrink-0 p-0"
        onClick={p.onMute}
        aria-label={p.muted ? "Unmute" : "Mute"}
      >
        {p.muted || p.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </Button>
      <Slider
        className="hidden w-20 shrink-0 sm:flex"
        value={[p.muted ? 0 : p.volume * 100]}
        min={0}
        max={100}
        aria-label="Volume"
        onValueChange={([v]) => p.onVolume((v ?? 100) / 100)}
      />

      <Select value={String(p.rate)} onValueChange={(v) => p.onRate(Number(v))}>
        <SelectTrigger className="h-8 w-[70px] shrink-0 text-xs" aria-label="Playback speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RATES.map((r) => (
            <SelectItem key={r} value={String(r)}>
              {r}x
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="ghost"
        className="size-8 shrink-0 p-0"
        onClick={p.onFullscreen}
        aria-label="Fullscreen"
      >
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}
