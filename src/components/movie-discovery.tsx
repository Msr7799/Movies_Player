"use client";

import { Captions, ChevronDown, Clapperboard, ExternalLink, Languages, LoaderCircle, Play, Search, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DiscoveryResponse, DiscoveryResult, SearchProvider } from "@/lib/media-types";
import { trackAnalytics } from "@/lib/browser-analytics";
import {
  MOVIE_LANGUAGE_OPTIONS, SUBTITLE_LANGUAGE_OPTIONS,
  type MovieLanguageValue, type SubtitleLanguageValue,
} from "@/lib/search-options";

type MovieSuggestion = { title: string; originalTitle: string; year: string };

export function MovieDiscovery({ onPlay }: { onPlay: (result: DiscoveryResult) => void }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<MovieSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [movieLanguage, setMovieLanguage] = useState<MovieLanguageValue>("any");
  const [subtitleLanguage, setSubtitleLanguage] = useState<SubtitleLanguageValue>("any");
  const [allowShortClips, setAllowShortClips] = useState(false);
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("tavily");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const suggestionCache = useRef(new Map<string, MovieSuggestion[]>());
  const suppressNextSuggestion = useRef(false);

  useEffect(() => {
    const value = query.trim();
    if (suppressNextSuggestion.current) {
      suppressNextSuggestion.current = false;
      return;
    }
    if (value.length < 3) return;

    const cacheKey = `${movieLanguage}:${value.toLocaleLowerCase()}`;
    const cached = suggestionCache.current.get(cacheKey);
    if (cached) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const response = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: value, movieLanguage }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as { suggestions?: MovieSuggestion[] };
        const items = payload.suggestions ?? [];
        suggestionCache.current.set(cacheKey, items);
        setSuggestions(items);
        setSuggestionsOpen(items.length > 0);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggesting(false);
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, movieLanguage]);

  function chooseSuggestion(suggestion: MovieSuggestion) {
    suppressNextSuggestion.current = true;
    setQuery(`${suggestion.title}${suggestion.year ? ` (${suggestion.year})` : ""}`);
    setSuggestionsOpen(false);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSuggesting(false);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    const cached = suggestionCache.current.get(`${movieLanguage}:${value.trim().toLocaleLowerCase()}`);
    if (cached) setSuggestions(cached);
    setSuggestionsOpen(true);
  }

  async function searchMovies(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2 || loading) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value, movieLanguage, subtitleLanguage, allowShortClips, searchProvider }),
      });
      const payload = await response.json() as DiscoveryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر إكمال البحث.");
      setData(payload);
      trackAnalytics("search", { provider: payload.searchProvider, resultCount: payload.results.length });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إكمال البحث.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="movie-discovery" className="glass mb-7 scroll-mt-20 overflow-visible rounded-3xl p-3 transition-[padding,box-shadow] duration-700 ease-[cubic-bezier(.22,1,.36,1)] sm:p-4" aria-labelledby="ai-search-title">
      <div className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${optionsOpen ? "mb-4 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0"}`} aria-hidden={!optionsOpen}>
      <div className="min-h-0">
      <div className="flex flex-wrap items-start gap-3 px-1 pt-1">
        <span className="navy-glass grid size-11 shrink-0 place-items-center rounded-2xl text-rose-200">
          <Sparkles size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="ai-search-title" className="text-base font-black sm:text-lg">البحث الذكي عن الأفلام</h2>
          <p className="mt-1 text-xs leading-6 text-zinc-400">اكتب الاسم بأي لغة. يستخدم Gemini مزود البحث الذي تختاره للعثور على الفيلم الكامل في مصادر قانونية موثوقة، مع استبعاد المقاطع افتراضيًا.</p>
        </div>
        <fieldset className="w-full rounded-2xl border border-rose-400/25 bg-black/30 p-1 sm:w-auto" disabled={loading}>
          <legend className="sr-only">اختيار خدمة البحث</legend>
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="اختيار خدمة البحث">
            {(["tavily", "serper"] as const).map((provider) => {
              const selected = searchProvider === provider;
              return (
                <label
                  key={provider}
                  className={`cursor-pointer rounded-xl px-5 py-2.5 text-center text-xs font-black transition ${selected ? "bg-rose-500 text-white shadow-lg shadow-rose-950/30" : "text-zinc-400 hover:bg-white/7 hover:text-white"}`}
                >
                  <input
                    type="radio"
                    name="search-provider"
                    value={provider}
                    checked={selected}
                    onChange={() => {
                      setSearchProvider(provider);
                      setData(null);
                      setError("");
                    }}
                    className="sr-only"
                  />
                  {provider === "tavily" ? "Tavily" : "Serper"}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      </div>
      </div>

      <form onSubmit={searchMovies} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-300" size={18} />
          <input
            id="movie-discovery-input"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onFocus={() => { if (suggestions.length > 0) setSuggestionsOpen(true); }}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
            onKeyDown={(event) => { if (event.key === "Escape") setSuggestionsOpen(false); }}
            placeholder="مثال: Veer-Zaara 2004 أو فيلم فير زارا"
            className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 pr-11 pl-4 text-base outline-none transition placeholder:text-zinc-600 focus:border-rose-400/60 sm:text-sm"
            maxLength={120}
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
            aria-controls="movie-suggestions"
          />
          {suggesting && <LoaderCircle className="absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" size={16} />}
          {suggestionsOpen && suggestions.length > 0 && (
            <div id="movie-suggestions" role="listbox" className="glass absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl p-1.5 shadow-2xl">
              <div className="px-3 py-2 text-[10px] font-bold text-zinc-500">اقتراحات Gemini</div>
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.title}-${suggestion.year}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition hover:bg-white/8"
                >
                  <Search size={14} className="shrink-0 text-rose-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{suggestion.title}</span>
                    {suggestion.originalTitle && suggestion.originalTitle !== suggestion.title && <span className="mt-0.5 block truncate text-[10px] text-zinc-500" dir="auto">{suggestion.originalTitle}</span>}
                  </span>
                  {suggestion.year && <span className="rounded-lg bg-white/6 px-2 py-1 text-[10px] text-zinc-400">{suggestion.year}</span>}
                </button>
              ))}
            </div>
          )}
          </div>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="navy-glass flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}
            {loading ? "بحث عميق..." : "ابحث الآن"}
          </button>
          <button
            type="button"
            onClick={() => setOptionsOpen((value) => !value)}
            aria-expanded={optionsOpen}
            aria-controls="smart-search-options"
            className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-bold transition duration-500 ${optionsOpen ? "border-rose-400/35 bg-rose-500/10 text-rose-100" : "border-white/10 bg-white/[.035] text-zinc-400 hover:bg-white/[.07] hover:text-white"}`}
          >
            <SlidersHorizontal size={16} />
            <span>{optionsOpen ? "إخفاء الخيارات" : "الخيارات"}</span>
            <ChevronDown size={14} className={`transition-transform duration-700 ${optionsOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div id="smart-search-options" className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${optionsOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="relative block">
            <Languages className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rose-300" size={16} />
            <select
              value={movieLanguage}
              onChange={(event) => { setMovieLanguage(event.target.value as MovieLanguageValue); setSuggestions([]); setData(null); }}
              className="cinema-select h-11 w-full appearance-none rounded-xl border border-white/10 bg-black/25 pr-10 pl-8 text-xs font-bold outline-none transition focus:border-rose-400/60"
              aria-label="لغة أو نوع الفيلم"
            >
              {MOVIE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{`نوع الفيلم: ${option.label}`}</option>)}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">⌄</span>
          </label>
          <label className="relative block">
            <Captions className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rose-300" size={16} />
            <select
              value={subtitleLanguage}
              onChange={(event) => { setSubtitleLanguage(event.target.value as SubtitleLanguageValue); setData(null); }}
              className="cinema-select h-11 w-full appearance-none rounded-xl border border-white/10 bg-black/25 pr-10 pl-8 text-xs font-bold outline-none transition focus:border-rose-400/60"
              aria-label="لغة الترجمة المطلوبة"
            >
              {SUBTITLE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{`الترجمة: ${option.label}`}</option>)}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">⌄</span>
          </label>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-[#45658f]/70 hover:bg-[#111d2e]/45">
          <span className="flex min-w-0 items-start gap-3">
            <Clapperboard className="mt-0.5 shrink-0 text-slate-300" size={17} />
            <span>
              <span className="block text-xs font-bold text-zinc-100">السماح بالمقاطع القصيرة والتريلرات</span>
              <span className="mt-1 block text-[10px] leading-5 text-zinc-500">مغلق افتراضيًا — يعرض الأفلام الكاملة وصفحات المشاهدة فقط.</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={allowShortClips}
            onChange={(event) => { setAllowShortClips(event.target.checked); setData(null); }}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 shrink-0 rounded-full border border-white/15 bg-black/40 transition peer-checked:border-[#6685ad] peer-checked:bg-[#263d5c] peer-focus-visible:ring-2 peer-focus-visible:ring-[#6685ad]">
            <span className={`absolute right-1 top-1 size-4 rounded-full shadow transition-transform ${allowShortClips ? "-translate-x-5 bg-white" : "bg-zinc-500"}`} />
          </span>
        </label>
        </div>
        </div>
      </form>

      <div aria-live="polite">
        {error && <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs leading-6 text-red-200">{error}</p>}

        {data && (
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-rose-400/30 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-100">
                {data.understoodTitle}{data.year ? ` (${data.year})` : ""}
              </span>
              {movieLanguage !== "any" && <span className="rounded-full bg-white/7 px-3 py-1 text-[10px] text-zinc-300">{MOVIE_LANGUAGE_OPTIONS.find((option) => option.value === movieLanguage)?.label}</span>}
              {subtitleLanguage !== "any" && <span className="rounded-full bg-white/7 px-3 py-1 text-[10px] text-zinc-300">{SUBTITLE_LANGUAGE_OPTIONS.find((option) => option.value === subtitleLanguage)?.label}</span>}
              <span className="rounded-full bg-white/7 px-3 py-1 text-[10px] font-bold text-zinc-300">البحث: {data.searchProvider === "serper" ? "Serper" : "Tavily"}</span>
              <span className="rounded-full bg-white/7 px-3 py-1 text-[10px] text-zinc-300">{allowShortClips ? "المقاطع مسموحة" : "أفلام كاملة فقط"}</span>
              <span className="flex items-center gap-1 text-[11px] text-zinc-500"><ShieldCheck size={14} className="text-rose-300" /> مصادر قانونية فقط</span>
            </div>
            <p className="mb-4 text-xs leading-6 text-zinc-400">{data.summary}</p>

            {data.results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">لم تُعثر على روابط موثوقة لهذا العنوان حاليًا.</div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.results.map((result, index) => (
                  <article key={`${result.id}-${result.url}`} className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-rose-400/35 hover:bg-[#111d2e]/55">
                    <div className="flex items-start gap-3">
                      <span className="navy-glass grid size-9 shrink-0 place-items-center rounded-xl text-xs font-black text-rose-100">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="line-clamp-2 min-w-0 break-words text-sm font-bold">{result.title}</h3>
                          <span className="rounded-full bg-white/7 px-2 py-0.5 text-[9px] font-bold text-zinc-400">{result.provider}</span>
                          <span className="rounded-full border border-[#45658f]/50 bg-[#111d2e]/80 px-2 py-0.5 text-[9px] font-bold text-slate-200">
                            {result.contentType === "full_movie" ? "فيلم كامل" : result.contentType === "short_clip" ? "مقطع قصير" : "صفحة مشاهدة"}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-5 text-zinc-500">{result.description || result.reason}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.playable && result.playUrl && (
                        <button onClick={() => onPlay(result)} className="navy-glass flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition hover:brightness-125">
                          <Play size={14} className="fill-white" /> تشغيل هنا
                        </button>
                      )}
                      <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-300 transition hover:bg-white/10">
                        <ExternalLink size={14} /> فتح المصدر
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
