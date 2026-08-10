import { Eraser, Highlighter, Pen, Redo2, Save, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INK_COLORS, PEN_PRESETS } from "@/lib/videoink/ink";
import type { ToolKind } from "@/lib/videoink/types";
import { cn } from "@/lib/utils";

interface Props {
  tool: ToolKind;
  setTool: (t: ToolKind) => void;
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (s: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const tools: { id: ToolKind; icon: typeof Pen; label: string }[] = [
  { id: "pen", icon: Pen, label: "Pen" },
  { id: "highlighter", icon: Highlighter, label: "Highlighter" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
];

export function AnnotationToolbar({
  tool,
  setTool,
  color,
  setColor,
  size,
  setSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onCancel,
}: Props) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
      {tools.map((t) => (
        <Button
          key={t.id}
          size="icon"
          variant={tool === t.id ? "secondary" : "ghost"}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTool(t.id)}
        >
          <t.icon className="size-4" />
        </Button>
      ))}

      <span className="mx-1 h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        {INK_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Ink colour ${c}`}
            onClick={() => setColor(c)}
            className={cn(
              "size-5 rounded-full border transition-transform",
              color === c ? "scale-110 border-ring ring-2 ring-ring/50" : "border-border/70",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <span className="mx-1 h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        {PEN_PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={Math.abs(size - p.size) < 0.0001 ? "secondary" : "ghost"}
            onClick={() => setSize(p.size)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <span className="mx-1 h-6 w-px bg-border" />

      <Button size="icon" variant="ghost" disabled={!canUndo} onClick={onUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
        <Undo2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" disabled={!canRedo} onClick={onRedo} aria-label="Redo" title="Redo">
        <Redo2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onClear} aria-label="Clear ink" title="Clear">
        <Trash2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onCancel} aria-label="Cancel annotation" title="Cancel (Esc)">
        <X className="size-4" />
      </Button>
      <Button size="sm" onClick={onSave} className="gap-1.5">
        <Save className="size-4" /> Save <kbd className="ml-1 rounded bg-background/30 px-1 text-[10px]">S</kbd>
      </Button>
    </div>
  );
}
