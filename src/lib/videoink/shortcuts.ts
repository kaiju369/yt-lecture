export type ActionId =
  | "tool.select"
  | "tool.pen"
  | "tool.highlighter"
  | "tool.eraser"
  | "tool.text"
  | "tool.line"
  | "tool.arrow"
  | "tool.shape"
  | "tool.lasso"
  | "annotate"
  | "save"
  | "undo"
  | "redo"
  | "clear"
  | "customColor"
  | "shape.fill"
  | "capture"
  | "size.fine"
  | "size.medium"
  | "size.bold"
  | "pen.prev"
  | "pen.next"
  | "color.prev"
  | "color.next"
  | "tool.prev"
  | "tool.next"
  | "tool.reset"
  | "delete"
  | "duplicate"
  | "copy"
  | "paste"
  | "selectAll"
  | "eraser.cycle"
  | "page.blank"
  | "page.delete"
  | "page.next"
  | "page.prev"
  | "library.toggle"
  | "export"
  | "settings"
  | "cancel"
  | "playPause";


export interface ActionDef {
  id: ActionId;
  label: string;
  group: "Tools" | "Ink" | "Edit" | "Pages" | "App";
  defaultKey: string;
}

/** Left-hand-optimised default layout (QWERTY). */
export const ACTIONS: ActionDef[] = [
  { id: "tool.select", label: "Select", group: "Tools", defaultKey: "q" },
  { id: "tool.pen", label: "Pen", group: "Tools", defaultKey: "w" },
  { id: "tool.highlighter", label: "Highlighter", group: "Tools", defaultKey: "e" },
  { id: "tool.eraser", label: "Eraser", group: "Tools", defaultKey: "r" },
  { id: "tool.text", label: "Text", group: "Tools", defaultKey: "t" },
  { id: "tool.line", label: "Line", group: "Tools", defaultKey: "y" },
  { id: "tool.arrow", label: "Arrow", group: "Tools", defaultKey: "u" },
  { id: "annotate", label: "Annotate / Freeze", group: "App", defaultKey: "a" },
  { id: "save", label: "Save page", group: "App", defaultKey: "s" },
  { id: "tool.shape", label: "Shape", group: "Tools", defaultKey: "d" },
  { id: "shape.fill", label: "Toggle shape fill", group: "Ink", defaultKey: "f" },
  { id: "tool.lasso", label: "Lasso", group: "Tools", defaultKey: "g" },
  { id: "undo", label: "Undo", group: "Edit", defaultKey: "z" },
  { id: "redo", label: "Redo", group: "Edit", defaultKey: "x" },
  { id: "customColor", label: "Custom colour", group: "Ink", defaultKey: "c" },
  { id: "capture", label: "Screen capture on/off", group: "App", defaultKey: "v" },
  { id: "size.fine", label: "Fine width", group: "Ink", defaultKey: "1" },
  { id: "size.medium", label: "Medium width", group: "Ink", defaultKey: "2" },
  { id: "size.bold", label: "Bold width", group: "Ink", defaultKey: "3" },
  { id: "pen.prev", label: "Previous pen preset", group: "Ink", defaultKey: "4" },
  { id: "pen.next", label: "Next pen preset", group: "Ink", defaultKey: "5" },
  { id: "color.prev", label: "Previous colour", group: "Ink", defaultKey: "6" },
  { id: "color.next", label: "Next colour", group: "Ink", defaultKey: "7" },
  { id: "tool.prev", label: "Previous tool", group: "Tools", defaultKey: "8" },
  { id: "tool.next", label: "Next tool", group: "Tools", defaultKey: "9" },
  { id: "tool.reset", label: "Reset to pen", group: "Tools", defaultKey: "0" },
  { id: "page.delete", label: "Delete current page", group: "Pages", defaultKey: "shift+backspace" },
  { id: "eraser.cycle", label: "Cycle eraser mode", group: "Tools", defaultKey: "shift+e" },

  { id: "clear", label: "Clear page ink", group: "Edit", defaultKey: "shift+x" },
  { id: "delete", label: "Delete selection", group: "Edit", defaultKey: "backspace" },
  { id: "duplicate", label: "Duplicate selection", group: "Edit", defaultKey: "mod+d" },
  { id: "copy", label: "Copy selection", group: "Edit", defaultKey: "mod+c" },
  { id: "paste", label: "Paste", group: "Edit", defaultKey: "mod+v" },
  { id: "selectAll", label: "Select all objects", group: "Edit", defaultKey: "mod+a" },
  { id: "page.blank", label: "New blank page", group: "Pages", defaultKey: "b" },
  { id: "page.prev", label: "Previous page", group: "Pages", defaultKey: "," },
  { id: "page.next", label: "Next page", group: "Pages", defaultKey: "." },
  { id: "library.toggle", label: "Toggle library panel", group: "App", defaultKey: "l" },
  { id: "export", label: "Export…", group: "App", defaultKey: "shift+s" },
  { id: "settings", label: "Settings", group: "App", defaultKey: "mod+," },
  { id: "cancel", label: "Cancel / exit tool", group: "App", defaultKey: "escape" },
  { id: "playPause", label: "Play / pause", group: "App", defaultKey: "space" },
];

export type KeyMap = Record<string, string>;

export const STORAGE_KEY = "videoink.shortcuts.v2";

export function defaultKeyMap(): KeyMap {
  const m: KeyMap = {};
  for (const a of ACTIONS) m[a.id] = a.defaultKey;
  return m;
}

export function loadKeyMap(): KeyMap {
  const base = defaultKeyMap();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(base, JSON.parse(raw) as KeyMap);
  } catch {
    /* ignore */
  }
  return base;
}

export function saveKeyMap(map: KeyMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Canonical string for a keyboard event, e.g. "shift+r", "mod+z", "space". */
export function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  if (key === "escape") key = "escape";
  parts.push(key);
  return parts.join("+");
}

export function prettyCombo(combo: string): string {
  return combo
    .split("+")
    .map((p) =>
      p === "mod"
        ? "Ctrl"
        : p === "space"
          ? "Space"
          : p === "escape"
            ? "Esc"
            : p === "backspace"
              ? "⌫"
              : p.length === 1
                ? p.toUpperCase()
                : p[0]!.toUpperCase() + p.slice(1),
    )
    .join(" + ");
}

export function findConflict(map: KeyMap, id: ActionId, combo: string): ActionId | null {
  for (const [k, v] of Object.entries(map)) {
    if (k !== id && v && v === combo) return k as ActionId;
  }
  return null;
}

export function actionForCombo(map: KeyMap, combo: string): ActionId | null {
  for (const [k, v] of Object.entries(map)) if (v === combo) return k as ActionId;
  return null;
}
