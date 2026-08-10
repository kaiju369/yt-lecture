import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  FileVideo,
  Maximize2,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Player, type PlayerHandle, type PlayerSource } from "@/components/videoink/Player";
import { InkCanvas } from "@/components/videoink/InkCanvas";
import { AnnotationToolbar } from "@/components/videoink/AnnotationToolbar";
import { AnnotationLibrary } from "@/components/videoink/AnnotationLibrary";
import { computeContentRect } from "@/lib/videoink/geometry";
import { PEN_PRESETS, INK_COLORS } from "@/lib/videoink/ink";
import { parseYouTubeId } from "@/lib/videoink/youtube";
import { captureSnapshot, ScreenCaptureSession } from "@/lib/videoink/capture";
import {
  clearRecovery,
  deleteAnnotation,
  getVideo,
  listAnnotations,
  loadRecovery,
  putAnnotation,
  putVideo,
  saveRecovery,
} from "@/lib/videoink/db";
import {
  formatTime,
  uid,
  type Annotation,
  type Stroke,
  type ToolKind,
  SCHEMA_VERSION,
} from "@/lib/videoink/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideoInk — Handwrite notes over frozen lecture frames" },
      {
        name: "description",
        content:
          "Watch lectures, press A to freeze the frame, handwrite with your stylus, press S to save. Timestamped ink annotations stored locally, no account needed.",
      },
      { property: "og:title", content: "VideoInk — Ink notes on lecture video" },
      {
        property: "og:description",
        content:
          "Freeze any lecture frame, write with your stylus, and keep timestamped annotations locally on your device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VideoInk,
});

type Command =
  | { type: "add"; stroke: Stroke }
  | { type: "erase"; strokes: Stroke[] }
  | { type: "clear"; strokes: Stroke[] };

function VideoInk() {
  const playerRef = useRef<PlayerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ScreenCaptureSession | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [source, setSource] = useState<PlayerSource | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled video");
  const [aspect, setAspect] = useState(16 / 9);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [theater, setTheater] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [annotating, setAnnotating] = useState(false);
  const [frozenAt, setFrozenAt] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [history, setHistory] = useState<Command[]>([]);
  const [future, setFuture] = useState<Command[]>([]);
  const [tool, setTool] = useState<ToolKind>("pen");
  const [color, setColor] = useState(INK_COLORS[0]!);
  const [size, setSize] = useState(PEN_PRESETS[1]!.size);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [touchDrawing, setTouchDrawing] = useState(true);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [captureOn, setCaptureOn] = useState(false);
  const [recovered, setRecovered] = useState<Awaited<ReturnType<typeof loadRecovery>> | null>(null);

  const contentRect = useMemo(
    () => computeContentRect(stageSize.width, stageSize.height, aspect),
    [stageSize, aspect],
  );

  const opacity = tool === "highlighter" ? 0.35 : 1;

  /* ---------------- data loading ---------------- */
  const refresh = useCallback(() => {
    listAnnotations().then(setAnnotations).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    loadRecovery()
      .then((r) => {
        if (r && r.strokes.length) setRecovered(r);
      })
      .catch(() => undefined);
  }, [refresh]);

  /* ---------------- geometry ---------------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setStageSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setStageSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, [source]);

  /* ---------------- clock ---------------- */
  useEffect(() => {
    let id: number;
    const tick = () => {
      const p = playerRef.current;
      if (p && !annotating) {
        setCurrentTime(p.getCurrentTime());
        const d = p.getDuration();
        if (d && Math.abs(d - duration) > 0.5) setDuration(d);
      }
      id = window.setTimeout(tick, 120);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [annotating, duration]);

  /* persist playback position */
  useEffect(() => {
    if (!sourceKey || annotating) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      void putVideo({
        key: sourceKey,
        title,
        sourceType: source?.type === "youtube" ? "youtube" : "file",
        youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
        lastPosition: p.getCurrentTime(),
        duration: p.getDuration(),
        updatedAt: Date.now(),
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [sourceKey, title, source, annotating]);

  /* ---------------- source loading ---------------- */
  const loadYouTube = (raw: string) => {
    const id = parseYouTubeId(raw);
    if (!id) {
      toast.error("That doesn't look like a YouTube link");
      return;
    }
    setSource({ type: "youtube", videoId: id, title: "YouTube lecture" });
    setSourceKey(`yt:${id}`);
    setTitle("YouTube lecture");
    setAspect(16 / 9);
  };

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setSource({ type: "file", url, title: file.name });
    setSourceKey(`file:${file.name}:${file.size}`);
    setTitle(file.name);
  };

  const handleReady = useCallback(
    (info: { duration: number; title: string; aspect: number }) => {
      setDuration(info.duration);
      setTitle(info.title);
      setAspect(info.aspect);
      if (sourceKey) {
        void getVideo(sourceKey).then((v) => {
          if (v && v.lastPosition > 5) {
            playerRef.current?.seek(v.lastPosition);
            toast(`Resumed from ${formatTime(v.lastPosition)}`);
          }
        });
      }
    },
    [sourceKey],
  );

  /* ---------------- annotation flow ---------------- */
  const beginAnnotation = useCallback(() => {
    const p = playerRef.current;
    if (!p || !source) {
      toast.error("Load a video first");
      return;
    }
    const t = p.getCurrentTime();
    p.pause();
    setFrozenAt(t);
    setCurrentTime(t);
    setStrokes([]);
    setHistory([]);
    setFuture([]);
    setEditingId(null);
    setTool("pen");
    setAnnotating(true);
  }, [source]);

  const exitAnnotation = useCallback(
    (resume: boolean) => {
      setAnnotating(false);
      setStrokes([]);
      setHistory([]);
      setFuture([]);
      setEditingId(null);
      if (resume) playerRef.current?.play();
    },
    [],
  );

  const saveAnnotation = useCallback(async () => {
    if (!annotating || !source || !sourceKey) return;
    if (strokes.length === 0) {
      toast.error("Nothing written yet");
      return;
    }
    const videoEl = playerRef.current?.getVideoElement() ?? null;
    const stage = stageRef.current?.getBoundingClientRect() ?? null;
    const viewportRect = stage
      ? new DOMRect(
          stage.left + contentRect.left,
          stage.top + contentRect.top,
          contentRect.width,
          contentRect.height,
        )
      : null;

    const snapshot = await captureSnapshot({
      rect: contentRect,
      strokes,
      videoEl,
      youtubeVideoId: source.type === "youtube" ? source.videoId : undefined,
      viewportRect,
      session: sessionRef.current,
    });

    const now = Date.now();
    const existing = editingId ? annotations.find((a) => a.id === editingId) : undefined;
    const annotation: Annotation = {
      id: editingId ?? uid(),
      schemaVersion: SCHEMA_VERSION,
      sourceType: source.type === "youtube" ? "youtube" : "file",
      sourceKey,
      sourceUrl: source.type === "youtube" ? `https://youtu.be/${source.videoId}` : undefined,
      youtubeVideoId: source.type === "youtube" ? source.videoId : undefined,
      title,
      timestamp: frozenAt,
      duration,
      videoAspectRatio: aspect,
      strokes,
      snapshot,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await putAnnotation(annotation);
    await clearRecovery();
    refresh();
    toast.success(
      snapshot.status === "captured"
        ? `Saved with frame at ${formatTime(frozenAt)}`
        : snapshot.status === "reference-only"
          ? `Saved at ${formatTime(frozenAt)} — reference image only`
          : `Saved at ${formatTime(frozenAt)} — frame snapshot unavailable`,
    );
    exitAnnotation(true);
  }, [
    annotating,
    source,
    sourceKey,
    strokes,
    contentRect,
    editingId,
    annotations,
    title,
    frozenAt,
    duration,
    aspect,
    refresh,
    exitAnnotation,
  ]);

  /* crash-resistant recovery checkpoints */
  useEffect(() => {
    if (!annotating || !sourceKey || strokes.length === 0) return;
    const id = window.setTimeout(() => {
      void saveRecovery({
        id: "active",
        title,
        sourceType: source?.type === "youtube" ? "youtube" : "file",
        sourceKey,
        youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
        timestamp: frozenAt,
        duration,
        videoAspectRatio: aspect,
        strokes,
        updatedAt: Date.now(),
      });
    }, 600);
    return () => window.clearTimeout(id);
  }, [strokes, annotating, sourceKey, title, source, frozenAt, duration, aspect]);

  /* ---------------- ink commands ---------------- */
  const commit = useCallback((stroke: Stroke) => {
    setStrokes((s) => [...s, stroke]);
    setHistory((h) => [...h, { type: "add", stroke }]);
    setFuture([]);
  }, []);

  const erase = useCallback((ids: string[]) => {
    setStrokes((s) => {
      const removed = s.filter((x) => ids.includes(x.id));
      if (!removed.length) return s;
      setHistory((h) => [...h, { type: "erase", strokes: removed }]);
      setFuture([]);
      return s.filter((x) => !ids.includes(x.id));
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const cmd = h[h.length - 1];
      if (!cmd) return h;
      setStrokes((s) => {
        if (cmd.type === "add") return s.filter((x) => x.id !== cmd.stroke.id);
        return [...s, ...cmd.strokes];
      });
      setFuture((f) => [...f, cmd]);
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      const cmd = f[f.length - 1];
      if (!cmd) return f;
      setStrokes((s) => {
        if (cmd.type === "add") return [...s, cmd.stroke];
        const ids = cmd.strokes.map((x) => x.id);
        return s.filter((x) => !ids.includes(x.id));
      });
      setHistory((h) => [...h, cmd]);
      return f.slice(0, -1);
    });
  }, []);

  const clearInk = useCallback(() => {
    setStrokes((s) => {
      if (!s.length) return s;
      setHistory((h) => [...h, { type: "clear", strokes: s }]);
      setFuture([]);
      return [];
    });
  }, []);

  /* ---------------- library ---------------- */
  const openAnnotation = useCallback(
    (a: Annotation) => {
      const applyInk = () => {
        setFrozenAt(a.timestamp);
        setStrokes(a.strokes);
        setHistory([]);
        setFuture([]);
        setEditingId(a.id);
        setAnnotating(true);
        setAspect(a.videoAspectRatio);
        window.setTimeout(() => {
          playerRef.current?.seek(a.timestamp);
          playerRef.current?.pause();
        }, 400);
      };

      if (a.sourceKey !== sourceKey) {
        if (a.youtubeVideoId) {
          setSource({ type: "youtube", videoId: a.youtubeVideoId, title: a.title });
          setSourceKey(a.sourceKey);
          setTitle(a.title);
          window.setTimeout(applyInk, 1200);
          return;
        }
        toast.error("Re-open the local video file to view this annotation");
        return;
      }
      playerRef.current?.seek(a.timestamp);
      playerRef.current?.pause();
      applyInk();
    },
    [sourceKey],
  );

  const removeAnnotation = useCallback(
    async (id: string) => {
      await deleteAnnotation(id);
      if (editingId === id) exitAnnotation(false);
      refresh();
      toast("Annotation deleted");
    },
    [editingId, exitAnnotation, refresh],
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      if (!n) return false;
      const tag = n.tagName?.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        n.isContentEditable === true
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "a":
          if (!annotating) {
            e.preventDefault();
            beginAnnotation();
          }
          break;
        case "s":
          if (annotating) {
            e.preventDefault();
            void saveAnnotation();
          }
          break;
        case "escape":
          if (annotating) {
            e.preventDefault();
            exitAnnotation(false);
            toast("Annotation cancelled — draft kept in recovery");
          }
          break;
        case " ":
          if (!annotating) {
            e.preventDefault();
            playing ? playerRef.current?.pause() : playerRef.current?.play();
          }
          break;
        case "arrowleft":
          if (!annotating) {
            e.preventDefault();
            playerRef.current?.seek(
              Math.max(0, (playerRef.current?.getCurrentTime() ?? 0) - (e.shiftKey ? 30 : 5)),
            );
          }
          break;
        case "arrowright":
          if (!annotating) {
            e.preventDefault();
            playerRef.current?.seek(
              (playerRef.current?.getCurrentTime() ?? 0) + (e.shiftKey ? 30 : 5),
            );
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotating, playing, beginAnnotation, saveAnnotation, exitAnnotation, undo, redo]);

  /* ---------------- screen capture ---------------- */
  const toggleCapture = async () => {
    if (captureOn) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setCaptureOn(false);
      return;
    }
    if (!ScreenCaptureSession.supported) {
      toast.error("Screen capture isn't supported in this browser");
      return;
    }
    try {
      const s = new ScreenCaptureSession();
      await s.start(() => {
        sessionRef.current = null;
        setCaptureOn(false);
      });
      sessionRef.current = s;
      setCaptureOn(true);
      toast.success("Frame capture enabled — choose this tab for best results");
    } catch {
      toast.error("Capture permission was declined");
    }
  };

  const markers = useMemo(
    () => annotations.filter((a) => a.sourceKey === sourceKey),
    [annotations, sourceKey],
  );

  const seekToFraction = (fraction: number) => {
    if (!duration) return;
    playerRef.current?.seek(fraction * duration);
    setCurrentTime(fraction * duration);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Toaster />
      <header className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <h1 className="font-display text-2xl italic tracking-tight">
          Video<span className="text-primary">Ink</span>
        </h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          watch → A → write → S
        </span>
        <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
          <form
            className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              loadYouTube(urlInput);
            }}
          >
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a YouTube lecture URL"
              aria-label="YouTube URL"
            />
            <Button type="submit" variant="secondary">
              Load
            </Button>
          </form>
          <label className="inline-flex">
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
            <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent">
              <FileVideo className="size-4" /> Local video
            </span>
          </label>
          <Button
            variant={captureOn ? "default" : "outline"}
            onClick={toggleCapture}
            title="Authorise screen capture so saved annotations include the real frame"
          >
            <Camera className="size-4" />
            <span className="hidden md:inline">
              {captureOn ? "Capture on" : "Enable frame capture"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Toggle annotation panel"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        </div>
      </header>

      {recovered && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
          <span>
            Recovered unsaved annotation from {formatTime(recovered.timestamp)} (
            {recovered.strokes.length} strokes)
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStrokes(recovered.strokes);
                setFrozenAt(recovered.timestamp);
                setAnnotating(true);
                setRecovered(null);
              }}
            >
              Continue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void clearRecovery();
                setRecovered(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div
            ref={stageRef}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border border-border/70 bg-black ink-grid",
              theater ? "aspect-[21/9]" : "aspect-video",
            )}
          >
            {!source && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <p className="font-display text-3xl italic text-muted-foreground">
                  Load a lecture to begin
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Paste a YouTube URL or open a local video. Everything you write stays
                  on this device — no account, no upload.
                </p>
              </div>
            )}
            <Player
              ref={playerRef}
              source={source}
              onReady={handleReady}
              onPlayStateChange={setPlaying}
            />

            <InkCanvas
              rect={contentRect}
              width={stageSize.width}
              height={stageSize.height}
              strokes={strokes}
              tool={tool}
              color={color}
              size={size}
              opacity={opacity}
              enabled={annotating}
              touchDrawing={touchDrawing}
              onCommit={commit}
              onErase={erase}
            />

            {annotating && (
              <>
                <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/60" />
                <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/85 px-2.5 py-1 text-xs font-medium tracking-wide text-primary">
                  ANNOTATING — {formatTime(frozenAt)} · VIDEO FROZEN
                </div>
                <div className="absolute inset-x-2 bottom-2 flex justify-center">
                  <AnnotationToolbar
                    tool={tool}
                    setTool={setTool}
                    color={color}
                    setColor={setColor}
                    size={size}
                    setSize={setSize}
                    canUndo={history.length > 0}
                    canRedo={future.length > 0}
                    onUndo={undo}
                    onRedo={redo}
                    onClear={clearInk}
                    onSave={() => void saveAnnotation()}
                    onCancel={() => exitAnnotation(false)}
                  />
                </div>
              </>
            )}
          </div>

          {/* seek bar with annotation markers */}
          <div className="space-y-2">
            <div
              className="relative h-6 cursor-pointer"
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                seekToFraction((e.clientX - box.left) / box.width);
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                />
              </div>
              {markers.map((m) => (
                <button
                  key={m.id}
                  title={`${formatTime(m.timestamp)} · ${m.strokes.length} strokes`}
                  aria-label={`Annotation at ${formatTime(m.timestamp)}`}
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-chart-2 hover:scale-125"
                  style={{ left: duration ? `${(m.timestamp / duration) * 100}%` : "0%" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openAnnotation(m);
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => (playing ? playerRef.current?.pause() : playerRef.current?.play())}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Back 10 seconds"
                onClick={() => playerRef.current?.seek(Math.max(0, currentTime - 10))}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Forward 10 seconds"
                onClick={() => playerRef.current?.seek(currentTime + 10)}
              >
                <RotateCw className="size-4" />
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    playerRef.current?.setMuted(next);
                  }}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </Button>
                <Slider
                  className="w-24"
                  value={[volume * 100]}
                  max={100}
                  aria-label="Volume"
                  onValueChange={([v]) => {
                    const val = (v ?? 100) / 100;
                    setVolume(val);
                    playerRef.current?.setVolume(val);
                  }}
                />
                <Select
                  value={String(rate)}
                  onValueChange={(v) => {
                    setRate(Number(v));
                    playerRef.current?.setPlaybackRate(Number(v));
                  }}
                >
                  <SelectTrigger className="w-[86px]" aria-label="Playback speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Theater mode"
                  onClick={() => setTheater((v) => !v)}
                >
                  <Monitor className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Picture in picture"
                  onClick={() => playerRef.current?.requestPictureInPicture()}
                >
                  <PictureInPicture2 className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Fullscreen"
                  onClick={() => void stageRef.current?.requestFullscreen?.()}
                >
                  <Maximize2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="lg"
                variant={annotating ? "secondary" : "default"}
                onClick={beginAnnotation}
                disabled={annotating}
              >
                Annotate <kbd className="ml-2 rounded bg-background/30 px-1.5 text-xs">A</kbd>
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => void saveAnnotation()}
                disabled={!annotating}
              >
                Save <kbd className="ml-2 rounded bg-background/40 px-1.5 text-xs">S</kbd>
              </Button>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={touchDrawing}
                  onChange={(e) => setTouchDrawing(e.target.checked)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Touch drawing
              </label>
            </div>
          </div>
        </section>

        <aside
          className={cn(
            "w-full shrink-0 rounded-xl border border-border/70 bg-sidebar p-3 lg:w-[340px]",
            panelOpen ? "block" : "hidden lg:block",
          )}
        >
          <div className="h-[420px] lg:h-[calc(100vh-8rem)]">
            <AnnotationLibrary
              annotations={annotations}
              currentSourceKey={sourceKey}
              activeId={editingId}
              onOpen={openAnnotation}
              onDelete={(id) => void removeAnnotation(id)}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
