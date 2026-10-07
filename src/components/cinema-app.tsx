"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BarChart3, Clapperboard, FolderOpen, History, Library, Link2, Menu, Play, Search,
  Sparkles, Trash2, X,
} from "lucide-react";
import type { DiscoveryResult, Movie, PlaybackHistoryEntry, PlaybackHistorySnapshot, SubtitleTrack } from "@/lib/media-types";
import { trackAnalytics, visitorId } from "@/lib/browser-analytics";
import { MovieDiscovery } from "./movie-discovery";
import { VideoPlayer } from "./video-player";

type LibraryResponse = { movies: Movie[] };
type SidebarMode = "library" | "history";
type HistoryEntry = PlaybackHistoryEntry;

const HISTORY_KEY = "cinema-playback-history-v2";
const MAX_HISTORY_ENTRIES = 30;

const VEER_ZAARA_MOVIE: Movie = {
  id: "veer-zaara-2004",
  title: "فيلم فير زارا (2004) مترجم للعربية",
  poster: "/assets/posters/thumnail-veer-zara.png",
  sources: [{
    quality: "VK HD",
    url: "https://vk.com/video_ext.php?oid=848028866&id=456260186",
    size: 0,
    kind: "embed",
  }],
  subtitles: [],
};

function isRemotePersistable(movie: Movie) {
  return movie.sources.some((source) => !source.url.startsWith("blob:"));
}

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHistory(entries: HistoryEntry[]) {
  const limited = entries.slice(0, MAX_HISTORY_ENTRIES);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    return limited;
  } catch {
    const compact = limited.map((entry, index) => index < 12 || !entry.movie.poster?.startsWith("data:")
      ? entry
      : { ...entry, movie: { ...entry.movie, poster: undefined } });
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(compact)); } catch { /* Storage may be unavailable. */ }
    return compact;
  }
}

export function CinemaApp() {
  const [movies, setMovies] = useState<Movie[]>([VEER_ZAARA_MOVIE]);
  const [activeMovie, setActiveMovie] = useState<Movie>(VEER_ZAARA_MOVIE);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("library");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlPoster, setUrlPoster] = useState("");
  const [urlError, setUrlError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const remoteSyncTimes = useRef(new Map<string, number>());
  const smartTitleAttempts = useRef(new Set<string>());
  const smartTitleCompleted = useRef(new Set<string>());
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  const loadLibrary = useCallback(async () => {
    try {
      const [localResult, catalogResult, historyResult] = await Promise.allSettled([
        fetch("/api/library", { cache: "no-store" }).then((response) => response.json() as Promise<LibraryResponse>),
        fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json() as Promise<LibraryResponse>),
        fetch("/api/history", { cache: "no-store" }).then((response) => response.json() as Promise<{ history?: HistoryEntry[] }>),
      ]);
      const localMovies = localResult.status === "fulfilled" ? localResult.value.movies ?? [] : [];
      const publicMovies = catalogResult.status === "fulfilled" ? catalogResult.value.movies ?? [] : [];
      const publicHistory = historyResult.status === "fulfilled" ? historyResult.value.history ?? [] : [];
      const browserHistory = readHistory();
      setMovies((current) => {
        const merged = [VEER_ZAARA_MOVIE, ...publicMovies, ...localMovies, ...publicHistory.map((entry) => entry.movie), ...current];
        const unique = new Map<string, Movie>();
        for (const movie of merged) if (!unique.has(movie.id)) unique.set(movie.id, movie);
        return [...unique.values()];
      });
      setHistory((current) => {
        const merged = [...publicHistory, ...browserHistory, ...current].sort((a, b) => b.watchedAt - a.watchedAt);
        const unique = new Map<string, HistoryEntry>();
        for (const entry of merged) if (!unique.has(entry.movie.id)) unique.set(entry.movie.id, entry);
        return [...unique.values()].slice(0, MAX_HISTORY_ENTRIES);
      });
      const id = visitorId();
      void Promise.allSettled(browserHistory
        .filter((entry) => isRemotePersistable(entry.movie))
        .slice(0, MAX_HISTORY_ENTRIES)
        .map((entry) => fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorId: id, movie: entry.movie, snapshot: entry }),
        })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((session: { authenticated?: boolean }) => setAdminAuthenticated(session.authenticated === true))
      .catch(() => undefined);
    trackAnalytics("visit");
  }, [loadLibrary]);

  useEffect(() => () => objectUrls.current.forEach(URL.revokeObjectURL), []);

  const filteredMovies = useMemo(
    () => movies.filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase())),
    [movies, query],
  );

  const posterPreview = useMemo(() => {
    try {
      if (!urlPoster.trim()) return "";
      const value = new URL(urlPoster.trim());
      return ["http:", "https:"].includes(value.protocol) ? value.href : "";
    } catch {
      return "";
    }
  }, [urlPoster]);

  const filteredHistory = useMemo(
    () => history.filter((entry) => {
      const text = `${entry.movie.title} ${entry.details.currentQuality || ""} ${entry.details.sourceUrl}`.toLowerCase();
      return text.includes(query.toLowerCase());
    }),
    [history, query],
  );

  const updateHistory = useCallback((movie: Movie, snapshot: PlaybackHistorySnapshot) => {
    if (!isRemotePersistable(movie)) return;

    setHistory((current) => {
      const existing = current.find((item) => item.movie.id === movie.id);
      const movieWithPoster = movie.poster || !existing?.movie.poster
        ? movie
        : { ...movie, poster: existing.movie.poster };
      const nextEntry: HistoryEntry = { movie: movieWithPoster, ...snapshot };
      const next = [nextEntry, ...current.filter((item) => item.movie.id !== movie.id)]
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .slice(0, MAX_HISTORY_ENTRIES);
      return persistHistory(next);
    });
    const now = Date.now();
    const lastSync = remoteSyncTimes.current.get(movie.id) ?? 0;
    if (now - lastSync >= 15_000 || snapshot.progress === 0 || snapshot.progress >= snapshot.duration - 2) {
      remoteSyncTimes.current.set(movie.id, now);
      void fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorId(), movie, snapshot }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }, []);

  const updateMoviePoster = useCallback((movieId: string, poster: string) => {
    const applyPoster = (movie: Movie) => movie.id === movieId ? { ...movie, poster } : movie;
    setMovies((current) => current.map(applyPoster));
    setActiveMovie((current) => applyPoster(current));
    setHistory((current) => persistHistory(current.map((entry) => entry.movie.id === movieId
      ? { ...entry, movie: applyPoster(entry.movie) }
      : entry)));
    if (adminAuthenticated) {
      void fetch(`/api/admin/movies/${encodeURIComponent(movieId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poster }),
      }).catch(() => undefined);
    }
  }, [adminAuthenticated]);

  const updateMovieTitle = useCallback((movieId: string, title: string) => {
    const applyTitle = (movie: Movie) => movie.id === movieId ? { ...movie, title, titleOrigin: "smart" as const } : movie;
    setMovies((current) => current.map(applyTitle));
    setActiveMovie((current) => applyTitle(current));
    setHistory((current) => persistHistory(current.map((entry) => entry.movie.id === movieId
      ? { ...entry, movie: applyTitle(entry.movie) }
      : entry)));
    if (adminAuthenticated) {
      void fetch(`/api/admin/movies/${encodeURIComponent(movieId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, titleOrigin: "smart" }),
      }).catch(() => undefined);
    }
  }, [adminAuthenticated]);

  const identifyMovieTitle = useCallback(async (movie: Movie, poster: string, capturedAt: number) => {
    const genericFallback = /^(master|index|playlist|manifest|video|stream)$/i.test(movie.title.trim());
    if (capturedAt < 15 || movie.titleOrigin === "user" || movie.titleOrigin === "catalog" || movie.titleOrigin === "smart" || (!genericFallback && movie.titleOrigin !== "filename") || smartTitleCompleted.current.has(movie.id)) return;
    const checkpoint = capturedAt >= 90 ? 90 : capturedAt >= 40 ? 40 : 15;
    const attemptKey = `${movie.id}:${checkpoint}`;
    if (smartTitleAttempts.current.has(attemptKey)) return;
    smartTitleAttempts.current.add(attemptKey);
    try {
      const response = await fetch("/api/media/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poster, sourceUrl: movie.sources[0]?.url, currentTitle: movie.title, capturedAt }),
      });
      const result = await response.json() as { identified?: boolean; title?: string; year?: string };
      if (!response.ok || !result.identified || !result.title) return;
      const title = result.year && !result.title.includes(result.year) ? `${result.title} (${result.year})` : result.title;
      smartTitleCompleted.current.add(movie.id);
      updateMovieTitle(movie.id, title);
    } catch {
      // A later capture checkpoint can retry with a more useful frame.
    }
  }, [updateMovieTitle]);

  const selectMovie = useCallback((movie: Movie) => {
    setActiveMovie(movie);
    setSidebarOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("player-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  async function clearHistory() {
    if (!adminAuthenticated || !window.confirm("مسح سجل المشاهدة العام لكل الزوار؟")) return;
    const response = await fetch("/api/admin/history", { method: "DELETE" });
    if (!response.ok) return;
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }

  function openLocalFiles(files: FileList | null) {
    if (!files?.length) return;
    const all = Array.from(files);
    const video = all.find((file) => file.type.startsWith("video/"));
    if (!video) return;
    const videoUrl = URL.createObjectURL(video);
    objectUrls.current.push(videoUrl);
    const subtitles: SubtitleTrack[] = all
      .filter((file) => /\.(srt|vtt)$/i.test(file.name))
      .map((file) => {
        const url = URL.createObjectURL(file);
        objectUrls.current.push(url);
        return { label: file.name, language: "local", url };
      });
    const movie: Movie = {
      id: `local-${video.name}-${Date.now()}`,
      title: video.name.replace(/\.[^.]+$/, ""),
      sources: [{ quality: "أصلي", url: videoUrl, size: video.size, kind: "video" }],
      subtitles,
    };
    setMovies((current) => [movie, ...current]);
    setActiveMovie(movie);
    setSidebarOpen(false);
  }

  function openMovieUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUrlError("");

    let parsed: URL;
    try {
      parsed = new URL(urlValue.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
    } catch {
      setUrlError("أدخل رابط HTTP أو HTTPS صحيحًا.");
      return;
    }

    let poster: string | undefined;
    if (urlPoster.trim()) {
      try {
        const parsedPoster = new URL(urlPoster.trim());
        if (!["http:", "https:"].includes(parsedPoster.protocol)) throw new Error("unsupported poster protocol");
        poster = parsedPoster.href;
      } catch {
        setUrlError("رابط الصورة المصغرة غير صحيح.");
        return;
      }
    }

    const isVkEmbed = /(^|\.)vk\.com$/i.test(parsed.hostname) && parsed.pathname.endsWith("/video_ext.php");
    const isHls = /\.m3u8$/i.test(parsed.pathname) || /\.m3u8(?:\?|#)/i.test(parsed.href);
    const filename = decodeURIComponent(parsed.pathname.split("/").pop() ?? "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();

    const kind = isVkEmbed ? "embed" : isHls ? "hls" : "video";
    const quality = isVkEmbed ? "VK" : isHls ? "HLS • تلقائي" : "رابط مباشر";

    const movie: Movie = {
      id: `url-${Date.now()}`,
      title: urlTitle.trim() || (isVkEmbed ? "فيلم من VK" : filename || parsed.hostname),
      titleOrigin: urlTitle.trim() ? "user" : "filename",
      poster,
      sources: [{ quality, url: parsed.href, size: 0, kind }],
      subtitles: [],
    };

    setMovies((current) => [movie, ...current]);
    setActiveMovie(movie);
    setUrlValue("");
    setUrlTitle("");
    setUrlPoster("");
    setUrlDialogOpen(false);
    setSidebarMode("library");
    setSidebarOpen(false);
    trackAnalytics("play", { movieId: movie.id });
    if (adminAuthenticated) {
      void fetch("/api/admin/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie),
      }).catch(() => undefined);
    }
  }

  function playDiscoveredResult(result: DiscoveryResult) {
    if (!result.playable || !result.playUrl || !result.kind) return;
    const movie: Movie = {
      id: `discovered-${Date.now()}`,
      title: result.title,
      sources: [{ quality: result.provider, url: result.playUrl, size: 0, kind: result.kind }],
      subtitles: [],
    };
    setMovies((current) => [movie, ...current]);
    setActiveMovie(movie);
    trackAnalytics("play", { movieId: movie.id });
    if (adminAuthenticated) {
      void fetch("/api/admin/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie),
      }).catch(() => undefined);
    }
    window.setTimeout(() => document.getElementById("player-stage")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#09090b]/85 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-[1600px] items-center gap-2 px-3 py-2 sm:h-[72px] sm:gap-4 sm:px-7 sm:py-0">
          <button
            className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="فتح المكتبة"
          ><Menu /></button>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <span className="navy-glass grid size-10 place-items-center rounded-xl">
              <Play className="mr-0.5 fill-white" size={19} />
            </span>
            <div className="hidden min-[400px]:block">
              <div className="text-lg font-black tracking-tight">سينما</div>
              <div className="text-[9px] tracking-[.24em] text-zinc-500">CINEMA PLAYER</div>
            </div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md xl:block">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={sidebarMode === "history" ? "ابحث في سجل المشاهدة..." : "ابحث في مكتبتك..."}
              className="h-11 w-full rounded-full border border-white/8 bg-white/[.045] pr-11 pl-4 text-sm outline-none transition focus:border-rose-500/50 focus:bg-white/[.065]"
            />
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            className="mr-auto flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-rose-100 sm:px-4 sm:text-sm"
          >
            <FolderOpen size={17} />
            <span className="hidden sm:inline">فتح ملف</span>
          </button>
          <button
            onClick={() => { setUrlError(""); setUrlDialogOpen(true); }}
            className="navy-glass flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-100 transition hover:brightness-125 sm:px-4 sm:text-sm"
          >
            <Link2 size={17} />
            <span className="hidden sm:inline">فتح رابط</span>
          </button>
          <a
            href="https://github.com/msr7799"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-zinc-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-white min-[520px]:flex"
            aria-label="حساب المطور MSR على GitHub"
          >
            <Image src="/assets/github.svg" alt="" width={17} height={17} className="invert" />
            <span className="hidden xl:inline">مطور الموقع <strong className="text-rose-400">MSR</strong></span>
            <span className="hidden sm:inline xl:hidden">MSR</span>
          </a>
          <a
            href="/admin"
            className={`hidden shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition sm:flex ${adminAuthenticated ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"}`}
            aria-label="لوحة الإدارة"
          >
            <BarChart3 size={16} />
            <span className="hidden xl:inline">{adminAuthenticated ? "الإدارة مفعّلة" : "الإدارة"}</span>
          </a>
          <input
            ref={fileInput}
            type="file"
            accept="video/*,.srt,.vtt"
            multiple
            hidden
            onChange={(event) => openLocalFiles(event.target.files)}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <LibrarySidebar
          movies={filteredMovies}
          history={filteredHistory}
          mode={sidebarMode}
          setMode={setSidebarMode}
          activeId={activeMovie.id}
          loading={loading}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          canManage={adminAuthenticated}
          onClearHistory={() => void clearHistory()}
          onSelect={selectMovie}
        />

        <section className="min-w-0 px-2.5 py-4 sm:px-7 sm:py-8 lg:px-10">
          <div className="animate-fade-up mx-auto max-w-[1250px]">
            <MovieDiscovery onPlay={playDiscoveredResult} />

            <div id="player-stage" className="mb-4 scroll-mt-20 flex items-end justify-between gap-3 sm:mb-5 sm:scroll-mt-24 sm:gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-rose-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
                  يعرض الآن
                </div>
                <h1 className="line-clamp-1 text-xl font-bold sm:text-2xl">{activeMovie.title}</h1>
              </div>
              {activeMovie.sources.length > 0 && (
                <span className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-zinc-400 sm:block">
                  {activeMovie.sources[0]?.kind === "hls" ? "HLS" : `${activeMovie.sources.length} ${activeMovie.sources.length > 1 ? "جودات" : "مصدر"}`}
                </span>
              )}
            </div>

            <VideoPlayer
              key={activeMovie.id}
              movie={activeMovie}
              onOpenFiles={() => fileInput.current?.click()}
              onHistoryUpdate={(snapshot) => updateHistory(activeMovie, snapshot)}
              onPosterGenerated={(poster, capturedAt) => {
                updateMoviePoster(activeMovie.id, poster);
                void identifyMovieTitle(activeMovie, poster, capturedAt);
              }}
            />

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <FeatureCard icon={<Sparkles size={18} />} title="HLS والجودات" text="تشغيل قوائم m3u8 مع اختيار تلقائي أو يدوي للجودة وعرض تفاصيل البث." />
              <FeatureCard icon={<Clapperboard size={18} />} title="تفاصيل الوسائط" text="الدقة والمدة والبتريت والكودك والرابط الحالي في لوحة التفاصيل." />
              <FeatureCard icon={<History size={18} />} title="سجل المشاهدة" text="يحفظ الصورة المصغرة والتقدم ومعلومات المصدر ليستأنف الفيلم لاحقًا." />
            </div>
          </div>
        </section>
      </div>

      {urlDialogOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/75 p-2.5 backdrop-blur-sm sm:p-4" onMouseDown={() => setUrlDialogOpen(false)}>
          <form
            onSubmit={openMovieUrl}
            onMouseDown={(event) => event.stopPropagation()}
            className="glass my-auto max-h-[calc(100dvh-20px)] w-full max-w-xl overflow-y-auto rounded-2xl p-4 shadow-2xl sm:max-h-[calc(100dvh-32px)] sm:rounded-3xl sm:p-7"
            dir="rtl"
          >
            <div className="mb-6 flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rose-500/15 text-rose-400"><Link2 size={22} /></span>
              <div>
                <h2 className="text-lg font-black">تشغيل فيلم من رابط</h2>
                <p className="mt-1 text-xs leading-6 text-zinc-500">يدعم HLS بصيغة m3u8 وMP4/WebM وروابط مشغّل VK. يلتقط صورة مصغرة تلقائيًا أثناء التشغيل، ويمكنك وضع صورة مخصصة بدلًا منها.</p>
              </div>
              <button type="button" onClick={() => setUrlDialogOpen(false)} className="mr-auto rounded-xl p-2 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label="إغلاق"><X size={19} /></button>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs font-bold text-zinc-300">رابط الفيلم أو HLS</span>
              <input
                type="url"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://example.com/master.m3u8"
                autoFocus
                required
                dir="ltr"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-left text-sm outline-none transition placeholder:text-zinc-700 focus:border-rose-500/60"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-xs font-bold text-zinc-300">اسم الفيلم <span className="font-normal text-zinc-600">(اختياري)</span></span>
              <input
                value={urlTitle}
                onChange={(event) => setUrlTitle(event.target.value)}
                placeholder="اسم يظهر في المكتبة والهستوري"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm outline-none transition placeholder:text-zinc-700 focus:border-rose-500/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-zinc-300">رابط صورة مخصصة <span className="font-normal text-zinc-600">(اختياري — وإلا تُلتقط تلقائيًا)</span></span>
              <input
                type="url"
                value={urlPoster}
                onChange={(event) => setUrlPoster(event.target.value)}
                placeholder="https://example.com/poster.jpg"
                dir="ltr"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-left text-sm outline-none transition placeholder:text-zinc-700 focus:border-rose-500/60"
              />
            </label>
            {posterPreview && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2">
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                  <Image src={posterPreview} alt="معاينة الصورة" fill sizes="96px" unoptimized className="object-cover" />
                </div>
                <p className="text-xs leading-6 text-zinc-500">ستستخدم هذه الصورة كـThumbnail وتُحفظ مع الفيلم في سجل المشاهدة.</p>
              </div>
            )}
            {urlError && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{urlError}</p>}
            <button type="submit" className="navy-glass mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black transition hover:brightness-125">
              <Play size={18} className="fill-white" /> تشغيل الرابط
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function LibrarySidebar({ movies, history, mode, setMode, activeId, loading, open, onClose, onSelect, canManage, onClearHistory }: {
  movies: Movie[];
  history: HistoryEntry[];
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  activeId: string;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSelect: (movie: Movie) => void;
  canManage: boolean;
  onClearHistory: () => void;
}) {
  const count = mode === "library" ? movies.length : history.length;

  return (
    <>
      {open && <button className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={onClose} aria-label="إغلاق المكتبة" />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-[min(88vw,330px)] border-l border-white/5 bg-[#0e0e11] p-4 transition-transform lg:sticky lg:top-[72px] lg:z-20 lg:h-[calc(100vh-72px)] lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="mb-6 flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-sm font-bold"><Library size={17} className="text-rose-400" /> مكتبتي</div>
          <button className="p-2 text-zinc-500 lg:hidden" onClick={onClose}><X size={18} /></button>
        </div>
        <nav className="mb-5 space-y-1 text-sm">
          <button onClick={() => setMode("library")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right font-semibold ${mode === "library" ? "navy-glass text-rose-200" : "text-zinc-500 hover:bg-white/5"}`}><Clapperboard size={17} /> الأفلام</button>
          <button onClick={() => setMode("history")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right font-semibold ${mode === "history" ? "navy-glass text-rose-200" : "text-zinc-500 hover:bg-white/5"}`}><History size={17} /> شوهد مؤخرًا</button>
        </nav>
        <div className="mb-3 flex items-center justify-between px-1 text-[11px] font-bold text-zinc-500">
          <span>{mode === "history" ? "سجل المشاهدة" : "قائمة الأفلام"}</span>
          <span className="flex items-center gap-2">
            {count}
            {mode === "history" && history.length > 0 && canManage && (
              <button onClick={onClearHistory} className="rounded p-1 text-zinc-600 hover:bg-white/10 hover:text-red-300" title="مسح السجل"><Trash2 size={13} /></button>
            )}
          </span>
        </div>
        <div className="space-y-2 overflow-y-auto lg:max-h-[calc(100vh-250px)]">
          {mode === "library" && loading && <div className="rounded-xl bg-white/5 p-4 text-xs text-zinc-500">جارِ قراءة مجلد assets...</div>}
          {mode === "library" && !loading && movies.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs leading-6 text-zinc-500">أضف فيلمًا إلى البرنامج</div>
          )}
          {mode === "history" && history.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs leading-6 text-zinc-500">سيظهر هنا أي فيلم تبدأ تشغيله من رابط.</div>
          )}

          {mode === "library" && movies.map((movie) => (
            <MovieSidebarCard key={movie.id} movie={movie} active={activeId === movie.id} onSelect={() => onSelect(movie)} />
          ))}

          {mode === "history" && history.map((entry) => {
            const percent = entry.duration > 0 ? Math.min(100, Math.round((entry.progress / entry.duration) * 100)) : 0;
            return (
              <MovieSidebarCard
                key={entry.movie.id}
                movie={entry.movie}
                active={activeId === entry.movie.id}
                onSelect={() => onSelect(entry.movie)}
                meta={`${entry.details.currentQuality || entry.details.type}${percent ? ` • ${percent}%` : ""}`}
                progress={percent}
              />
            );
          })}
        </div>
      </aside>
    </>
  );
}

function MovieSidebarCard({ movie, active, onSelect, meta, progress }: {
  movie: Movie;
  active: boolean;
  onSelect: () => void;
  meta?: string;
  progress?: number;
}) {
  return (
    <button onClick={onSelect} className={`group flex w-full items-center gap-3 rounded-xl p-2 text-right transition ${active ? "navy-glass" : "hover:bg-white/5"}`}>
      <span className="relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950">
        {movie.poster ? <Image src={movie.poster} alt="" fill sizes="80px" unoptimized className="object-cover" /> : <Clapperboard size={19} className="text-zinc-600" />}
        <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition group-hover:opacity-100"><Play size={16} className="fill-white" /></span>
        {typeof progress === "number" && progress > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><span className="block h-full bg-rose-300" style={{ width: `${progress}%` }} /></span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold">{movie.title}</span>
        <span className="mt-1 block truncate text-[10px] text-zinc-500">{meta || movie.sources[0]?.quality}</span>
      </span>
    </button>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="text-rose-400">{icon}</span>{title}</div>
      <p className="text-xs leading-6 text-zinc-500">{text}</p>
    </div>
  );
}
