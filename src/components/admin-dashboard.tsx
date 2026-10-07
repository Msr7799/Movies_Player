"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, CheckSquare, Clapperboard, Download, Eye, LogOut, Pencil, Play, Plus, Save, Search, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Movie } from "@/lib/media-types";
import { MOVIE_CATEGORIES, MOVIE_CATEGORY_LABELS, type MovieCategory } from "@/lib/movie-categories";

type AdminStats = {
  movieCount: number;
  historyCount: number;
  uniqueVisitors: number;
  visits: number;
  searches: number;
  topMovies: Array<{ _id: string; title: string; poster?: string; plays: number; lastPlayedAt: number }>;
  recentActivity: Array<{ movieId: string; movie: Movie; progress: number; duration: number; watchedAt: number }>;
};

type EditorState = {
  id?: string;
  title: string;
  description: string;
  parameters: string;
  url: string;
  poster: string;
  quality: string;
  kind: "hls" | "video" | "embed";
  categories: MovieCategory[];
};

type AdminHistoryEntry = { movieId: string; movie: Movie; progress: number; duration: number; watchedAt: number };
type ImportPreviewItem = { key: string; title: string; poster: string; qualities: number; raw: unknown };

function bracketBalance(value: string, opening: "[" | "{", closing: "]" | "}") {
  let balance = 0;
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) { escaped = false; continue; }
    if (inString && character === "\\") { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (!inString && character === opening) balance += 1;
    if (!inString && character === closing) balance -= 1;
  }
  return balance;
}

function parseImportJson(value: string) {
  const normalized = value.replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new Error("ملف JSON فارغ.");
  try {
    return { parsed: JSON.parse(normalized) as unknown, repaired: false };
  } catch (cause) {
    let repaired = normalized.replace(/,\s*([}\]])/g, "$1");
    if (/"movies"\s*:/.test(repaired) && bracketBalance(repaired, "[", "]") === 1 && repaired.endsWith("}")) {
      repaired = `${repaired.slice(0, -1).trimEnd()}\n]\n}`;
    }
    try {
      return { parsed: JSON.parse(repaired) as unknown, repaired: repaired !== normalized };
    } catch {
      const detail = cause instanceof Error ? cause.message : "صيغة JSON غير صالحة.";
      throw new Error(`JSON غير صالح: ${detail}`);
    }
  }
}

const EMPTY_EDITOR: EditorState = { title: "", description: "", parameters: "{}", url: "", poster: "", quality: "HLS • تلقائي", kind: "hls", categories: [] };

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) throw new Error(`${label}: أعاد الخادم استجابة فارغة (HTTP ${response.status}).`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}: أعاد الخادم استجابة غير صالحة (HTTP ${response.status}).`);
  }
}

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [history, setHistory] = useState<AdminHistoryEntry[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedMovies, setSelectedMovies] = useState<string[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<string[]>([]);
  const [importJson, setImportJson] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [autoClassify, setAutoClassify] = useState(true);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewItem[]>([]);
  const [selectedImport, setSelectedImport] = useState<string[]>([]);
  const [importDragKey, setImportDragKey] = useState("");
  const [dashboardWarning, setDashboardWarning] = useState("");
  const [editorPanelOpen, setEditorPanelOpen] = useState(true);

  const loadDashboard = useCallback(async () => {
    const [catalogResponse, statsResponse, historyResponse] = await Promise.all([
      fetch("/api/catalog", { cache: "no-store" }),
      fetch("/api/admin/stats", { cache: "no-store" }),
      fetch("/api/admin/history", { cache: "no-store" }),
    ]);
    if (statsResponse.status === 401) {
      setAuthenticated(false);
      return;
    }
    const outcomes = await Promise.allSettled([
      (async () => {
        const payload = await readJsonResponse<{ movies?: Movie[]; error?: string }>(catalogResponse, "تحميل المكتبة");
        if (!catalogResponse.ok) throw new Error(payload.error || `تعذر تحميل المكتبة (HTTP ${catalogResponse.status}).`);
        setMovies(payload.movies ?? []);
      })(),
      (async () => {
        const payload = await readJsonResponse<AdminStats & { error?: string }>(statsResponse, "تحميل الإحصائيات");
        if (!statsResponse.ok) throw new Error(payload.error || `تعذر تحميل الإحصائيات (HTTP ${statsResponse.status}).`);
        setStats(payload);
      })(),
      (async () => {
        const payload = await readJsonResponse<{ history?: AdminHistoryEntry[]; error?: string }>(historyResponse, "تحميل سجل المشاهدة");
        if (!historyResponse.ok) throw new Error(payload.error || `تعذر تحميل سجل المشاهدة (HTTP ${historyResponse.status}).`);
        setHistory(payload.history ?? []);
      })(),
    ]);
    const failures = outcomes.flatMap((outcome) => outcome.status === "rejected"
      ? [outcome.reason instanceof Error ? outcome.reason.message : "تعذر تحميل جزء من لوحة الإدارة."]
      : []);
    setDashboardWarning(failures.join(" "));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((session: { authenticated: boolean; configured: boolean }) => {
        setAuthenticated(session.authenticated);
        setConfigured(session.configured);
        if (session.authenticated) void loadDashboard();
      })
      .catch(() => setAuthenticated(false));
    return () => controller.abort();
  }, [loadDashboard]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تسجيل الدخول.");
      setAuthenticated(true);
      setPassword("");
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setStats(null);
  }

  async function saveMovie(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let parsedParameters: Movie["parameters"];
    try {
      const parsed = JSON.parse(editor.parameters || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      parsedParameters = parsed as Movie["parameters"];
    } catch {
      setError("الباراميترات يجب أن تكون JSON object صالحًا.");
      setBusy(false);
      return;
    }
    const movie: Movie = {
      id: editor.id || `movie-${crypto.randomUUID()}`,
      title: editor.title,
      description: editor.description,
      parameters: parsedParameters,
      poster: editor.poster || undefined,
      categories: editor.categories,
      sources: [{ quality: editor.quality || "أصلي", url: editor.url, size: 0, kind: editor.kind }],
      subtitles: [],
    };
    const endpoint = editor.id ? `/api/admin/movies/${encodeURIComponent(editor.id)}` : "/api/admin/movies";
    try {
      const response = await fetch(endpoint, {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر حفظ الفيلم.");
      setEditor(EMPTY_EDITOR);
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الفيلم.");
    } finally {
      setBusy(false);
    }
  }

  function editMovie(movie: Movie) {
    const source = movie.sources[0];
    setEditor({
      id: movie.id,
      title: movie.title,
      description: movie.description || "",
      parameters: JSON.stringify(movie.parameters ?? {}, null, 2),
      url: source?.url || "",
      poster: movie.poster || "",
      quality: source?.quality || "أصلي",
      kind: source?.kind === "hls" || source?.kind === "embed" ? source.kind : "video",
      categories: movie.categories ?? [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportHistoryJson() {
    const payload = {
      schema: "any-movie-history-export",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      movieCount: history.length,
      movies: history.map((entry) => ({
        ...entry.movie,
        playback: { progress: entry.progress, duration: entry.duration, watchedAt: entry.watchedAt },
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `any-movie-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteMovie(movie: Movie) {
    if (!window.confirm(`حذف «${movie.title}» من المكتبة العامة والسجل؟`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/movies/${encodeURIComponent(movie.id)}`, { method: "DELETE" });
    if (response.ok) await loadDashboard();
    else setError("تعذر حذف الفيلم.");
    setBusy(false);
  }

  async function deleteHistory(movieId: string) {
    if (!window.confirm("حذف هذا الفيلم من سجل المشاهدة العام؟")) return;
    const response = await fetch(`/api/admin/history/${encodeURIComponent(movieId)}`, { method: "DELETE" });
    if (response.ok) await loadDashboard();
    else setError("تعذر حذف سجل الفيلم.");
  }

  async function renameHistory(entry: AdminHistoryEntry) {
    const title = window.prompt("الاسم الجديد في شوهد مؤخرًا:", entry.movie.title)?.trim();
    if (!title || title === entry.movie.title) return;
    const response = await fetch(`/api/admin/history/${encodeURIComponent(entry.movieId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (response.ok) await loadDashboard();
    else setError("تعذر تعديل اسم الفيلم في السجل.");
  }

  async function deleteSelectedHistory() {
    if (!selectedHistory.length || !window.confirm(`حذف ${selectedHistory.length} فيلمًا محددًا من شوهد مؤخرًا؟`)) return;
    const response = await fetch("/api/admin/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieIds: selectedHistory }),
    });
    if (response.ok) { setSelectedHistory([]); await loadDashboard(); }
    else setError("تعذر حذف العناصر المحددة.");
  }

  async function classifyIds(ids: string[]) {
    let updated = 0;
    for (let index = 0; index < ids.length; index += 40) {
      const response = await fetch("/api/admin/movies/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(index, index + 40) }),
      });
      const payload = await readJsonResponse<{ error?: string; diagnostic?: string; updated?: number }>(response, "تصنيف Gemini");
      if (!response.ok) {
        const diagnostic = payload.diagnostic ? ` (${payload.diagnostic})` : "";
        throw new Error(`${payload.error || "فشل تصنيف Gemini."}${diagnostic}`);
      }
      updated += payload.updated ?? 0;
    }
    return updated;
  }

  async function classifySelected() {
    const ids = selectedMovies.length ? selectedMovies : movies.filter((movie) => movie.title.toLowerCase().includes(libraryQuery.toLowerCase())).slice(0, 120).map((movie) => movie.id);
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      const updated = await classifyIds(ids);
      setSelectedMovies([]);
      await loadDashboard();
      setImportMessage(`صنّف Gemini ${updated} فيلمًا.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فشل تصنيف Gemini.");
    } finally { setBusy(false); }
  }

  function parseImportPreview(value = importJson) {
    const { parsed, repaired } = parseImportJson(value);
    let records: unknown[] = [];
    if (Array.isArray(parsed)) records = parsed;
    else if (parsed && typeof parsed === "object") {
      const object = parsed as Record<string, unknown>;
      if (Array.isArray(object.movies)) records = object.movies;
      else if ((typeof object.title === "string" || typeof object.name === "string") && (Array.isArray(object.qualities) || Array.isArray(object.streams) || Array.isArray(object.sources) || typeof object.url === "string")) records = [object];
      else records = Object.values(object);
    }
    const preview = records.flatMap((record, index): ImportPreviewItem[] => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return [];
      const item = record as Record<string, unknown>;
      const title = String(item.title ?? item.name ?? "").trim();
      const sources = [item.qualities, item.streams, item.sources].find(Array.isArray) as unknown[] | undefined;
      if (!title || (!sources?.length && typeof item.url !== "string")) return [];
      return [{
        key: `${String(item.id ?? title)}-${index}`,
        title,
        poster: String(item.thumbnailURL ?? item.thumbnail ?? item.poster ?? item.image ?? ""),
        qualities: sources?.length ?? 1,
        raw: record,
      }];
    });
    if (!preview.length) throw new Error("لم يتم العثور على أفلام صالحة داخل JSON.");
    setImportPreview(preview);
    setSelectedImport([]);
    setImportError("");
    setImportMessage(`${repaired ? "تم إصلاح قوس مصفوفة movies أو فاصلة زائدة تلقائيًا. " : ""}تمت معاينة ${preview.length} فيلمًا. رتّب القائمة واحذف غير المطلوب ثم انشر.`);
    return preview;
  }

  function removeSelectedImport() {
    setImportPreview((current) => current.filter((item) => !selectedImport.includes(item.key)));
    setSelectedImport([]);
  }

  function reorderImport(targetKey: string) {
    if (!importDragKey || importDragKey === targetKey) return;
    setImportPreview((current) => {
      const from = current.findIndex((item) => item.key === importDragKey);
      const to = current.findIndex((item) => item.key === targetKey);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [dragged] = next.splice(from, 1);
      next.splice(to, 0, dragged);
      return next;
    });
    setImportDragKey("");
  }

  async function importCatalog() {
    setBusy(true); setImportMessage(""); setImportError("");
    try {
      if (!rightsConfirmed) throw new Error("أكد حقوق نشر المصادر قبل الاستيراد.");
      let preview = importPreview;
      try { if (!preview.length) preview = parseImportPreview(); }
      catch (parseError) {
        const detail = parseError instanceof Error ? parseError.message : "صيغة غير صالحة";
        throw new Error(`JSON غير مكتمل أو غير صالح: ${detail}`);
      }
      const catalog = { movies: preview.map((item) => item.raw) };
      const response = await fetch("/api/admin/movies/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog, rightsConfirmed: true }),
      });
      const payload = await readJsonResponse<{ error?: string; imported?: number; ignored?: number; ids?: string[] }>(response, "استيراد JSON");
      if (!response.ok) throw new Error(payload.error || "تعذر الاستيراد.");
      if ((payload.imported ?? 0) === 0) throw new Error(`لم يُستورد أي فيلم. تم تجاهل ${payload.ignored ?? 0} سجل غير صالح.`);
      const ids = payload.ids ?? [];
      await loadDashboard();
      if (autoClassify && ids.length) {
        try {
          const classified = await classifyIds(ids);
          setImportMessage(`تم استيراد ${payload.imported ?? 0} وتجاهل ${payload.ignored ?? 0}. صنّف Gemini ${classified}.`);
          setSelectedMovies([]);
          await loadDashboard();
        } catch (classificationError) {
          setImportMessage(`تم استيراد ونشر ${payload.imported ?? 0} فيلمًا بنجاح، لكن تعذر التصنيف التلقائي.`);
          setSelectedMovies(ids);
          setImportError(classificationError instanceof Error ? classificationError.message : "فشل تصنيف Gemini.");
        }
      } else {
        setImportMessage(`تم استيراد ${payload.imported ?? 0} وتجاهل ${payload.ignored ?? 0}.`);
        setSelectedMovies(ids);
      }
      setImportPreview([]);
      setSelectedImport([]);
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : "تعذر الاستيراد."); }
    finally { setBusy(false); }
  }

  const visibleMovies = movies.filter((movie) => `${movie.title} ${(movie.categories ?? []).map((category) => `${category} ${MOVIE_CATEGORY_LABELS[category]}`).join(" ")}`.toLowerCase().includes(libraryQuery.toLowerCase()));
  const visibleHistory = history.filter((entry) => entry.movie.title.toLowerCase().includes(historyQuery.toLowerCase()));

  if (authenticated === null) return <main className="grid min-h-screen place-items-center text-sm text-zinc-500">جارِ التحقق من جلسة الإدارة...</main>;

  if (!authenticated) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <form onSubmit={login} className="glass w-full max-w-md rounded-3xl p-7">
          <div className="mb-7 text-center">
            <span className="navy-glass mx-auto mb-4 grid size-14 place-items-center rounded-2xl"><BarChart3 /></span>
            <h1 className="text-xl font-black">دخول إدارة سينما</h1>
            <p className="mt-2 text-xs leading-6 text-zinc-500">هذه الصفحة خاصة بمالك الموقع فقط.</p>
          </div>
          {!configured && <p className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-200">أضف ADMIN_USERNAME وADMIN_PASSWORD في متغيرات الخادم أولًا.</p>}
          <label className="mb-4 block text-xs font-bold text-zinc-300">اسم المستخدم<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-rose-400" /></label>
          <label className="block text-xs font-bold text-zinc-300">كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-rose-400" /></label>
          {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          <button disabled={busy || !configured} className="navy-glass mt-5 h-12 w-full rounded-xl text-sm font-black disabled:opacity-50">{busy ? "جارِ الدخول..." : "دخول آمن"}</button>
          <Link href="/" className="mt-4 block text-center text-xs text-zinc-500 hover:text-white">العودة إلى المشغل</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-7 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-xs font-bold text-rose-300">ADMIN ACCESS</p><h1 className="mt-1 text-2xl font-black">لوحة إدارة سينما</h1></div>
          <button onClick={() => setEditorPanelOpen((value) => !value)} className="group relative grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-lg transition duration-700 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:border-rose-300/30 hover:shadow-rose-950/30" title={editorPanelOpen ? "إغلاق أدوات النشر" : "فتح أدوات النشر"}>
            <Image src={editorPanelOpen ? "/sidebar-on.png" : "/sidebar-off.png"} alt="" width={24} height={24} className="transition duration-500 group-hover:scale-110 group-hover:opacity-0" />
            <Image src={editorPanelOpen ? "/sidebar-on-hover.png" : "/sidebar-off-hover.png"} alt="" width={24} height={24} className="absolute scale-90 opacity-0 transition duration-500 group-hover:scale-110 group-hover:opacity-100" />
          </button>
          <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold hover:bg-white/5"><Play className="ml-2 inline" size={15} />المشغل</Link>
          <button onClick={() => void logout()} className="rounded-xl border border-red-400/20 px-4 py-2 text-xs font-bold text-red-200 hover:bg-red-500/10"><LogOut className="ml-2 inline" size={15} />خروج</button>
        </header>
        {dashboardWarning && <p className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-100">{dashboardWarning} يمكنك متابعة إدارة المكتبة؛ تعطل قسم واحد لا يوقف بقية اللوحة.</p>}

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard icon={<Clapperboard />} label="الأفلام" value={stats?.movieCount ?? 0} />
          <StatCard icon={<Users />} label="زوار شغّلوا أفلامًا" value={stats?.uniqueVisitors ?? 0} />
          <StatCard icon={<Eye />} label="زيارات يومية مسجلة" value={stats?.visits ?? 0} />
          <StatCard icon={<Search />} label="عمليات البحث" value={stats?.searches ?? 0} />
          <StatCard icon={<Play />} label="سجلات التشغيل" value={stats?.historyCount ?? 0} />
        </section>

        <div className="admin-dashboard-grid gap-6" data-editor-open={editorPanelOpen}>
          <div className="admin-editor-panel overflow-hidden transition-[max-height,opacity,transform,filter] duration-700 ease-[cubic-bezier(.22,1,.36,1)]">
          <form onSubmit={saveMovie} className="glass h-fit min-w-[min(390px,calc(100vw-40px))] rounded-3xl p-5">
            <div className="mb-5 flex items-center gap-3"><span className="navy-glass grid size-10 place-items-center rounded-xl">{editor.id ? <Pencil size={18} /> : <Plus size={18} />}</span><div><h2 className="text-sm font-black">{editor.id ? "تعديل الفيلم" : "نشر فيلم جديد"}</h2><p className="mt-1 text-[10px] text-zinc-500">يظهر فورًا لكل زوار الموقع</p></div>{editor.id && <button type="button" onClick={() => setEditor(EMPTY_EDITOR)} className="mr-auto rounded-lg p-2 text-zinc-500 hover:bg-white/10"><X size={17} /></button>}</div>
            <EditorInput label="اسم الفيلم" value={editor.title} onChange={(title) => setEditor({ ...editor, title })} required />
            <label className="mb-4 block text-xs font-bold text-zinc-400">نبذة الفيلم<textarea value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 outline-none focus:border-rose-400" placeholder="وصف مختصر يظهر في تفاصيل الفيلم..." /></label>
            <EditorInput label="رابط HLS أو الفيديو" value={editor.url} onChange={(url) => setEditor({ ...editor, url })} required ltr />
            <EditorInput label="رابط الصورة (اختياري)" value={editor.poster} onChange={(poster) => setEditor({ ...editor, poster })} ltr />
            <div className="mb-4 grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-zinc-400">النوع<select value={editor.kind} onChange={(event) => setEditor({ ...editor, kind: event.target.value as EditorState["kind"] })} className="cinema-select mt-2 h-11 w-full rounded-xl border border-white/10 px-3"><option value="hls">HLS</option><option value="video">MP4 / مباشر</option><option value="embed">Embed</option></select></label>
              <EditorInput label="اسم الجودة" value={editor.quality} onChange={(quality) => setEditor({ ...editor, quality })} />
            </div>
            <fieldset className="mb-4 rounded-2xl border border-white/8 bg-black/15 p-3">
              <legend className="px-2 text-xs font-bold text-zinc-400">التصنيفات</legend>
              <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto">
                {MOVIE_CATEGORIES.map(([id, label]) => <label key={id} className="flex items-center gap-2 text-[11px] text-zinc-400"><input type="checkbox" checked={editor.categories.includes(id)} onChange={(event) => setEditor({ ...editor, categories: event.target.checked ? [...editor.categories, id] : editor.categories.filter((item) => item !== id) })} />{label}</label>)}
              </div>
            </fieldset>
            <label className="mb-4 block text-xs font-bold text-zinc-400">الباراميترات المتقدمة (JSON)<textarea value={editor.parameters} onChange={(event) => setEditor({ ...editor, parameters: event.target.value })} rows={5} dir="ltr" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-xs outline-none focus:border-rose-400" placeholder='{"referer":"https://example.com","autoplay":false}' /></label>
            {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
            <button disabled={busy} className="navy-glass flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-50"><Save size={17} />{busy ? "جارِ الحفظ..." : editor.id ? "حفظ التعديلات" : "نشر للعامة"}</button>
          </form>
          </div>

          <div className="space-y-6">
            <section className="glass rounded-3xl p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="ml-auto text-sm font-black">المكتبة العامة</h2><div className="relative min-w-52 flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600" size={15} /><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="ابحث بالاسم أو التصنيف..." className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pr-9 pl-3 text-xs outline-none focus:border-rose-400" /></div><button disabled={busy || visibleMovies.length === 0} onClick={() => void classifySelected()} className="rounded-xl bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200"><Sparkles className="ml-1 inline" size={14} />تصنيف Gemini {selectedMovies.length ? `(${selectedMovies.length})` : "للنتائج"}</button></div>
              <div className="grid gap-3 md:grid-cols-2">{visibleMovies.map((movie) => <AdminMovieCard key={movie.id} movie={movie} selected={selectedMovies.includes(movie.id)} onToggle={() => setSelectedMovies((current) => current.includes(movie.id) ? current.filter((id) => id !== movie.id) : [...current, movie.id])} onEdit={() => editMovie(movie)} onDelete={() => void deleteMovie(movie)} />)}{visibleMovies.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة.</p>}</div>
            </section>

            <section className="glass rounded-3xl p-5">
              <div className="mb-4 flex items-center gap-3"><span className="navy-glass grid size-10 place-items-center rounded-xl"><Upload size={17} /></span><div><h2 className="text-sm font-black">استيراد قائمة JSON للعامة</h2><p className="mt-1 text-[10px] text-zinc-500">يدعم الاسم، الرابط، thumbnail/poster، sources أو streams والتصنيفات.</p></div></div>
              <input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setImportJson(text); try { parseImportPreview(text); } catch (cause) { setImportError(cause instanceof Error ? cause.message : "JSON غير صالح."); } }); }} className="mb-3 block w-full text-xs text-zinc-500" />
              <textarea value={importJson} onChange={(event) => { setImportJson(event.target.value); setImportPreview([]); }} onBlur={() => { if (importJson.trim() && !importPreview.length) { try { parseImportPreview(); } catch (cause) { setImportError(cause instanceof Error ? cause.message : "JSON غير صالح."); } } }} placeholder='[{"title":"اسم الفيلم","url":"https://.../master.m3u8","thumbnail":"https://.../poster.jpg"}]' dir="ltr" className="min-h-40 w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-xs outline-none focus:border-rose-400" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!importJson.trim()} onClick={() => { try { parseImportPreview(); } catch (cause) { setImportError(cause instanceof Error ? cause.message : "JSON غير صالح."); } }} className="rounded-xl bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-200 disabled:opacity-40">تحليل ومعاينة JSON</button>
                {importPreview.length > 0 && <button type="button" disabled={!selectedImport.length} onClick={removeSelectedImport} className="rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-200 disabled:opacity-30"><Trash2 className="ml-1 inline" size={13} />حذف المحدد ({selectedImport.length})</button>}
              </div>
              {importPreview.length > 0 && <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 p-3">
                <div className="mb-3 flex items-center justify-between text-[10px] text-zinc-500"><span>معاينة قبل النشر — اسحب لترتيب الأفلام</span><span>{importPreview.length}</span></div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {importPreview.map((item, index) => <div key={item.key} draggable onDragStart={() => setImportDragKey(item.key)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderImport(item.key)} className="flex cursor-grab items-center gap-2 rounded-xl border border-white/8 bg-black/25 p-2 active:cursor-grabbing">
                    <Image src="/sidebar-off.png" alt="سحب" width={18} height={18} className="shrink-0 opacity-60" />
                    <input type="checkbox" checked={selectedImport.includes(item.key)} onChange={() => setSelectedImport((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key])} />
                    <span className="relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black">{item.poster ? <Image src={item.poster} alt="" fill sizes="80px" unoptimized className="object-cover" /> : <Clapperboard size={16} className="text-zinc-700" />}</span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-[11px]">{index + 1}. {item.title}</strong><small className="mt-1 block text-[9px] text-zinc-600">{item.qualities} جودة/مصدر</small></span>
                    <button type="button" onClick={() => setImportPreview((current) => current.filter((entry) => entry.key !== item.key))} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-200"><Trash2 size={14} /></button>
                  </div>)}
                </div>
              </div>}
              <label className="my-3 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" />أؤكد أنني أملك حق نشر وتشغيل الروابط المستوردة.</label>
              <label className="mb-3 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={autoClassify} onChange={(event) => setAutoClassify(event.target.checked)} className="mt-1" /><Sparkles size={14} className="mt-0.5 text-violet-300" />تصنيف الأفلام المستوردة تلقائيًا بواسطة Gemini.</label>
              <button disabled={busy || !importPreview.length} onClick={() => void importCatalog()} className="navy-glass rounded-xl px-4 py-3 text-xs font-black disabled:opacity-40"><Upload className="ml-2 inline" size={15} />نشر {importPreview.length || ""} فيلمًا للعامة</button>
              {importMessage && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-200">{importMessage}</p>}
              {importError && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs leading-6 text-red-200">{importError}</p>}
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="glass rounded-3xl p-5"><h2 className="mb-4 text-sm font-black">الأكثر تشغيلًا</h2><div className="space-y-2">{stats?.topMovies.map((movie, index) => <div key={movie._id} className="flex items-center gap-3 rounded-xl bg-black/20 p-3"><span className="grid size-8 place-items-center rounded-lg bg-white/5 text-xs font-black">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{movie.title}</span><span className="text-[10px] text-zinc-500">{movie.plays} تشغيل</span></div>)}</div></div>
              <div className="glass rounded-3xl p-5"><div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="ml-auto text-sm font-black">إدارة شوهد مؤخرًا</h2><button onClick={exportHistoryJson} disabled={!history.length} className="rounded-lg bg-cyan-500/10 px-2 py-2 text-[10px] text-cyan-100 disabled:opacity-30"><Download className="ml-1 inline" size={13} />تصدير JSON</button><button disabled={!selectedHistory.length} onClick={() => void deleteSelectedHistory()} className="rounded-lg bg-red-500/10 px-2 py-2 text-[10px] text-red-200 disabled:opacity-30"><Trash2 className="ml-1 inline" size={13} />حذف المحدد ({selectedHistory.length})</button></div><div className="relative mb-3"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="ابحث في شوهد مؤخرًا..." className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pr-9 pl-3 text-xs outline-none" /></div><div className="max-h-[520px] space-y-2 overflow-y-auto">{visibleHistory.map((entry) => <div key={entry.movieId} className="flex items-center gap-2 rounded-xl bg-black/20 p-3"><input type="checkbox" checked={selectedHistory.includes(entry.movieId)} onChange={() => setSelectedHistory((current) => current.includes(entry.movieId) ? current.filter((id) => id !== entry.movieId) : [...current, entry.movieId])} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{entry.movie.title}</div><div className="mt-1 text-[10px] text-zinc-500">{new Date(entry.watchedAt).toLocaleString("ar-BH")} • {entry.duration ? Math.round(entry.progress / entry.duration * 100) : 0}%</div></div><button onClick={() => void renameHistory(entry)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-white" title="تعديل الاسم"><Pencil size={14} /></button><button onClick={() => void deleteHistory(entry.movieId)} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-200" title="حذف هذا الفيلم فقط"><Trash2 size={14} /></button></div>)}</div></div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="glass rounded-2xl p-4"><span className="text-rose-300">{icon}</span><strong className="mt-3 block text-2xl">{value.toLocaleString("ar-BH")}</strong><span className="mt-1 block text-[10px] text-zinc-500">{label}</span></div>;
}

function EditorInput({ label, value, onChange, required = false, ltr = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; ltr?: boolean }) {
  return <label className="mb-4 block text-xs font-bold text-zinc-400">{label}<input value={value} onChange={(event) => onChange(event.target.value)} required={required} dir={ltr ? "ltr" : undefined} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-rose-400" /></label>;
}

function AdminMovieCard({ movie, selected, onToggle, onEdit, onDelete }: { movie: Movie; selected: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return <article className={`flex gap-3 rounded-2xl border bg-black/20 p-3 ${selected ? "border-violet-400/50" : "border-white/8"}`}><button onClick={onToggle} className={`grid size-6 shrink-0 place-items-center rounded-md border ${selected ? "border-violet-300 bg-violet-500/20 text-violet-200" : "border-white/10 text-zinc-600"}`} title="تحديد">{selected && <CheckSquare size={14} />}</button><span className="relative grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-black">{movie.poster ? <Image src={movie.poster} alt="" fill sizes="96px" unoptimized className="object-cover" /> : <Clapperboard className="text-zinc-700" />}</span><div className="min-w-0 flex-1"><h3 className="line-clamp-2 text-xs font-black">{movie.title}</h3><p className="mt-1 truncate text-[9px] text-zinc-600" dir="ltr">{movie.sources[0]?.url}</p>{Boolean(movie.categories?.length) && <div className="mt-2 flex flex-wrap gap-1">{movie.categories?.slice(0, 3).map((category) => <span key={category} className="rounded-md bg-violet-500/10 px-1.5 py-1 text-[8px] text-violet-200">{MOVIE_CATEGORY_LABELS[category]}</span>)}</div>}<div className="mt-3 flex gap-2"><button onClick={onEdit} className="rounded-lg bg-white/7 px-2 py-1.5 text-[10px] hover:bg-white/12"><Pencil className="ml-1 inline" size={12} />تعديل</button><button onClick={onDelete} className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200 hover:bg-red-500/20"><Trash2 className="ml-1 inline" size={12} />حذف</button></div></div></article>;
}
