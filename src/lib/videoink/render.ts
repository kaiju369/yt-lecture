import { renderObjects } from "./objects";
import type { Page } from "./types";

const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export interface RenderOptions {
  width?: number;
  background?: string;
}

/** Render a canonical page (snapshot + all objects) to an offscreen canvas. */
export async function renderPageToCanvas(
  page: Page,
  opts: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  const width = Math.max(120, Math.round(opts.width ?? 1600));
  const ar = page.aspectRatio || 16 / 9;
  const height = Math.max(1, Math.round(width / ar));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.background ?? (page.type === "video" ? "#0c0b0a" : "#11100e");
  ctx.fillRect(0, 0, width, height);

  const src = page.snapshot?.dataUrl;
  if (src && page.type === "video") {
    try {
      const img = await loadImage(src);
      ctx.drawImage(img, 0, 0, width, height);
    } catch {
      /* keep flat background */
    }
  } else if (page.type !== "video") {
    // subtle ruled background for blank / custom pages
    ctx.strokeStyle = "rgba(245,241,232,0.07)";
    ctx.lineWidth = 1;
    const step = height / 18;
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // Legacy snapshots (inkBaked !== false) already contain the flattened ink —
  // drawing the objects again would double every stroke in the export.
  const baked = src && page.type === "video" && page.snapshot?.inkBaked !== false;
  if (!baked) {
    renderObjects(ctx, page.objects ?? [], { left: 0, top: 0, width, height });
  }
  return canvas;
}

export async function renderPageDataUrl(
  page: Page,
  width: number,
  format: "png" | "jpeg" = "png",
  quality = 0.92,
): Promise<string> {
  const canvas = await renderPageToCanvas(page, { width });
  return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality);
}

/** Small cached preview used by the library. */
export async function makeThumbnail(page: Page): Promise<string | undefined> {
  try {
    return await renderPageDataUrl(page, 480, "jpeg", 0.72);
  } catch {
    return page.snapshot?.dataUrl;
  }
}
