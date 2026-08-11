import { renderPageToCanvas } from "./render";
import { sanitizeFilename } from "./prefs";
import { formatTime, type Page } from "./types";

export type ExportFormat = "png" | "jpeg" | "pdf" | "zip" | "json";

export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  includeDate: boolean;
  includePageNumbers: boolean;
  resolutionWidth: number;
  jpegQuality: number;
}

export interface ExportProgress {
  phase: string;
  done: number;
  total: number;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head ?? "")?.[1] ?? "image/png";
  const bin = atob(body ?? "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function pageFileName(page: Page, index: number, opts: ExportOptions, ext: string) {
  const parts = [opts.filename];
  if (opts.includePageNumbers) parts.push(String(index + 1).padStart(2, "0"));
  const label = page.title || (page.timestamp != null ? formatTime(page.timestamp) : "page");
  parts.push(sanitizeFilename(label));
  return `${parts.join("_")}.${ext}`;
}

export interface ExportHandle {
  cancelled: boolean;
}

export async function exportPages(
  pages: Page[],
  opts: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
  handle?: ExportHandle,
): Promise<void> {
  const total = pages.length;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = opts.includeDate ? `${opts.filename}_${stamp}` : opts.filename;

  if (opts.format === "json") {
    onProgress?.({ phase: "Serialising pages", done: total, total });
    const blob = new Blob([JSON.stringify({ version: 2, pages }, null, 2)], {
      type: "application/json",
    });
    download(blob, `${base}.json`);
    return;
  }

  if (opts.format === "pdf") {
    const { jsPDF } = await import("jspdf");
    let doc: import("jspdf").jsPDF | null = null;
    for (let i = 0; i < pages.length; i++) {
      if (handle?.cancelled) return;
      const page = pages[i]!;
      onProgress?.({ phase: `Rendering page ${i + 1} / ${total}`, done: i, total });
      const canvas = await renderPageToCanvas(page, { width: opts.resolutionWidth });
      const img = canvas.toDataURL("image/jpeg", opts.jpegQuality);
      const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
      if (!doc) {
        doc = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
      } else {
        doc.addPage([canvas.width, canvas.height], orientation);
      }
      doc.addImage(img, "JPEG", 0, 0, canvas.width, canvas.height);
      const caption = [
        page.title,
        page.videoTitle,
        page.timestamp != null ? formatTime(page.timestamp) : null,
        `page ${i + 1} · created #${page.createdRank}`,
      ]
        .filter(Boolean)
        .join("  ·  ");
      doc.setFontSize(Math.max(10, canvas.width * 0.012));
      doc.setTextColor(255, 255, 255);
      doc.text(caption, 16, canvas.height - 14, { maxWidth: canvas.width - 32 });
    }
    if (!doc) return;
    onProgress?.({ phase: "Creating PDF…", done: total, total });
    download(doc.output("blob"), `${base}.pdf`);
    return;
  }

  const imgFormat = opts.format === "jpeg" ? "jpeg" : "png";
  const ext = imgFormat === "jpeg" ? "jpg" : "png";
  const images: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (handle?.cancelled) return;
    const page = pages[i]!;
    onProgress?.({ phase: `Rendering page ${i + 1} / ${total}`, done: i, total });
    const canvas = await renderPageToCanvas(page, { width: opts.resolutionWidth });
    const dataUrl = canvas.toDataURL(
      imgFormat === "jpeg" ? "image/jpeg" : "image/png",
      opts.jpegQuality,
    );
    images.push({ name: pageFileName(page, i, opts, ext), blob: dataUrlToBlob(dataUrl) });
  }

  if (opts.format === "zip" || images.length > 1) {
    onProgress?.({ phase: "Packaging ZIP…", done: total, total });
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    images.forEach((f) => zip.file(f.name, f.blob));
    zip.file(
      "manifest.json",
      JSON.stringify(
        pages.map((p, i) => ({
          file: images[i]?.name,
          id: p.id,
          title: p.title,
          type: p.type,
          createdRank: p.createdRank,
          currentOrder: p.currentOrder,
          timestamp: p.timestamp,
          video: p.videoTitle,
          snapshotStatus: p.snapshot?.status ?? "unavailable",
        })),
        null,
        2,
      ),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    onProgress?.({ phase: "Finalising…", done: total, total });
    download(blob, `${base}.zip`);
    return;
  }

  const only = images[0];
  if (only) download(only.blob, `${base}.${ext}`);
}
