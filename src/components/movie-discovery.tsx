"use client";

import { ExternalLink, LoaderCircle, Play, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DiscoveryResponse, DiscoveryResult } from "@/lib/media-types";

type MovieSuggestion = { title: string; originalTitle: string; year: string };

export function MovieDiscovery({ onPlay }: { onPlay: (result: DiscoveryResult) => void }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<MovieSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestionCache = useRef(new Map<string, MovieSuggestion[]>());
  const suppressNextSuggestion = useRef(false);

  useEffect(() => {
    const value = query.trim();
    if (suppressNextSuggestion.current) {
      suppressNextSuggestion.current = false;
      return;
    }
    if (value.length < 3) return;

    const cacheKey = value.toLocaleLowerCase();
    const cached = suggestionCache.current.get(cacheKey);
    if (cached) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const response = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: value }),
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
  }, [query]);

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
    const cached = suggestionCache.current.get(value.trim().toLocaleLowerCase());
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
        body: JSON.stringify({ query: value }),
      });
      const payload = await response.json() as DiscoveryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر إكمال البحث.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إكمال البحث.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="glass mb-7 overflow-hidden rounded-3xl p-4 sm:p-6" aria-labelledby="ai-search-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="navy-glass grid size-11 shrink-0 place-items-center rounded-2xl text-rose-200">
          <Sparkles size={21} />
        </span>
        <div>
          <h2 id="ai-search-title" className="text-base font-black sm:text-lg">البحث الذكي عن الأفلام</h2>
          <p className="mt-1 text-xs leading-6 text-zinc-400">اكتب الاسم بأي لغة. يفهمه Gemini ويبحث Tavily بعمق عن أفضل 5 مصادر قانونية موثوقة.</p>
        </div>
      </div>

      <form onSubmit={searchMovies} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-300" size={18} />
          <input
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onFocus={() => { if (suggestions.length > 0) setSuggestionsOpen(true); }}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
            onKeyDown={(event) => { if (event.key === "Escape") setSuggestionsOpen(false); }}
            placeholder="مثال: Veer-Zaara 2004 أو فيلم فير زارا"
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 pr-11 pl-4 text-sm outline-none transition placeholder:text-zinc-600 focus:border-rose-400/60"
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
          className="navy-glass flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? "بحث عميق..." : "ابحث الآن"}
        </button>
      </form>

      <div aria-live="polite">
        {error && <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs leading-6 text-red-200">{error}</p>}

        {data && (
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-rose-400/30 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-100">
                {data.understoodTitle}{data.year ? ` (${data.year})` : ""}
              </span>
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
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="line-clamp-1 text-sm font-bold">{result.title}</h3>
                          <span className="rounded-full bg-white/7 px-2 py-0.5 text-[9px] font-bold text-zinc-400">{result.provider}</span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-5 text-zinc-500">{result.description || result.reason}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
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
