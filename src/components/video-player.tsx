"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions, Check, Download, FastForward, Gauge, Maximize,
  Minimize, Pause, PictureInPicture, Play, Rewind, Settings, Upload,
  Volume1, Volume2, VolumeX, X, ZoomIn,
} from "lucide-react";
import type { Movie, SubtitleTrack } from "@/lib/media-types";

type Cue = { start: number; end: number; text: string };
type SettingsPanel = "main" | "quality" | "speed" | "subtitles" | "appearance";
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

export function VideoPlayer({ movie, onOpenFiles }: { movie: Movie; onOpenFiles: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityState = useRef({ time: 0, playing: false });
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

  const activeSource = movie.sources.find((source) => source.url === sourceUrl) ?? movie.sources[0];
  const activeCue = useMemo(
    () => subtitleTrack ? cues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) : undefined,
    [cues, currentTime, subtitleTrack],
  );

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

  const showStatus = useCallback((text: string) => {
    setStatusText(text);
    window.setTimeout(() => setStatusText(""), 700);
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

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    const savedKey = `cinema-progress:${movie.id}`;
    const remembered = Number(localStorage.getItem(savedKey) ?? 0);
    const resumeAt = qualityState.current.time || (remembered < video.duration - 20 ? remembered : 0);
    if (resumeAt > 0) video.currentTime = resumeAt;
    if (qualityState.current.playing) void video.play();
    qualityState.current = { time: 0, playing: false };
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (Math.floor(video.currentTime) % 5 === 0) {
      localStorage.setItem(`cinema-progress:${movie.id}`, String(video.currentTime));
    }
  }

  if (!sourceUrl) {
    return (
      <div className="player-shadow relative grid aspect-video min-h-[300px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#050506] sm:rounded-3xl">
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
        className={`player-shadow relative aspect-video min-h-[260px] overflow-hidden bg-black ${isFullscreen ? "rounded-none" : "rounded-2xl sm:rounded-3xl"}`}
      >
        {!embedStarted ? (
          <button className="group absolute inset-0 size-full overflow-hidden text-white" onClick={() => setEmbedStarted(true)} aria-label={`تشغيل ${movie.title}`}>
            {movie.poster ? (
              <Image src={movie.poster} alt={`ملصق ${movie.title}`} fill priority sizes="(max-width: 1024px) 100vw, 80vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
            ) : (
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#111d2e,transparent_45%)]" />
            )}
            <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/20" />
            <span className="navy-glass absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-2xl shadow-black/70 transition group-hover:scale-110 group-hover:brightness-125">
              <Play className="mr-1 fill-white" size={32} />
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-6 pb-5 pt-16 text-right">
              <strong className="block text-base sm:text-xl">{movie.title}</strong>
              <span className="mt-1 block text-xs text-zinc-300">اضغط لتشغيل الفيلم عبر مشغّل VK</span>
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
      className={`player-shadow group relative aspect-video min-h-[260px] overflow-hidden bg-black ${isFullscreen ? "rounded-none" : "rounded-2xl sm:rounded-3xl"}`}
      onMouseMove={showControls}
      onMouseLeave={() => { if (isPlaying && !settingsOpen) setControlsVisible(false); }}
      onDoubleClick={() => void toggleFullscreen()}
    >
      <video
        ref={videoRef}
        src={sourceUrl}
        poster={movie.poster}
        className="size-full transition-transform duration-300"
        style={{ objectFit: fit, transform: `scale(${zoom / 100})` }}
        playsInline
        onClick={togglePlay}
        onPlay={() => { setIsPlaying(true); showControls(); }}
        onPause={() => { setIsPlaying(false); setControlsVisible(true); }}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={onTimeUpdate}
      />

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

      {!isPlaying && (
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
          <span className="mr-1 text-[10px] text-zinc-300 sm:text-xs" dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1" dir="ltr">
            {activeSource && <a className="control-button hidden sm:inline-flex" href={activeSource.url} download aria-label="تنزيل الفيلم"><Download size={19} /></a>}
            <button className={`control-button ${subtitleTrack ? "text-rose-400" : ""}`} onClick={() => setSubtitleTrack((track) => track ? null : (movie.subtitles[0] ?? null))} aria-label="الترجمة"><Captions size={21} /></button>
            <button className="control-button hidden sm:inline-flex" onClick={togglePiP} aria-label="صورة داخل صورة"><PictureInPicture size={19} /></button>
            <div className="relative">
              <button className={`control-button ${settingsOpen ? "bg-white/15" : ""}`} onClick={() => { setSettingsOpen((value) => !value); setPanel("main"); }} aria-label="الإعدادات"><Settings size={20} /></button>
              {settingsOpen && (
                <SettingsMenu
                  panel={panel} setPanel={setPanel} movie={movie} sourceUrl={sourceUrl}
                  changeQuality={changeQuality} speed={speed} setSpeed={(value) => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}
                  zoom={zoom} setZoom={setZoom} fit={fit} setFit={setFit}
                  subtitleTrack={subtitleTrack} setSubtitleTrack={setSubtitleTrack}
                  subtitleStyle={subtitleStyle} setSubtitleStyle={setSubtitleStyle}
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
  panel: SettingsPanel; setPanel: (panel: SettingsPanel) => void; movie: Movie;
  sourceUrl: string; changeQuality: (url: string) => void; speed: number; setSpeed: (speed: number) => void;
  zoom: number; setZoom: (zoom: number) => void; fit: "contain" | "cover"; setFit: (fit: "contain" | "cover") => void;
  subtitleTrack: SubtitleTrack | null; setSubtitleTrack: (track: SubtitleTrack | null) => void;
  subtitleStyle: SubtitleStyle; setSubtitleStyle: (style: SubtitleStyle) => void; onClose: () => void;
}) {
  const { panel, setPanel } = props;
  return (
    <div className="glass absolute bottom-14 left-0 w-[min(310px,calc(100vw-32px))] overflow-hidden rounded-2xl text-right text-white shadow-2xl" dir="rtl" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="flex h-12 items-center border-b border-white/8 px-3">
        {panel !== "main" && <button onClick={() => setPanel(panel === "appearance" ? "subtitles" : "main")} className="rounded-lg px-2 py-1 text-lg text-zinc-400 hover:bg-white/10">‹</button>}
        <span className="px-2 text-xs font-bold">{panelTitle(panel)}</span>
        <button className="mr-auto rounded-lg p-1.5 text-zinc-500 hover:bg-white/10" onClick={props.onClose}><X size={16} /></button>
      </div>
      <div className="max-h-[360px] overflow-y-auto p-2">
        {panel === "main" && (
          <>
            <SettingRow icon={<Gauge size={17} />} label="الجودة" value={props.movie.sources.find((source) => source.url === props.sourceUrl)?.quality ?? "أصلي"} onClick={() => setPanel("quality")} />
            <SettingRow icon={<FastForward size={17} />} label="سرعة التشغيل" value={`${props.speed}×`} onClick={() => setPanel("speed")} />
            <SettingRow icon={<Captions size={17} />} label="الترجمة" value={props.subtitleTrack?.label ?? "إيقاف"} onClick={() => setPanel("subtitles")} />
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
        {panel === "quality" && props.movie.sources.map((source) => (
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
      </div>
    </div>
  );
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
  return { main: "إعدادات المشغّل", quality: "الجودة", speed: "سرعة التشغيل", subtitles: "الترجمة", appearance: "تخصيص الترجمة" }[panel];
}

function hexWithAlpha(hex: string, opacity: number) {
  const alpha = Math.round((opacity / 100) * 255).toString(16).padStart(2, "0");
  return `${hex}${alpha}`;
}
