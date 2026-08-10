import { useMemo, useState } from "react";
import { ImageOff, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatTime, type Annotation } from "@/lib/videoink/types";
import { cn } from "@/lib/utils";

interface Props {
  annotations: Annotation[];
  currentSourceKey: string | null;
  activeId: string | null;
  onOpen: (a: Annotation) => void;
  onDelete: (id: string) => void;
}

type Filter = "all" | "current" | "snapshot";

export function AnnotationLibrary({
  annotations,
  currentSourceKey,
  activeId,
  onOpen,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return annotations.filter((a) => {
      if (filter === "current" && a.sourceKey !== currentSourceKey) return false;
      if (filter === "snapshot" && a.snapshot.status !== "captured") return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        formatTime(a.timestamp).includes(q)
      );
    });
  }, [annotations, query, filter, currentSourceKey]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h2 className="font-display text-lg italic tracking-tight">Annotations</h2>
        <p className="text-xs text-muted-foreground">
          {annotations.length} saved locally on this device
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or timestamp"
          className="pl-8"
          aria-label="Search annotations"
        />
      </div>

      <div className="flex gap-1">
        {(
          [
            ["all", "All"],
            ["current", "This video"],
            ["snapshot", "Has frame"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={filter === id ? "secondary" : "ghost"}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            No annotations yet. Press <kbd className="rounded bg-muted px-1">A</kbd> while
            watching to freeze the frame and write.
          </p>
        )}
        {items.map((a) => (
          <article
            key={a.id}
            className={cn(
              "group cursor-pointer rounded-lg border border-border/70 bg-card p-2 transition-colors hover:border-ring/60",
              activeId === a.id && "border-ring ring-1 ring-ring/40",
            )}
            onClick={() => onOpen(a)}
          >
            <div className="flex gap-2.5">
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-muted">
                {a.snapshot.dataUrl ? (
                  <img
                    src={a.snapshot.dataUrl}
                    alt={`Annotation at ${formatTime(a.timestamp)}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-4" />
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 rounded bg-background/85 px-1 text-[10px] tabular-nums">
                  {formatTime(a.timestamp)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {a.strokes.length} stroke{a.strokes.length === 1 ? "" : "s"} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.snapshot.status === "captured"
                    ? "Frame captured"
                    : a.snapshot.status === "reference-only"
                      ? "Reference image only"
                      : "Frame snapshot unavailable"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete annotation"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(a.id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
