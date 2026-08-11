import { useCallback, useMemo, useRef, useState } from "react";
import { nextZ, translateObject } from "@/lib/videoink/objects";
import { uid, type PageObject } from "@/lib/videoink/types";

const LIMIT = 120;

export interface Editor {
  objects: PageObject[];
  selection: string[];
  selected: PageObject[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  setSelection: (ids: string[]) => void;
  /** replace objects; commit=false for transient drags (no history entry) */
  apply: (next: PageObject[] | ((prev: PageObject[]) => PageObject[]), commit?: boolean) => void;
  /** push current state to history before a transient drag sequence */
  beginTransient: () => void;
  add: (o: PageObject | PageObject[]) => void;
  remove: (ids: string[]) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  selectAll: () => void;
  updateSelected: (patch: (o: PageObject) => PageObject) => void;
  order: (mode: "front" | "back" | "forward" | "backward") => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  reset: (objects: PageObject[]) => void;
  markSaved: () => void;
}

export function useEditor(initial: PageObject[] = []): Editor {
  const [objects, setObjects] = useState<PageObject[]>(initial);
  const [past, setPast] = useState<PageObject[][]>([]);
  const [future, setFuture] = useState<PageObject[][]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const clipboard = useRef<PageObject[]>([]);
  const pending = useRef<PageObject[] | null>(null);

  const push = useCallback((prev: PageObject[]) => {
    setPast((p) => [...p, prev].slice(-LIMIT));
    setFuture([]);
  }, []);

  const apply = useCallback<Editor["apply"]>(
    (next, commit = true) => {
      setObjects((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (commit) push(pending.current ?? prev);
        pending.current = null;
        return value;
      });
      setDirty(true);
    },
    [push],
  );

  const beginTransient = useCallback(() => {
    setObjects((prev) => {
      pending.current = prev;
      return prev;
    });
  }, []);

  const add = useCallback<Editor["add"]>(
    (o) => {
      const list = Array.isArray(o) ? o : [o];
      apply((prev) => {
        let z = nextZ(prev);
        return [...prev, ...list.map((x) => ({ ...x, z: z++ }))];
      });
    },
    [apply],
  );

  const remove = useCallback<Editor["remove"]>(
    (ids) => {
      apply((prev) => prev.filter((o) => !ids.includes(o.id)));
      setSelection((s) => s.filter((id) => !ids.includes(id)));
    },
    [apply],
  );

  const deleteSelection = useCallback(() => {
    if (selection.length) remove(selection);
  }, [remove, selection]);

  const copySelection = useCallback(() => {
    clipboard.current = objects.filter((o) => selection.includes(o.id));
  }, [objects, selection]);

  const pasteList = useCallback(
    (list: PageObject[]) => {
      if (!list.length) return;
      const now = Date.now();
      const clones = list.map((o) => ({
        ...translateObject(o, 0.02, 0.02),
        id: uid(),
        createdAt: now,
      }));
      add(clones);
      setSelection(clones.map((c) => c.id));
    },
    [add],
  );

  const paste = useCallback(() => pasteList(clipboard.current), [pasteList]);

  const duplicateSelection = useCallback(
    () => pasteList(objects.filter((o) => selection.includes(o.id))),
    [objects, pasteList, selection],
  );

  const selectAll = useCallback(() => setSelection(objects.map((o) => o.id)), [objects]);

  const updateSelected = useCallback<Editor["updateSelected"]>(
    (patch) => {
      apply((prev) => prev.map((o) => (selection.includes(o.id) ? patch(o) : o)));
    },
    [apply, selection],
  );

  const order = useCallback<Editor["order"]>(
    (mode) => {
      apply((prev) => {
        const sorted = [...prev].sort((a, b) => a.z - b.z);
        const max = sorted.length ? sorted[sorted.length - 1]!.z : 0;
        const min = sorted.length ? sorted[0]!.z : 0;
        return prev.map((o) => {
          if (!selection.includes(o.id)) return o;
          if (mode === "front") return { ...o, z: max + 1 };
          if (mode === "back") return { ...o, z: min - 1 };
          return { ...o, z: o.z + (mode === "forward" ? 1.5 : -1.5) };
        });
      });
    },
    [apply, selection],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      const prev = p[p.length - 1];
      if (!prev) return p;
      setObjects((cur) => {
        setFuture((f) => [...f, cur]);
        return prev;
      });
      setDirty(true);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      const next = f[f.length - 1];
      if (!next) return f;
      setObjects((cur) => {
        setPast((p) => [...p, cur]);
        return next;
      });
      setDirty(true);
      return f.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    apply(() => []);
    setSelection([]);
  }, [apply]);

  const reset = useCallback((next: PageObject[]) => {
    setObjects(next);
    setPast([]);
    setFuture([]);
    setSelection([]);
    setDirty(false);
    pending.current = null;
  }, []);

  const selected = useMemo(
    () => objects.filter((o) => selection.includes(o.id)),
    [objects, selection],
  );

  return {
    objects,
    selection,
    selected,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    dirty,
    setSelection,
    apply,
    beginTransient,
    add,
    remove,
    deleteSelection,
    duplicateSelection,
    copySelection,
    paste,
    selectAll,
    updateSelected,
    order,
    undo,
    redo,
    clear,
    reset,
    markSaved: () => setDirty(false),
  };
}
