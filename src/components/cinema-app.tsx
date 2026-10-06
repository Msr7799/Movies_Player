"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Clapperboard, FolderOpen, History, Library, Menu, Play, Search,
  Sparkles, Upload, X,
} from "lucide-react";
import type { Movie, SubtitleTrack } from "@/lib/media-types";
import { VideoPlayer } from "./video-player";

type LibraryResponse = { movies: Movie[] };

const SAMPLE_MOVIE: Movie = {
  id: "welcome",
  title: "أضف فيلمك وابدأ المشاهدة",
  sources: [],
  subtitles: [],
};

export function CinemaApp() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [activeMovie, setActiveMovie] = useState<Movie>(SAMPLE_MOVIE);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = (await response.json()) as LibraryResponse;
      setMovies(data.movies);
      setActiveMovie((current) => current.id === "welcome" && data.movies[0] ? data.movies[0] : current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLibrary(); }, [loadLibrary]);
  useEffect(() => () => objectUrls.current.forEach(URL.revokeObjectURL), []);

  const filteredMovies = useMemo(
    () => movies.filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase())),
    [movies, query],
  );

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
    setActiveMovie({
      id: `local-${video.name}`,
      title: video.name.replace(/\.[^.]+$/, ""),
      sources: [{ quality: "أصلي", url: videoUrl, size: video.size }],
      subtitles,
    });
    setSidebarOpen(false);
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#09090b]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-4 px-4 sm:px-7">
          <button
            className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="فتح المكتبة"
          ><Menu /></button>
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-700 shadow-lg shadow-rose-950/40">
              <Play className="mr-0.5 fill-white" size={19} />
            </span>
            <div>
              <div className="text-lg font-black tracking-tight">سينما</div>
              <div className="text-[9px] tracking-[.24em] text-zinc-500">CINEMA PLAYER</div>
            </div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md sm:block">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث في مكتبتك..."
              className="h-11 w-full rounded-full border border-white/8 bg-white/[.045] pr-11 pl-4 text-sm outline-none transition focus:border-rose-500/50 focus:bg-white/[.065]"
            />
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            className="mr-auto flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-rose-100 sm:text-sm"
          >
            <FolderOpen size={17} />
            <span className="hidden sm:inline">فتح ملف</span>
          </button>
          <a
            href="https://github.com/msr7799"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-zinc-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-white"
            aria-label="حساب المطور MSR على GitHub"
          >
            <Image src="/assets/github.svg" alt="" width={17} height={17} className="invert" />
            <span className="hidden xl:inline">مطور الموقع <strong className="text-rose-400">MSR</strong></span>
            <span className="hidden sm:inline xl:hidden">MSR</span>
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

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <LibrarySidebar
          movies={filteredMovies}
          activeId={activeMovie.id}
          loading={loading}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelect={(movie) => { setActiveMovie(movie); setSidebarOpen(false); }}
        />

        <section className="min-w-0 px-3 py-5 sm:px-7 sm:py-8 lg:px-10">
          <div className="animate-fade-up mx-auto max-w-[1250px]">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-rose-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
                  يعرض الآن
                </div>
                <h1 className="line-clamp-1 text-xl font-bold sm:text-2xl">{activeMovie.title}</h1>
              </div>
              {activeMovie.sources.length > 0 && (
                <span className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-zinc-400 sm:block">
                  {activeMovie.sources.length} {activeMovie.sources.length > 1 ? "جودات" : "مصدر"}
                </span>
              )}
            </div>

            <VideoPlayer key={activeMovie.id} movie={activeMovie} onOpenFiles={() => fileInput.current?.click()} />

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <FeatureCard icon={<Sparkles size={18} />} title="صورة مرنة" text="تكبير وقص وتعبئة الشاشة بالطريقة التي تفضلها." />
              <FeatureCard icon={<Clapperboard size={18} />} title="تحكم كامل" text="جودة وسرعة وصوت واختصارات لوحة مفاتيح." />
              <FeatureCard icon={<Upload size={18} />} title="ملفاتك محليًا" text="كل المشاهدة تتم من جهازك دون رفع الفيلم." />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LibrarySidebar({ movies, activeId, loading, open, onClose, onSelect }: {
  movies: Movie[];
  activeId: string;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSelect: (movie: Movie) => void;
}) {
  return (
    <>
      {open && <button className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={onClose} aria-label="إغلاق المكتبة" />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-[290px] border-l border-white/5 bg-[#0e0e11] p-4 transition-transform lg:sticky lg:top-[72px] lg:z-20 lg:h-[calc(100vh-72px)] lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="mb-6 flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-sm font-bold"><Library size={17} className="text-rose-400" /> مكتبتي</div>
          <button className="p-2 text-zinc-500 lg:hidden" onClick={onClose}><X size={18} /></button>
        </div>
        <nav className="mb-7 space-y-1 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-rose-500/10 px-3 py-2.5 font-semibold text-rose-300"><Clapperboard size={17} /> الأفلام</div>
          <div className="flex items-center gap-3 px-3 py-2.5 text-zinc-500"><History size={17} /> شوهد مؤخرًا</div>
        </nav>
        <div className="mb-3 flex items-center justify-between px-1 text-[11px] font-bold text-zinc-500">
          <span>قائمة الأفلام</span><span>{movies.length}</span>
        </div>
        <div className="space-y-2 overflow-y-auto lg:max-h-[calc(100vh-270px)]">
          {loading && <div className="rounded-xl bg-white/5 p-4 text-xs text-zinc-500">جارِ قراءة مجلد assets...</div>}
          {!loading && movies.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs leading-6 text-zinc-500">
              أضف فيلمًا إلى<br /><code dir="ltr" className="text-zinc-300">public/assets/videos</code>
            </div>
          )}
          {movies.map((movie) => (
            <button
              key={movie.id}
              onClick={() => onSelect(movie)}
              className={`group flex w-full items-center gap-3 rounded-xl p-2 text-right transition ${activeId === movie.id ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              <span className="relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950">
                {movie.poster ? <Image src={movie.poster} alt="" fill sizes="80px" unoptimized className="object-cover" /> : <Clapperboard size={19} className="text-zinc-600" />}
                <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition group-hover:opacity-100"><Play size={16} className="fill-white" /></span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{movie.title}</span>
                <span className="mt-1 block text-[10px] text-zinc-500">{movie.sources[0]?.quality}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
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
