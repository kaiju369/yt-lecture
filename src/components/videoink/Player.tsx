import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { loadYouTubeApi } from "@/lib/videoink/youtube";

export type PlayerSource =
  | { type: "youtube"; videoId: string; title: string }
  | { type: "file"; url: string; title: string }
  | { type: "url"; url: string; title: string };

export interface PlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  isPlaying: () => boolean;
  getVideoElement: () => HTMLVideoElement | null;
  getAspectRatio: () => number;
  requestPictureInPicture: () => void;
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (t: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;
  mute: () => void;
  unMute: () => void;
  getVideoData?: () => { title?: string };
  destroy: () => void;
}

interface Props {
  source: PlayerSource | null;
  /** exact pixel rect of the visible video content, so the iframe matches the ink layer */
  fit?: { left: number; top: number; width: number; height: number } | undefined;
  onReady?: (info: { duration: number; title: string; aspect: number }) => void;
  onPlayStateChange?: (playing: boolean) => void;
}

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { source, fit, onReady, onPlayStateChange },
  ref,
) {
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const stateCb = useRef(onPlayStateChange);
  stateCb.current = onPlayStateChange;

  useEffect(() => {
    if (!source || source.type !== "youtube") {
      ytRef.current?.destroy();
      ytRef.current = null;
      return;
    }
    let cancelled = false;
    setAspect(16 / 9);
    loadYouTubeApi().then(() => {
      if (cancelled || !ytHostRef.current) return;
      const YT = (window as unknown as Record<string, any>)["YT"];
      ytRef.current?.destroy();
      ytHostRef.current.innerHTML = "";
      const mount = document.createElement("div");
      mount.className = "h-full w-full";
      ytHostRef.current.appendChild(mount);
      ytRef.current = new YT.Player(mount, {
        videoId: source.videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            const data = e.target.getVideoData?.();
            readyCb.current?.({
              duration: e.target.getDuration(),
              title: data?.title || source.title,
              aspect: 16 / 9,
            });
          },
          onStateChange: (e: { data: number }) => {
            stateCb.current?.(e.data === 1);
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  useImperativeHandle(
    ref,
    (): PlayerHandle => ({
      play: () => {
        if (ytRef.current) ytRef.current.playVideo();
        else void videoRef.current?.play();
      },
      pause: () => {
        if (ytRef.current) ytRef.current.pauseVideo();
        else videoRef.current?.pause();
      },
      seek: (t) => {
        if (ytRef.current) ytRef.current.seekTo(t, true);
        else if (videoRef.current) videoRef.current.currentTime = t;
      },
      getCurrentTime: () =>
        ytRef.current?.getCurrentTime() ?? videoRef.current?.currentTime ?? 0,
      getDuration: () =>
        ytRef.current?.getDuration() ?? videoRef.current?.duration ?? 0,
      getPlaybackRate: () =>
        ytRef.current?.getPlaybackRate() ?? videoRef.current?.playbackRate ?? 1,
      setPlaybackRate: (r) => {
        if (ytRef.current) ytRef.current.setPlaybackRate(r);
        else if (videoRef.current) videoRef.current.playbackRate = r;
      },
      setVolume: (v) => {
        if (ytRef.current) ytRef.current.setVolume(Math.round(v * 100));
        else if (videoRef.current) videoRef.current.volume = v;
      },
      setMuted: (m) => {
        if (ytRef.current) m ? ytRef.current.mute() : ytRef.current.unMute();
        else if (videoRef.current) videoRef.current.muted = m;
      },
      isPlaying: () =>
        ytRef.current
          ? ytRef.current.getPlayerState() === 1
          : !!videoRef.current && !videoRef.current.paused,
      getVideoElement: () => (ytRef.current ? null : videoRef.current),
      getAspectRatio: () => aspect,
      requestPictureInPicture: () => {
        void videoRef.current?.requestPictureInPicture?.();
      },
    }),
    [aspect],
  );

  if (!source) return null;

  if (source.type === "youtube") {
    const box =
      fit && fit.width > 0 && fit.height > 0
        ? { left: fit.left, top: fit.top, width: fit.width, height: fit.height }
        : null;
    return (
      <div className="absolute inset-0">
        <div
          className="pointer-events-none absolute"
          style={
            box
              ? { left: box.left, top: box.top, width: box.width, height: box.height }
              : { inset: 0 }
          }
        >
          <div ref={ytHostRef} className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={source.url}
      playsInline
      className="absolute inset-0 h-full w-full object-contain"
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        const ar = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
        setAspect(ar);
        readyCb.current?.({ duration: v.duration, title: source.title, aspect: ar });
      }}
      onPlay={() => stateCb.current?.(true)}
      onPause={() => stateCb.current?.(false)}
    />
  );
});
