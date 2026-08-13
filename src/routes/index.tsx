import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Download,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Player, type PlayerHandle, type PlayerSource } from "@/components/videoink/Player";
import { ObjectCanvas } from "@/components/videoink/ObjectCanvas";
import { useEditor } from "@/components/videoink/useEditor";
import {
  ExportDialog,
  InkToolbar,
  PageLibrary,
  SettingsDialog,
  TextEditorOverlay,
  ToolIndicator,
  VideoControls,
  type ExportRequest,
} from "@/components/videoink/ui";
import { computeContentRect } from "@/lib/videoink/geometry";
import {
  clearRecovery,
  deletePage,
  listPages,
  loadRecovery,
  nextRanks,
  putPage,
  putPages,
  saveRecovery,
} from "@/lib/videoink/db";
import { ScreenCaptureSession, captureSnapshot } from "@/lib/videoink/capture";
import { makeThumbnail } from "@/lib/videoink/render";
import { exportPages, type ExportHandle } from "@/lib/videoink/export";

import {
  DEFAULT_PREFS,
  PEN_PRESETS,
  applyTemplate,
  loadPrefs,
  savePrefs,
  type Prefs,
} from "@/lib/videoink/prefs";
import {
  actionForCombo,
  defaultKeyMap,
  eventCombo,
  loadKeyMap,
  saveKeyMap,
  type KeyMap,
} from "@/lib/videoink/shortcuts";
import { parseYouTubeId } from "@/lib/videoink/youtube";
import {
  SCHEMA_VERSION,
  formatTime,
  uid,
  type Page,
  type PageObject,
  type TextObject,
  type ToolId,
} from "@/lib/videoink/types";

/** Tool order used by the previous/next tool hotkeys. */
const TOOL_CYCLE: ToolId[] = [
  "select",
  "pen",
  "highlighter",
  "eraser",
  "text",
  "line",
  "arrow",
  "shape",
  "lasso",
];

/** Viewport rectangle of the visible video content, for screen-capture cropping. */
function stageViewportRect(
  el: HTMLDivElement | null,
  rect: { left: number; top: number; width: number; height: number },
): DOMRect | null {
  if (!el || !rect.width || !rect.height) return null;
  const box = el.getBoundingClientRect();
  return new DOMRect(box.left + rect.left, box.top + rect.top, rect.width, rect.height);
}


export const Route = createFileRoute("/")({
  component: Workstation,
  head: () => ({
    meta: [
      { title: "VideoInk — Handwritten notes on top of any lecture video" },
      {
        name: "description",
        content:
          "Freeze any video frame, write with your stylus, and keep every page in a searchable local library with PDF, PNG and ZIP export.",
      },
      { property: "og:title", content: "VideoInk — Ink notes over lecture video" },
      {
        property: "og:description",
        content:
          "One-handed hotkeys, pressure-sensitive ink, shapes, text and batch export. Everything stays on your device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Workstation() {
  const playerRef = useRef<PlayerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<PlayerSource | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [duration, setDuration] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const captureRef = useRef<ScreenCaptureSession | null>(null);
  const [captureActive, setCaptureActive] = useState(false);


  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [keys, setKeysState] = useState<KeyMap>(defaultKeyMap());
  const [tool, setTool] = useState<ToolId>("pen");
  const [annotating, setAnnotating] = useState(false);
  const [frozenAt, setFrozenAt] = useState(0);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [pages, setPages] = useState<Page[]>([]);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const exportHandle = useRef<ExportHandle>({ cancelled: false });

  const editor = useEditor();

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    setPrefsState(loadPrefs());
    setKeysState(loadKeyMap());
    void listPages().then(setPages);
    void loadRecovery().then((doc) => {
      if (doc && doc.objects.length) {
        toast("Unsaved page recovered", {
          action: {
            label: "Restore",
            onClick: () => {
              editor.reset(doc.objects);
              setFrozenAt(doc.timestamp);
              setAnnotating(true);
            },
          },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Library is docked on large screens, an overlay drawer on small ones. */
  useEffect(() => {
    if (window.innerWidth >= 1024) setLibraryOpen(true);
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const setKeys = useCallback((k: KeyMap) => {
    setKeysState(k);
    saveKeyMap(k);
  }, []);

  /* ---------------------------- geometry ---------------------------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStage({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setStage({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rect = useMemo(
    () => computeContentRect(stage.width, stage.height, aspect),
    [stage.width, stage.height, aspect],
  );

  /* -------------------------- playback poll -------------------------- */
  useEffect(() => {
    if (!source) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      setCurrent(p.getCurrentTime());
      setPlaying(p.isPlaying());
      const d = p.getDuration();
      if (d && Number.isFinite(d)) setDuration((prev) => (Math.abs(prev - d) > 0.5 ? d : prev));
    }, 250);
    return () => clearInterval(t);
  }, [source]);

  /* ------------------------- screen capture -------------------------- */
  const toggleCapture = useCallback(async () => {
    if (!ScreenCaptureSession.supported) {
      toast.error("Screen capture is not supported in this browser");
      return;
    }
    if (captureRef.current?.active) {
      captureRef.current.stop();
      captureRef.current = null;
      setCaptureActive(false);
      toast("Screen capture stopped");
      return;
    }
    const session = new ScreenCaptureSession();
    try {
      await session.start(() => {
        captureRef.current = null;
        setCaptureActive(false);
      });
      captureRef.current = session;
      setCaptureActive(true);
      toast.success("Screen capture on — saved pages now keep the real frame");
    } catch {
      toast.error("Screen capture permission denied");
    }
  }, []);

  useEffect(() => () => captureRef.current?.stop(), []);



  /* --------------------------- recovery ----------------------------- */
  useEffect(() => {
    if (!annotating) return;
    const t = setInterval(() => {
      if (!editor.objects.length) return;
      void saveRecovery({
        id: "active",
        pageId: activePage?.id,
        title: videoTitle,
        sourceType: source?.type,
        sourceKey: sourceKey(source),
        youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
        timestamp: frozenAt,
        duration,
        videoAspectRatio: aspect,
        objects: editor.objects,
        updatedAt: Date.now(),
      });
    }, 4000);
    return () => clearInterval(t);
  }, [annotating, editor.objects, activePage, videoTitle, source, frozenAt, duration, aspect]);

  /* ---------------------------- actions ----------------------------- */
  const flashLabel = (label: string) => {
    setFlash(label);
    setTimeout(() => setFlash(null), 900);
  };

  const startAnnotation = useCallback(() => {
    if (annotating) return;
    playerRef.current?.pause();
    setFrozenAt(playerRef.current?.getCurrentTime() ?? 0);
    setActivePage(null);
    editor.reset([]);
    setAnnotating(true);
  }, [annotating, editor]);

  const cancelAnnotation = useCallback(() => {
    setAnnotating(false);
    setEditingTextId(null);
    editor.reset([]);
    void clearRecovery();
  }, [editor]);

  const savePage = useCallback(async () => {
    if (!annotating) return;
    const objects = editor.objects;
    if (!objects.length) {
      toast.error("Nothing to save yet");
      return;
    }
    const ranks = activePage
      ? { rank: activePage.createdRank, order: activePage.currentOrder }
      : await nextRanks();
    const snapshot = activePage?.snapshot?.dataUrl
      ? activePage.snapshot
      : await captureSnapshot({
          rect: { left: 0, top: 0, width: rect.width || 1280, height: rect.height || 720 },
          objects,
          videoEl: playerRef.current?.getVideoElement() ?? null,
          youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
          viewportRect: stageViewportRect(stageRef.current, rect),
          session: captureRef.current,
        });


    const page: Page = {
      id: activePage?.id ?? uid(),
      schemaVersion: SCHEMA_VERSION,
      type: activePage?.type ?? (source ? "video" : "blank"),
      createdRank: ranks.rank,
      currentOrder: ranks.order,
      title: activePage?.title ?? `${videoTitle} @ ${formatTime(frozenAt)}`,
      sourceType: source?.type,
      sourceKey: sourceKey(source),
      youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
      videoTitle,
      timestamp: source ? frozenAt : undefined,
      duration,
      aspectRatio: aspect,
      objects,
      snapshot,
      createdAt: activePage?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    page.thumbnail = await makeThumbnail(page);
    await putPage(page);
    setPages(await listPages());
    editor.markSaved();
    editor.reset([]);
    setActivePage(null);
    setAnnotating(false);
    setEditingTextId(null);
    void clearRecovery();
    playerRef.current?.play();
    toast.success("Page saved");
  }, [annotating, editor, activePage, rect, source, videoTitle, frozenAt, duration, aspect]);

  const deleteCurrentPage = useCallback(async () => {
    if (activePage) {
      await deletePage(activePage.id);
      setPages(await listPages());
      toast.success("Page deleted");
    }
    setActivePage(null);
    editor.reset([]);
    setAnnotating(false);
    setEditingTextId(null);
    void clearRecovery();
  }, [activePage, editor]);


  const addBlankPage = useCallback(async () => {
    const ranks = await nextRanks();
    const page: Page = {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      type: "blank",
      createdRank: ranks.rank,
      currentOrder: ranks.order,
      title: `Blank page ${ranks.rank}`,
      aspectRatio: aspect,
      objects: [],
      snapshot: { status: "unavailable" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putPage(page);
    setPages(await listPages());
    setActivePage(page);
    editor.reset([]);
    setAnnotating(true);
  }, [aspect, editor]);

  const openPage = useCallback(
    (page: Page) => {
      setActivePage(page);
      editor.reset(page.objects);
      setAnnotating(true);
      if (page.timestamp != null) playerRef.current?.seek(page.timestamp);
      setFrozenAt(page.timestamp ?? 0);
    },
    [editor],
  );

  const deletePages = useCallback(async (ids: string[]) => {
    for (const id of ids) await deletePage(id);
    setPages(await listPages());
    setLibrarySelection([]);
    toast.success(`${ids.length} page${ids.length === 1 ? "" : "s"} deleted`);
  }, []);

  const duplicatePages = useCallback(
    async (ids: string[]) => {
      let ranks = await nextRanks();
      const copies: Page[] = [];
      for (const id of ids) {
        const p = pages.find((x) => x.id === id);
        if (!p) continue;
        copies.push({
          ...p,
          id: uid(),
          createdRank: ranks.rank,
          currentOrder: ranks.order,
          title: `${p.title} (copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        ranks = { rank: ranks.rank + 1, order: ranks.order + 1 };
      }
      await putPages(copies);
      setPages(await listPages());
    },
    [pages],
  );

  const reorderPages = useCallback(
    async (orderedIds: string[]) => {
      const updated = orderedIds
        .map((id, i) => {
          const p = pages.find((x) => x.id === id);
          return p ? { ...p, currentOrder: i + 1, updatedAt: Date.now() } : null;
        })
        .filter((p): p is Page => p !== null);
      await putPages(updated);
      setPages(await listPages());
      setPrefs({ librarySort: "manual" });
    },
    [pages, setPrefs],
  );

  const runExport = useCallback(
    async (req: ExportRequest) => {
      const scoped =
        req.scope === "current"
          ? activePage
            ? [activePage]
            : []
          : req.scope === "selected"
            ? pages.filter((p) => librarySelection.includes(p.id))
            : pages;
      const ordered = [...scoped].sort((a, b) =>
        req.order === "creation"
          ? a.createdRank - b.createdRank
          : req.order === "timestamp"
            ? (a.timestamp ?? 0) - (b.timestamp ?? 0)
            : a.currentOrder - b.currentOrder,
      );
      exportHandle.current = { cancelled: false };
      setExportProgress("Starting…");
      try {
        await exportPages(
          ordered,
          {
            format: req.format,
            filename: req.filename,
            includeDate: req.includeDate,
            includePageNumbers: req.includePageNumbers,
            resolutionWidth: 1920,
            jpegQuality: 0.92,
          },
          (p) => setExportProgress(`${p.phase} ${p.done}/${p.total}`),
          exportHandle.current,
        );
        toast.success("Export complete");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      } finally {
        setExportProgress(null);
        setExportOpen(false);
      }
    },
    [activePage, pages, librarySelection],
  );

  /* --------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const action = actionForCombo(keys, eventCombo(e));
      if (!action) return;
      e.preventDefault();
      if (action.startsWith("tool.") && !["tool.prev", "tool.next", "tool.reset"].includes(action)) {
        const id = action.slice(5) as ToolId;
        setTool(id);
        flashLabel(id);
        return;
      }
      if (action === "tool.prev" || action === "tool.next") {
        const i = TOOL_CYCLE.indexOf(tool);
        const n = TOOL_CYCLE.length;
        const next = TOOL_CYCLE[(((action === "tool.next" ? i + 1 : i - 1) % n) + n) % n]!;
        setTool(next);
        flashLabel(next);
        return;
      }
      if (action === "tool.reset") {
        setTool("pen");
        flashLabel("pen");
        return;
      }
      switch (action) {
        case "annotate":
          startAnnotation();
          break;
        case "save":
          void savePage();
          break;
        case "undo":
          editor.undo();
          break;
        case "redo":
          editor.redo();
          break;
        case "clear":
          editor.clear();
          break;
        case "delete":
          editor.deleteSelection();
          break;
        case "duplicate":
          editor.duplicateSelection();
          break;
        case "copy":
          editor.copySelection();
          break;
        case "paste":
          editor.paste();
          break;
        case "selectAll":
          editor.selectAll();
          break;
        case "size.fine":
        case "size.medium":
        case "size.bold": {
          const preset =
            PEN_PRESETS[action === "size.fine" ? 0 : action === "size.medium" ? 1 : 2]!;
          setPrefs(
            tool === "highlighter"
              ? { highlighterSize: preset.size * 1.6 }
              : { penSize: preset.size },
          );
          flashLabel(preset.label);
          break;
        }
        case "customColor":
          setSettingsOpen(true);
          break;
        case "shape.fill":
          setPrefs({ shapeFill: !prefs.shapeFill });
          flashLabel(prefs.shapeFill ? "Fill off" : "Fill on");
          break;
        case "capture":
          void toggleCapture();
          break;
        case "eraser.cycle":
          setPrefs({ eraserMode: prefs.eraserMode === "stroke" ? "freehand" : "stroke" });
          flashLabel("Eraser mode");
          break;
        case "page.blank":
          void addBlankPage();
          break;
        case "page.delete":
          void deleteCurrentPage();
          break;

        case "library.toggle":
          setLibraryOpen((v) => !v);
          break;
        case "export":
          setExportOpen(true);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "cancel":
          if (editingTextId) setEditingTextId(null);
          else cancelAnnotation();
          break;
        case "playPause":
          if (!annotating) {
            if (playerRef.current?.isPlaying()) playerRef.current.pause();
            else playerRef.current?.play();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    keys,
    editor,
    tool,
    prefs.eraserMode,
    prefs.shapeFill,
    annotating,
    editingTextId,
    startAnnotation,
    savePage,
    cancelAnnotation,
    addBlankPage,
    deleteCurrentPage,
    toggleCapture,
    setPrefs,
  ]);


  /* ----------------------------- source ----------------------------- */
  const openUrl = () => {
    const value = urlInput.trim();
    if (!value) return;
    const yt = parseYouTubeId(value);
    if (yt) {
      setSource({ type: "youtube", videoId: yt, title: "YouTube video" });
    } else {
      setSource({ type: "url", url: value, title: value.split("/").pop() ?? "Video" });
    }
  };

  const openFile = (file: File) => {
    setSource({ type: "file", url: URL.createObjectURL(file), title: file.name });
  };

  const editingText = useMemo(
    () =>
      (editor.objects.find((o) => o.id === editingTextId && o.kind === "text") as
        | TextObject
        | undefined) ?? null,
    [editor.objects, editingTextId],
  );

  const defaultFilename = applyTemplate(prefs.filenameTemplate, {
    videoTitle,
    date: new Date().toISOString().slice(0, 10),
    type: "pages",
  });

  return (
    <main className="flex h-screen w-full flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
        <h1 className="font-display text-xl italic tracking-tight">VideoInk</h1>
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openUrl()}
            placeholder="Paste a YouTube or video URL"
            aria-label="Video URL"
            className="h-9"
          />
          <Button size="sm" onClick={openUrl}>
            Open
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm">
              <Upload className="size-4" /> File
            </span>
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
              }}
            />
          </label>
        </div>
        <Button
          size="sm"
          variant={captureActive ? "secondary" : "outline"}
          onClick={() => void toggleCapture()}
          className="gap-1.5"
          title={
            captureActive
              ? "Screen capture is on — click to stop sharing"
              : "Grant screen capture so saved pages keep the real video frame"
          }
        >
          <MonitorUp className="size-4" />
          {captureActive ? "Capture on" : "Allow capture"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)} className="gap-1.5">
          <Download className="size-4" /> Export
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)} className="gap-1.5">
          <Settings2 className="size-4" /> Settings
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setLibraryOpen((v) => !v)}>
          {libraryOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={stageRef} className="relative min-h-0 flex-1 bg-black/60">
            <Player
              ref={playerRef}
              source={source}
              fit={rect}
              onReady={(info) => {
                setDuration(info.duration);
                setVideoTitle(info.title);
                setAspect(info.aspect);
              }}
            />
            <ObjectCanvas
              rect={rect}
              width={stage.width}
              height={stage.height}
              editor={editor}
              tool={tool}
              prefs={prefs}
              enabled={annotating}
              editingTextId={editingTextId}
              onEditText={setEditingTextId}
              onRecognized={flashLabel}
            />
            {editingText && (
              <TextEditorOverlay
                obj={editingText}
                rect={rect}
                onChange={(patch) =>
                  editor.apply(
                    (prev) =>
                      prev.map((o) =>
                        o.id === editingText.id ? ({ ...o, ...patch } as PageObject) : o,
                      ),
                    false,
                  )
                }
                onDone={() => setEditingTextId(null)}
              />
            )}

            <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
              <ToolIndicator tool={tool} prefs={prefs} keys={keys} flash={flash} />
              {annotating && (
                <span className="rounded bg-background/85 px-2 py-1 text-[11px]">
                  Frozen at {formatTime(frozenAt)}
                </span>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              {annotating ? (
                <InkToolbar
                  tool={tool}
                  setTool={setTool}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  keys={keys}
                  canUndo={editor.canUndo}
                  canRedo={editor.canRedo}
                  onUndo={editor.undo}
                  onRedo={editor.redo}
                  onClear={editor.clear}
                  onSave={() => void savePage()}
                  onCancel={cancelAnnotation}
                  onOpenColor={() => setSettingsOpen(true)}
                  captureActive={captureActive}
                  onToggleCapture={() => void toggleCapture()}
                  canDeletePage={!!activePage}
                  onDeletePage={() => void deleteCurrentPage()}
                />
              ) : (
                <Button className="pointer-events-auto" onClick={startAnnotation}>
                  Freeze &amp; annotate (A)
                </Button>
              )}
            </div>
          </div>

          {source && (
            <div className="border-t border-border/70 p-2">
              <VideoControls
                playing={playing}
                current={current}
                duration={duration}
                volume={volume}
                muted={muted}
                rate={rate}
                disabled={annotating}
                onPlayPause={() => {
                  const p = playerRef.current;
                  if (!p) return;
                  if (p.isPlaying()) p.pause();
                  else p.play();
                }}
                onSeek={(t) => {
                  setCurrent(t);
                  playerRef.current?.seek(t);
                }}
                onSkip={(d) => {
                  const p = playerRef.current;
                  if (!p) return;
                  const t = Math.max(0, Math.min(p.getCurrentTime() + d, duration || Infinity));
                  setCurrent(t);
                  p.seek(t);
                }}
                onVolume={(v) => {
                  setVolume(v);
                  setMuted(v === 0);
                  playerRef.current?.setVolume(v);
                  playerRef.current?.setMuted(v === 0);
                }}
                onMute={() => {
                  const next = !muted;
                  setMuted(next);
                  playerRef.current?.setMuted(next);
                }}
                onRate={(r) => {
                  setRate(r);
                  playerRef.current?.setPlaybackRate(r);
                }}
                onFullscreen={() => {
                  const el = stageRef.current;
                  if (!el) return;
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else void el.requestFullscreen?.();
                }}
              />
            </div>
          )}
        </section>


        {libraryOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
            onClick={() => setLibraryOpen(false)}
            aria-hidden
          />
        )}
        {libraryOpen && (
          <aside className="fixed inset-y-0 right-0 z-40 flex w-[92vw] max-w-[380px] flex-col border-l border-border/70 bg-background p-3 lg:static lg:z-auto lg:w-[340px] lg:max-w-none lg:shrink-0 xl:w-[400px]">
            <Button
              size="sm"
              variant="ghost"
              className="mb-1 self-end lg:hidden"
              onClick={() => setLibraryOpen(false)}
            >
              Close
            </Button>
            <PageLibrary
              pages={pages}
              currentSourceKey={sourceKey(source) ?? null}
              activeId={activePage?.id ?? null}
              selection={librarySelection}
              view={prefs.libraryView}
              sort={prefs.librarySort}
              onView={(v) => setPrefs({ libraryView: v })}
              onSort={(s) => setPrefs({ librarySort: s })}
              onSelectionChange={setLibrarySelection}
              onOpen={openPage}
              onEnlarge={openPage}
              onDelete={(ids) => void deletePages(ids)}
              onDuplicate={(ids) => void duplicatePages(ids)}
              onReorder={(ids) => void reorderPages(ids)}
              onExport={(ids) => {
                setLibrarySelection(ids);
                setExportOpen(true);
              }}
              onAddBlank={() => void addBlankPage()}
            />
          </aside>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFilename={defaultFilename}
        defaultFormat={prefs.exportFormat}
        counts={{
          current: activePage ? 1 : 0,
          selected: librarySelection.length,
          all: pages.length,
        }}
        progress={exportProgress}
        onExport={(req) => void runExport(req)}
        onCancelExport={() => {
          exportHandle.current.cancelled = true;
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        prefs={prefs}
        setPrefs={setPrefs}
        keys={keys}
        setKeys={setKeys}
      />
    </main>
  );
}

function sourceKey(source: PlayerSource | null): string | undefined {
  if (!source) return undefined;
  return source.type === "youtube" ? `yt:${source.videoId}` : `${source.type}:${source.title}`;
}
