"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions, Check, Download, FastForward, Gauge, Info, Maximize,
  Minimize, Pause, PictureInPicture, Play, Rewind, Settings, Upload,
  Volume1, Volume2, VolumeX, X, ZoomIn,
} from "lucide-react";
import type { MediaDetails, Movie, PlaybackHistorySnapshot, SubtitleTrack } from "@/lib/media-types";
import { loadHlsLibrary, normalizeHlsLevels, type HlsInstanceLike, type HlsLevelInfo } from "@/lib/hls-runtime";

type Cue = { start: number; end: number; text: string };
type SettingsPanel = "main" | "quality" | "speed" | "subtitles" | "appearance" | "details";
type SubtitleStyle = {
  size: number;
  color: string;
  background: string;
  opacity: number;
  position: number;
  weight: number;
  shadow: boolean;
};

const DEFAULT_STYLE: SubtitleStyle = {
  size: 28,
  color: "#ffffff",
  background: "#000000",
  opacity: 72,
  position: 11,
  weight: 700,
  shadow: true,
};

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const THUMBNAIL_CAPTURE_TIMES = [2, 15, 40, 90];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function timestampToSeconds(value: string) {
  const bits = value.trim().replace(",", ".").split(":").map(Number);
  if (bits.length === 3) return bits[0] * 3600 + bits[1] * 60 + bits[2];
  return bits[0] * 60 + bits[1];
}

function parseSubtitles(content: string): Cue[] {
  const normalized = content.replace(/^WEBVTT[^\n]*\n/i, "").replace(/\r/g, "").trim();
  return normalized.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return [];
    const [from, to] = lines[timingIndex].split("-->");
    const text = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (!text) return [];
    return [{ start: timestampToSeconds(from), end: timestampToSeconds(to.split(/\s/)[0]), text }];
  });
}

function isHlsUrl(url: string) {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

function bitrateLabel(value?: number) {
  if (!value) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(value / 1000)} Kbps`;
}

function sourceHost(url: string) {
  try { return new URL(url).host; } catch { return "—"; }
}

export function VideoPlayer({ movie, onOpenFiles, onHistoryUpdate, onPosterGenerated }: {
  movie: Movie;
  onOpenFiles: () => void;
  onHistoryUpdate?: (snapshot: PlaybackHistorySnapshot) => void;
  onPosterGenerated?: (poster: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityState = useRef({ time: 0, playing: false });
  const hlsRef = useRef<HlsInstanceLike | null>(null);
  const historySecondRef = useRef(-1);
  const thumbnailCheckpointsRef = useRef(new Set<number>());
  const hasCustomPosterRef = useRef(Boolean(movie.poster && !movie.poster.startsWith("data:")));
  const hlsNetworkRetriesRef = useRef(0);
  const hlsRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sourceUrl, setSourceUrl] = useState(() => movie.sources[0]?.url ?? "");
  const [embedStarted, setEmbedStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panel, setPanel] = useState<SettingsPanel>("main");
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrack | null>(() => movie.subtitles[0] ?? null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() => {
    if (typeof window === "undefined") return DEFAULT_STYLE;
    try {
      const saved = localStorage.getItem("cinema-subtitle-style");
      return saved ? { ...DEFAULT_STYLE, ...JSON.parse(saved) } : DEFAULT_STYLE;
    } catch { return DEFAULT_STYLE; }
  });
  const [statusText, setStatusText] = useState("");
  const [hlsLevels, setHlsLevels] = useState<HlsLevelInfo[]>([]);
  const [hlsLevel, setHlsLevel] = useState(-1);
  const [hlsAuto, setHlsAuto] = useState(true);
  const [hlsError, setHlsError] = useState("");
  const [hlsEngine, setHlsEngine] = useState<"hls.js" | "native" | "">("");
  const [videoResolution, setVideoResolution] = useState("");

  const activeSource = movie.sources.find((source) => source.url === sourceUrl) ?? movie.sources[0];
  const isHls = activeSource?.kind === "hls" || isHlsUrl(sourceUrl);
  const activeHlsLevel = hlsLevel >= 0 ? hlsLevels.find((level) => level.index === hlsLevel) : undefined;
  const qualityText = isHls
    ? hlsAuto
      ? `تلقائي${activeHlsLevel ? ` • ${activeHlsLevel.label}` : ""}`
      : activeHlsLevel?.label ?? "HLS"
    : activeSource?.quality ?? "أصلي";

  const activeCue = useMemo(
    () => subtitleTrack ? cues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) : undefined,
    [cues, currentTime, subtitleTrack],
  );

  const mediaDetails = useMemo<MediaDetails>(() => {
    const level = activeHlsLevel;
    return {
      type: activeSource?.kind === "embed" ? "Embed" : isHls ? "HLS" : "Direct",
      sourceUrl,
      currentQuality: qualityText,
      resolution: level?.width && level?.height ? `${level.width}×${level.height}` : videoResolution || undefined,
      bitrate: level?.bitrate,
      codecs: level?.codecs,
      duration,
      availableQualities: isHls ? hlsLevels.map((item) => ({
        label: item.label,
        width: item.width,
        height: item.height,
        bitrate: item.bitrate,
        codecs: item.codecs,
      })) : movie.sources.map((source) => ({ label: source.quality })),
      error: hlsError || undefined,
    };
  }, [activeHlsLevel, activeSource?.kind, duration, hlsError, hlsLevels, isHls, movie.sources, qualityText, sourceUrl, videoResolution]);

  const emitHistory = useCallback((progress?: number, forcedDuration?: number) => {
    if (!onHistoryUpdate || !sourceUrl || sourceUrl.startsWith("blob:")) return;
    onHistoryUpdate({
      progress: progress ?? videoRef.current?.currentTime ?? currentTime,
      duration: forcedDuration ?? videoRef.current?.duration ?? duration,
      watchedAt: Date.now(),
      details: mediaDetails,
    });
  }, [currentTime, duration, mediaDetails, onHistoryUpdate, sourceUrl]);

  const captureVideoPoster = useCallback((video: HTMLVideoElement) => {
    if (!onPosterGenerated || hasCustomPosterRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!context) return;

      const sourceRatio = video.videoWidth / video.videoHeight;
      const targetRatio = canvas.width / canvas.height;
      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      if (sourceRatio > targetRatio) {
        sw = video.videoHeight * targetRatio;
        sx = (video.videoWidth - sw) / 2;
      } else if (sourceRatio < targetRatio) {
        sh = video.videoWidth / targetRatio;
        sy = (video.videoHeight - sh) / 2;
      }
      context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let samples = 0;
      let sum = 0;
      let sumSquares = 0;
      for (let index = 0; index < pixels.length; index += 64) {
        const lightness = pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722;
        sum += lightness;
        sumSquares += lightness * lightness;
        samples += 1;
      }
      const mean = sum / samples;
      const variance = (sumSquares / samples) - (mean * mean);
      if (mean < 10 || mean > 246 || variance < 45) return;

      let poster = canvas.toDataURL("image/webp", .7);
      if (!poster.startsWith("data:image/webp") || poster.length > 110_000) {
        poster = canvas.toDataURL("image/jpeg", .62);
      }
      if (poster.length > 140_000) return;
      onPosterGenerated(poster);
    } catch {
      // Cross-origin streams may play but still forbid canvas frame extraction.
    }
  }, [onPosterGenerated]);

  useEffect(() => {
    localStorage.setItem("cinema-subtitle-style", JSON.stringify(subtitleStyle));
  }, [subtitleStyle]);

  useEffect(() => {
    if (!subtitleTrack) return;
    let cancelled = false;
    fetch(subtitleTrack.url)
      .then((response) => response.text())
      .then((text) => { if (!cancelled) setCues(parseSubtitles(text)); })
      .catch(() => { if (!cancelled) setCues([]); });
    return () => { cancelled = true; };
  }, [subtitleTrack]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceUrl || activeSource?.kind === "embed") return;

    let cancelled = false;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setHlsLevels([]);
    setHlsLevel(-1);
    setHlsAuto(true);
    setHlsError("");
    setHlsEngine("");
    setVideoResolution("");
    hlsNetworkRetriesRef.current = 0;
    if (hlsRecoveryTimerRef.current) clearTimeout(hlsRecoveryTimerRef.current);

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!isHls) {
      video.src = sourceUrl;
      video.load();
      return;
    }

    void loadHlsLibrary().then((Hls) => {
      if (cancelled) return;

      if (Hls?.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });
        hlsRef.current = hls;
        setHlsEngine("hls.js");

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          const levels = normalizeHlsLevels(hls.levels || []);
          setHlsLevels(levels);
          const savedLevel = localStorage.getItem(`cinema-hls-quality:${movie.id}`);
          const savedIndex = savedLevel && savedLevel !== "auto" ? Number(savedLevel) : -1;
          if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < levels.length) {
            hls.currentLevel = savedIndex;
            setHlsLevel(savedIndex);
            setHlsAuto(false);
          } else {
            hls.currentLevel = -1;
            setHlsAuto(true);
          }
          hlsNetworkRetriesRef.current = 0;
          setHlsError("");
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, rawData) => {
          const data = rawData as { level?: number };
          if (typeof data.level === "number") setHlsLevel(data.level);
        });

        hls.on(Hls.Events.ERROR, (_event, rawData) => {
          const data = rawData as { fatal?: boolean; type?: string; details?: string; reason?: string; response?: { code?: number } };
          const code = data.response?.code;
          const reason = data.reason || data.details || data.type || "خطأ غير معروف";
          if (data.fatal) {
            if (Hls.ErrorTypes?.NETWORK_ERROR && data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsNetworkRetriesRef.current < 3) {
              hlsNetworkRetriesRef.current += 1;
              const attempt = hlsNetworkRetriesRef.current;
              setHlsError(`انقطع الاتصال بالبث • إعادة المحاولة ${attempt}/3`);
              hlsRecoveryTimerRef.current = setTimeout(() => {
                if (!cancelled && hlsRef.current === hls) {
                  setHlsError("");
                  hls.startLoad();
                }
              }, attempt * 1500);
              return;
            }
            if (Hls.ErrorTypes?.MEDIA_ERROR && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              try {
                hls.recoverMediaError();
                setHlsError("");
                return;
              } catch { /* Fall through to the visible fatal error. */ }
            }
            setHlsError(`${code ? `HTTP ${code} • ` : ""}${reason}`);
          }
        });

        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        setHlsEngine("native");
        video.src = sourceUrl;
        video.load();
        return;
      }

      setHlsError("المتصفح لا يدعم HLS وتعذر تحميل مكتبة hls.js.");
    });

    return () => {
      cancelled = true;
      if (hlsRecoveryTimerRef.current) clearTimeout(hlsRecoveryTimerRef.current);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [activeSource?.kind, isHls, movie.id, sourceUrl]);

  const showStatus = useCallback((text: string) => {
    setStatusText(text);
    window.setTimeout(() => setStatusText(""), 900);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !sourceUrl) return;
    if (video.paused) void video.play(); else video.pause();
  }, [sourceUrl]);

  const skip = useCallback((amount: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + amount, 0), video.duration || 0);
    showStatus(`${amount > 0 ? "+" : ""}${amount} ث`);
  }, [showStatus]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.volume > 0) {
      setPreviousVolume(video.volume);
      video.volume = 0;
      setVolume(0);
    } else {
      video.volume = previousVolume || 1;
      setVolume(previousVolume || 1);
    }
  }, [previousVolume]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) await container.requestFullscreen();
    else await document.exitFullscreen();
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !("pictureInPictureEnabled" in document)) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { showStatus("PiP غير متاح"); }
  }, [showStatus]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      const key = event.key.toLowerCase();
      if ([" ", "k", "arrowleft", "arrowright", "m", "f", "c", "j", "l"].includes(key)) event.preventDefault();
      if (key === " " || key === "k") togglePlay();
      if (key === "arrowleft" || key === "j") skip(-10);
      if (key === "arrowright" || key === "l") skip(10);
      if (key === "m") toggleMute();
      if (key === "f") void toggleFullscreen();
      if (key === "c") setSubtitleTrack((current) => current ? null : (movie.subtitles[0] ?? null));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [movie.subtitles, skip, toggleFullscreen, toggleMute, togglePlay]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: movie.title,
      artist: sourceHost(sourceUrl),
      album: "Cinema Player",
      artwork: movie.poster ? [{ src: movie.poster, sizes: "320x180" }] : [],
    });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => { if (videoRef.current) void videoRef.current.play(); }],
      ["pause", () => videoRef.current?.pause()],
      ["seekbackward", (details) => skip(-(details.seekOffset || 10))],
      ["seekforward", (details) => skip(details.seekOffset || 10)],
      ["seekto", (details) => {
        const video = videoRef.current;
        if (!video || details.seekTime === undefined) return;
        if (details.fastSeek && "fastSeek" in video) video.fastSeek(details.seekTime);
        else video.currentTime = details.seekTime;
      }],
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported action. */ }
      }
    };
  }, [movie.poster, movie.title, skip, sourceUrl]);

  function showControls() {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (isPlaying && !settingsOpen) hideTimer.current = setTimeout(() => setControlsVisible(false), 2600);
  }

  function changeQuality(url: string) {
    const video = videoRef.current;
    if (!video || url === sourceUrl) return;
    qualityState.current = { time: video.currentTime, playing: !video.paused };
    setSourceUrl(url);
  }

  function changeHlsLevel(index: number | null) {
    const hls = hlsRef.current;
    if (!hls) return;
    if (index === null) {
      hls.currentLevel = -1;
      setHlsAuto(true);
      localStorage.setItem(`cinema-hls-quality:${movie.id}`, "auto");
      showStatus("الجودة: تلقائي");
      return;
    }
    hls.currentLevel = index;
    setHlsAuto(false);
    localStorage.setItem(`cinema-hls-quality:${movie.id}`, String(index));
    const level = hlsLevels.find((item) => item.index === index);
    showStatus(`الجودة: ${level?.label ?? index}`);
  }

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    setVideoResolution(video.videoWidth && video.videoHeight ? `${video.videoWidth}×${video.videoHeight}` : "");
    const savedKey = `cinema-progress:${movie.id}`;
    const remembered = Number(localStorage.getItem(savedKey) ?? 0);
    const resumeAt = qualityState.current.time || (remembered < video.duration - 20 ? remembered : 0);
    if (resumeAt > 0) video.currentTime = resumeAt;
    if (qualityState.current.playing) void video.play();
    qualityState.current = { time: 0, playing: false };
    emitHistory(resumeAt, video.duration || 0);
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if ("mediaSession" in navigator && Number.isFinite(video.duration) && video.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: video.duration,
          playbackRate: video.playbackRate,
          position: Math.min(video.currentTime, video.duration),
        });
      } catch { /* Position state is optional. */ }
    }
    const second = Math.floor(video.currentTime);
    const checkpoint = THUMBNAIL_CAPTURE_TIMES.find((time) => second >= time && !thumbnailCheckpointsRef.current.has(time));
    if (checkpoint !== undefined) {
      thumbnailCheckpointsRef.current.add(checkpoint);
      captureVideoPoster(video);
    }
    if (second % 5 === 0 && second !== historySecondRef.current) {
      historySecondRef.current = second;
      localStorage.setItem(`cinema-progress:${movie.id}`, String(video.currentTime));
      emitHistory(video.currentTime, video.duration || 0);
    }
  }

  function startEmbed() {
    setEmbedStarted(true);
    if (onHistoryUpdate && sourceUrl && !sourceUrl.startsWith("blob:")) {
      onHistoryUpdate({
        progress: 0,
        duration: 0,
        watchedAt: Date.now(),
        details: {
          type: "Embed",
          sourceUrl,
          currentQuality: activeSource?.quality,
        },
      });
    }
  }

  if (!sourceUrl) {
    return (
      <div className="player-shadow relative grid aspect-video min-h-[230px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#050506] sm:min-h-[300px] sm:rounded-3xl">
        <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 50% 35%, #111d2e, transparent 38%), radial-gradient(circle at 50% 115%, #0b1523, transparent 45%)" }} />
        <div className="relative z-10 max-w-md px-6 text-center">
          <span className="navy-glass mx-auto mb-5 grid size-20 place-items-center rounded-full text-rose-300">
            <Upload size={32} />
          </span>
          <h2 className="mb-2 text-xl font-bold">المسرح جاهز لفيلمك</h2>
          <p className="mb-6 text-sm leading-7 text-zinc-500">ضع الفيلم داخل مجلد assets ليظهر تلقائيًا، أو افتحه مباشرة من جهازك.</p>
          <button onClick={onOpenFiles} className="navy-glass rounded-xl px-5 py-3 text-sm font-bold transition hover:brightness-125">اختيار فيلم من الجهاز</button>
        </div>
      </div>
    );
  }

  if (activeSource?.kind === "embed") {
    return (
      <div
        ref={containerRef}
        className={`player-shadow relative aspect-video min-h-[190px] overflow-hidden bg-black sm:min-h-[260px] ${isFullscreen ? "rounded-none" : "rounded-2xl sm:rounded-3xl"}`}
      >
        {!embedStarted ? (
          <button className="group absolute inset-0 size-full overflow-hidden text-white" onClick={startEmbed} aria-label={`تشغيل ${movie.title}`}>
            {movie.poster ? (
              <Image src={movie.poster} alt={`ملصق ${movie.title}`} fill priority sizes="(max-width: 1024px) 100vw, 80vw" unoptimized className="object-cover transition duration-500 group-hover:scale-[1.02]" />
            ) : (
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#111d2e,transparent_45%)]" />
            )}
            <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/20" />
            <span className="navy-glass absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-2xl shadow-black/70 transition group-hover:scale-110 group-hover:brightness-125">
              <Play className="mr-1 fill-white" size={32} />
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-12 text-right sm:px-6 sm:pb-5 sm:pt-16">
              <strong className="block text-base sm:text-xl">{movie.title}</strong>
              <span className="mt-1 block text-xs text-zinc-300">اضغط لتشغيل المشغّل المضمّن</span>
            </span>
          </button>
        ) : (
          <iframe
            src={sourceUrl}
            title={movie.title}
            className="size-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}

        <button
          className="absolute left-3 top-3 z-20 grid size-10 place-items-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-md transition hover:bg-rose-500"
          onClick={() => void toggleFullscreen()}
          aria-label="ملء الشاشة"
        >
          {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`player-shadow group relative aspect-video min-h-[190px] overflow-hidden bg-black sm:min-h-[260px] ${isFullscreen ? "rounded-none" : "rounded-2xl sm:rounded-3xl"}`}
      onMouseMove={showControls}
      onMouseLeave={() => { if (isPlaying && !settingsOpen) setControlsVisible(false); }}
      onDoubleClick={() => void toggleFullscreen()}
    >
      <video
        ref={videoRef}
        poster={movie.poster}
        crossOrigin={isHls ? "anonymous" : undefined}
        className="size-full transition-transform duration-300"
        style={{ objectFit: fit, transform: `scale(${zoom / 100})` }}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onPlay={() => { setIsPlaying(true); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; showControls(); emitHistory(); }}
        onPause={() => { setIsPlaying(false); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; setControlsVisible(true); }}
        onEnded={() => { setIsPlaying(false); emitHistory(duration, duration); }}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={onTimeUpdate}
        onResize={(event) => {
          const target = event.currentTarget;
          if (target.videoWidth && target.videoHeight) setVideoResolution(`${target.videoWidth}×${target.videoHeight}`);
        }}
      />

      {hlsError && (
        <div className="absolute inset-x-4 top-4 z-30 rounded-xl border border-red-400/25 bg-red-950/80 p-3 text-right text-xs leading-6 text-red-100 backdrop-blur-md" dir="rtl">
          <strong className="block text-sm">تعذر تحميل HLS</strong>
          <span className="text-red-200/80">{hlsError}</span>
          <span className="mt-1 block text-[10px] text-red-200/60">قد يكون الرابط منتهي الصلاحية أو السيرفر يمنع CORS/Origin من هذا الموقع.</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
        {statusText && <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-bold backdrop-blur-md">{statusText}</span>}
      </div>

      {activeCue && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-3" style={{ bottom: `${subtitleStyle.position}%` }}>
          <span
            className="subtitle-line"
            style={{
              fontSize: `${subtitleStyle.size}px`, color: subtitleStyle.color,
              backgroundColor: hexWithAlpha(subtitleStyle.background, subtitleStyle.opacity),
              fontWeight: subtitleStyle.weight,
              textShadow: subtitleStyle.shadow ? "0 2px 4px #000, 0 0 12px #000" : "none",
            }}
          >{activeCue.text}</span>
        </div>
      )}

      {!isPlaying && !hlsError && (
        <button onClick={togglePlay} className="navy-glass absolute left-1/2 top-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white transition hover:scale-110 hover:brightness-125 sm:size-20" aria-label="تشغيل">
          <Play className="mr-1 fill-white" size={30} />
        </button>
      )}

      <div className={`player-controls absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-20 transition-opacity duration-300 sm:px-5 sm:pb-4 ${controlsVisible || !isPlaying ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }}
          className="video-range mb-2"
          style={{ "--progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
          aria-label="موضع الفيديو"
        />
        <div className="flex items-center gap-0.5 sm:gap-1.5" dir="ltr">
          <button className="control-button" onClick={togglePlay} aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}>{isPlaying ? <Pause size={21} className="fill-white" /> : <Play size={21} className="fill-white" />}</button>
          <button className="control-button hidden sm:inline-flex" onClick={() => skip(-10)} aria-label="رجوع 10 ثوانٍ"><Rewind size={20} /></button>
          <button className="control-button hidden sm:inline-flex" onClick={() => skip(10)} aria-label="تقديم 10 ثوانٍ"><FastForward size={20} /></button>
          <div className="group/volume flex items-center">
            <button className="control-button" onClick={toggleMute} aria-label="كتم الصوت">
              {volume === 0 ? <VolumeX size={21} /> : volume < .5 ? <Volume1 size={21} /> : <Volume2 size={21} />}
            </button>
            <input
              type="range" min={0} max={1} step={.02} value={volume}
              onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (videoRef.current) videoRef.current.volume = value; }}
              className="hidden w-20 accent-rose-500 sm:block"
              aria-label="مستوى الصوت"
            />
          </div>
          <span className="mr-1 hidden text-[10px] text-zinc-300 min-[380px]:inline sm:text-xs" dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1" dir="ltr">
            {activeSource && !isHls && <a className="control-button hidden sm:inline-flex" href={activeSource.url} download aria-label="تنزيل الفيلم"><Download size={19} /></a>}
            <button className={`control-button ${subtitleTrack ? "text-rose-400" : ""}`} onClick={() => setSubtitleTrack((track) => track ? null : (movie.subtitles[0] ?? null))} aria-label="الترجمة"><Captions size={21} /></button>
            <button className="control-button hidden sm:inline-flex" onClick={togglePiP} aria-label="صورة داخل صورة"><PictureInPicture size={19} /></button>
            <div className="relative">
              <button className={`control-button ${settingsOpen ? "bg-white/15" : ""}`} onClick={() => { setSettingsOpen((value) => !value); setPanel("main"); }} aria-label="الإعدادات"><Settings size={20} /></button>
              {settingsOpen && (
                <SettingsMenu
                  panel={panel}
                  setPanel={setPanel}
                  movie={movie}
                  sourceUrl={sourceUrl}
                  changeQuality={changeQuality}
                  isHls={isHls}
                  hlsLevels={hlsLevels}
                  hlsLevel={hlsLevel}
                  hlsAuto={hlsAuto}
                  changeHlsLevel={changeHlsLevel}
                  speed={speed}
                  setSpeed={(value) => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}
                  zoom={zoom}
                  setZoom={setZoom}
                  fit={fit}
                  setFit={setFit}
                  subtitleTrack={subtitleTrack}
                  setSubtitleTrack={setSubtitleTrack}
                  subtitleStyle={subtitleStyle}
                  setSubtitleStyle={setSubtitleStyle}
                  details={mediaDetails}
                  hlsEngine={hlsEngine}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>
            <button className="control-button" onClick={() => void toggleFullscreen()} aria-label="ملء الشاشة">{isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsMenu(props: {
  panel: SettingsPanel;
  setPanel: (panel: SettingsPanel) => void;
  movie: Movie;
  sourceUrl: string;
  changeQuality: (url: string) => void;
  isHls: boolean;
  hlsLevels: HlsLevelInfo[];
  hlsLevel: number;
  hlsAuto: boolean;
  changeHlsLevel: (index: number | null) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  fit: "contain" | "cover";
  setFit: (fit: "contain" | "cover") => void;
  subtitleTrack: SubtitleTrack | null;
  setSubtitleTrack: (track: SubtitleTrack | null) => void;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: (style: SubtitleStyle) => void;
  details: MediaDetails;
  hlsEngine: string;
  onClose: () => void;
}) {
  const { panel, setPanel } = props;
  const currentLevel = props.hlsLevels.find((level) => level.index === props.hlsLevel);
  const currentQuality = props.isHls
    ? props.hlsAuto ? `تلقائي${currentLevel ? ` • ${currentLevel.label}` : ""}` : currentLevel?.label ?? "HLS"
    : props.movie.sources.find((source) => source.url === props.sourceUrl)?.quality ?? "أصلي";

  return (
    <div className="glass fixed inset-x-3 bottom-20 z-50 max-h-[min(76dvh,500px)] overflow-hidden rounded-2xl text-right text-white shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-14 sm:left-0 sm:z-auto sm:w-[min(340px,calc(100vw-32px))]" dir="rtl" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="flex h-12 items-center border-b border-white/8 px-3">
        {panel !== "main" && <button onClick={() => setPanel(panel === "appearance" ? "subtitles" : "main")} className="rounded-lg px-2 py-1 text-lg text-zinc-400 hover:bg-white/10">‹</button>}
        <span className="px-2 text-xs font-bold">{panelTitle(panel)}</span>
        <button className="mr-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/10" onClick={props.onClose}><X size={16} /></button>
      </div>
      <div className="max-h-[430px] overflow-y-auto p-2">
        {panel === "main" && (
          <>
            <SettingRow icon={<Gauge size={17} />} label="الجودة" value={currentQuality} onClick={() => setPanel("quality")} />
            <SettingRow icon={<FastForward size={17} />} label="سرعة التشغيل" value={`${props.speed}×`} onClick={() => setPanel("speed")} />
            <SettingRow icon={<Captions size={17} />} label="الترجمة" value={props.subtitleTrack?.label ?? "إيقاف"} onClick={() => setPanel("subtitles")} />
            <SettingRow icon={<Info size={17} />} label="تفاصيل الوسائط" value={props.details.type} onClick={() => setPanel("details")} />
            <div className="mt-2 border-t border-white/8 pt-2">
              <div className="mb-2 flex items-center gap-2 px-2 text-xs font-bold"><ZoomIn size={16} className="text-rose-400" /> تكبير الصورة <span className="mr-auto text-zinc-500">{props.zoom}%</span></div>
              <input className="w-full" type="range" min={100} max={160} step={5} value={props.zoom} onChange={(event) => props.setZoom(Number(event.target.value))} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => props.setFit("contain")} className={`rounded-lg px-2 py-2 text-[11px] ${props.fit === "contain" ? "bg-rose-500 text-white" : "bg-white/5 text-zinc-400"}`}>احتواء</button>
                <button onClick={() => props.setFit("cover")} className={`rounded-lg px-2 py-2 text-[11px] ${props.fit === "cover" ? "bg-rose-500 text-white" : "bg-white/5 text-zinc-400"}`}>ملء الإطار</button>
              </div>
            </div>
          </>
        )}

        {panel === "quality" && props.isHls && (
          <>
            <ChoiceRow label="تلقائي (Adaptive)" active={props.hlsAuto} onClick={() => { props.changeHlsLevel(null); setPanel("main"); }} />
            {props.hlsLevels.length === 0 && <div className="px-3 py-3 text-xs leading-6 text-zinc-500">بانتظار قراءة Master Playlist واكتشاف الجودات...</div>}
            {[...props.hlsLevels].sort((a, b) => (b.height || 0) - (a.height || 0)).map((level) => (
              <ChoiceRow
                key={level.index}
                label={`${level.label}${level.bitrate ? ` • ${bitrateLabel(level.bitrate)}` : ""}`}
                active={!props.hlsAuto && level.index === props.hlsLevel}
                onClick={() => { props.changeHlsLevel(level.index); setPanel("main"); }}
              />
            ))}
          </>
        )}

        {panel === "quality" && !props.isHls && props.movie.sources.map((source) => (
          <ChoiceRow key={source.url} label={source.quality} active={source.url === props.sourceUrl} onClick={() => { props.changeQuality(source.url); setPanel("main"); }} />
        ))}

        {panel === "speed" && speeds.map((value) => (
          <ChoiceRow key={value} label={value === 1 ? "عادي" : `${value}×`} active={value === props.speed} onClick={() => { props.setSpeed(value); setPanel("main"); }} />
        ))}

        {panel === "subtitles" && (
          <>
            <ChoiceRow label="إيقاف الترجمة" active={!props.subtitleTrack} onClick={() => props.setSubtitleTrack(null)} />
            {props.movie.subtitles.map((track) => <ChoiceRow key={track.url} label={track.label} active={track.url === props.subtitleTrack?.url} onClick={() => props.setSubtitleTrack(track)} />)}
            <button onClick={() => setPanel("appearance")} className="mt-2 flex w-full items-center gap-3 rounded-xl border-t border-white/8 px-3 py-3 text-xs font-bold text-rose-300 hover:bg-white/5"><Settings size={16} /> تخصيص شكل الترجمة <span className="mr-auto">‹</span></button>
          </>
        )}

        {panel === "appearance" && <SubtitleAppearance style={props.subtitleStyle} onChange={props.setSubtitleStyle} />}
        {panel === "details" && <MediaDetailsPanel details={props.details} hlsEngine={props.hlsEngine} poster={props.movie.poster} />}
      </div>
    </div>
  );
}

function MediaDetailsPanel({ details, hlsEngine, poster }: { details: MediaDetails; hlsEngine: string; poster?: string }) {
  return (
    <div className="space-y-2 p-1 text-[11px]">
      {poster && (
        <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-black">
          <Image src={poster} alt="الصورة المصغرة" fill sizes="320px" unoptimized className="object-cover" />
        </div>
      )}
      <DetailRow label="النوع" value={details.type} />
      {details.type === "HLS" && <DetailRow label="المحرّك" value={hlsEngine || "جارِ التحميل"} />}
      <DetailRow label="الجودة الحالية" value={details.currentQuality || "—"} />
      <DetailRow label="الدقة" value={details.resolution || "—"} />
      <DetailRow label="Bitrate" value={bitrateLabel(details.bitrate)} />
      <DetailRow label="Codec" value={details.codecs || "—"} />
      <DetailRow label="المدة" value={details.duration ? formatTime(details.duration) : "—"} />
      <DetailRow label="السيرفر" value={sourceHost(details.sourceUrl)} ltr />
      <div className="rounded-xl bg-black/25 p-2">
        <div className="mb-1 text-zinc-500">الرابط</div>
        <div className="break-all text-left font-mono text-[9px] leading-5 text-zinc-300" dir="ltr">{details.sourceUrl}</div>
      </div>
      {details.availableQualities && details.availableQualities.length > 0 && (
        <div className="rounded-xl bg-black/25 p-2">
          <div className="mb-2 text-zinc-500">الجودات المتاحة ({details.availableQualities.length})</div>
          <div className="space-y-1">
            {details.availableQualities.map((quality, index) => (
              <div key={`${quality.label}-${index}`} className="flex justify-between gap-3 rounded-lg bg-white/[.035] px-2 py-1.5">
                <span>{quality.label}</span>
                <span className="text-zinc-500" dir="ltr">{bitrateLabel(quality.bitrate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {details.error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-red-200">{details.error}</div>}
    </div>
  );
}

function DetailRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="flex items-start justify-between gap-4 rounded-xl bg-white/[.035] px-3 py-2"><span className="text-zinc-500">{label}</span><span className="max-w-[65%] text-left text-zinc-200" dir={ltr ? "ltr" : undefined}>{value}</span></div>;
}

function SettingRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs hover:bg-white/7"><span className="text-zinc-400">{icon}</span><span>{label}</span><span className="mr-auto text-zinc-500">{value} ‹</span></button>;
}

function ChoiceRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex w-full items-center rounded-xl px-3 py-2.5 text-xs ${active ? "bg-rose-500/12 text-rose-300" : "hover:bg-white/7"}`}><span>{label}</span>{active && <Check className="mr-auto" size={16} />}</button>;
}

function SubtitleAppearance({ style, onChange }: { style: SubtitleStyle; onChange: (style: SubtitleStyle) => void }) {
  const set = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => onChange({ ...style, [key]: value });
  return (
    <div className="space-y-4 px-2 py-1 text-[11px]">
      <RangeSetting label="حجم الخط" value={`${style.size}px`} min={16} max={48} valueNumber={style.size} onChange={(value) => set("size", value)} />
      <RangeSetting label="شفافية الخلفية" value={`${style.opacity}%`} min={0} max={100} valueNumber={style.opacity} onChange={(value) => set("opacity", value)} />
      <RangeSetting label="الموضع" value={`${style.position}%`} min={4} max={45} valueNumber={style.position} onChange={(value) => set("position", value)} />
      <div className="flex items-center justify-between"><span>لون الخط</span><input type="color" value={style.color} onChange={(event) => set("color", event.target.value)} className="h-8 w-12 rounded border-0 bg-transparent" /></div>
      <div className="flex items-center justify-between"><span>لون الخلفية</span><input type="color" value={style.background} onChange={(event) => set("background", event.target.value)} className="h-8 w-12 rounded border-0 bg-transparent" /></div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => set("weight", style.weight === 700 ? 400 : 700)} className={`rounded-lg p-2 ${style.weight === 700 ? "bg-rose-500" : "bg-white/5"}`}>خط عريض</button>
        <button onClick={() => set("shadow", !style.shadow)} className={`rounded-lg p-2 ${style.shadow ? "bg-rose-500" : "bg-white/5"}`}>ظل النص</button>
      </div>
      <button onClick={() => onChange(DEFAULT_STYLE)} className="w-full rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5">استعادة الافتراضي</button>
    </div>
  );
}

function RangeSetting({ label, value, min, max, valueNumber, onChange }: { label: string; value: string; min: number; max: number; valueNumber: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 flex justify-between"><span>{label}</span><span className="text-zinc-500">{value}</span></span><input className="w-full" type="range" min={min} max={max} value={valueNumber} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function panelTitle(panel: SettingsPanel) {
  return {
    main: "إعدادات المشغّل",
    quality: "الجودة",
    speed: "سرعة التشغيل",
    subtitles: "الترجمة",
    appearance: "تخصيص الترجمة",
    details: "تفاصيل الوسائط",
  }[panel];
}

function hexWithAlpha(hex: string, opacity: number) {
  const alpha = Math.round((opacity / 100) * 255).toString(16).padStart(2, "0");
  return `${hex}${alpha}`;
}
