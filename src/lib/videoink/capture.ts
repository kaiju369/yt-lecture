import type { ContentRect } from "./geometry";
import type { PageObject, SnapshotInfo } from "./types";
import { youtubeThumbnail } from "./youtube";

const MAX_W = 960;

function makeCanvas(rect: ContentRect) {
  const scale = Math.min(1, MAX_W / Math.max(1, rect.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  return { canvas, ctx, scale };
}

function toDataUrl(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

/** A live screen-capture session the user explicitly authorised. */
export class ScreenCaptureSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  get active() {
    return !!this.stream && this.stream.getVideoTracks()[0]?.readyState === "live";
  }

  static get supported() {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia
    );
  }

  async start(onEnded?: () => void) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.stream = stream;
    this.video = video;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      this.stop();
      onEnded?.();
    });
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
  }

  /** Crop the captured surface to a viewport rectangle. */
  grab(viewportRect: DOMRect): HTMLCanvasElement | null {
    const video = this.video;
    if (!video || !video.videoWidth) return null;
    const sx = video.videoWidth / window.innerWidth;
    const sy = video.videoHeight / window.innerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewportRect.width * sx));
    canvas.height = Math.max(1, Math.round(viewportRect.height * sy));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      video,
      viewportRect.left * sx,
      viewportRect.top * sy,
      viewportRect.width * sx,
      viewportRect.height * sy,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface CaptureContext {
  rect: ContentRect;
  objects: PageObject[];
  videoEl: HTMLVideoElement | null;
  youtubeVideoId?: string | undefined;
  /** viewport rect of the visible video content, for screen capture cropping */
  viewportRect: DOMRect | null;
  session: ScreenCaptureSession | null;
}

export async function captureSnapshot(ctxIn: CaptureContext): Promise<SnapshotInfo> {
  const { rect, videoEl, youtubeVideoId, viewportRect, session } = ctxIn;
  const { canvas, ctx } = makeCanvas(rect);

  // 1. Direct HTML5 video frame capture.
  if (videoEl && videoEl.videoWidth) {
    try {
      ctx.drawImage(videoEl, 0, 0, rect.width, rect.height);
      const dataUrl = toDataUrl(canvas);
      if (dataUrl) {
        return {
          status: "captured",
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          captureMethod: "html5-video",
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  // 2. User-authorised screen capture, cropped to the player region.
  if (session?.active && viewportRect) {
    const grabbed = session.grab(viewportRect);
    const dataUrl = grabbed ? toDataUrl(grabbed) : null;
    if (grabbed && dataUrl) {
      return {
        status: "captured",
        dataUrl,
        width: grabbed.width,
        height: grabbed.height,
        captureMethod: "html5-video",
        // The screen grab already contains the on-screen ink.
        inkBaked: true,
      };
    }
  }

  // 3. Reference-only: YouTube thumbnail behind the ink (never a real frame).
  if (youtubeVideoId) {
    try {
      const img = await loadImage(youtubeThumbnail(youtubeVideoId));
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      const dataUrl = toDataUrl(canvas);
      if (dataUrl) {
        return {
          status: "reference-only",
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          captureMethod: "youtube-thumbnail",
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  // 4. Ink only.
  try {
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#11100e";
    ctx.fillRect(0, 0, rect.width, rect.height);
    const dataUrl = toDataUrl(canvas);
    if (dataUrl) {
      return {
        status: "unavailable",
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        captureMethod: "ink-only",
        inkBaked: false,
      };
    }
  } catch {
    /* ignore */
  }
  return { status: "failed", captureMethod: "none" };
}
