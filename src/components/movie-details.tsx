"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarDays, Clock3, Clapperboard, Globe2, Play, Star, Users } from "lucide-react";
import type { Movie, MovieMetadata } from "@/lib/media-types";

export function MovieDetails({ movie, onPlay }: { movie: Movie; onPlay: () => void }) {
  const [metadata, setMetadata] = useState<MovieMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movie-metadata?title=${encodeURIComponent(movie.title)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("metadata_failed")))
      .then((payload: { metadata?: MovieMetadata }) => setMetadata(payload.metadata ?? null))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [movie.id, movie.title]);

  if (loading) return <section className="mt-8 animate-pulse overflow-hidden rounded-3xl border border-white/8 bg-white/[.025]"><div className="aspect-[21/7] bg-white/5" /><div className="space-y-3 p-6"><div className="h-8 w-2/3 rounded bg-white/7" /><div className="h-20 rounded bg-white/5" /></div></section>;
  if (!metadata) return null;

  const poster = metadata.poster || movie.poster;
  return (
    <section className="movie-details-enter mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#0c0d10] shadow-2xl shadow-black/40" dir="rtl">
      <div className="relative min-h-[260px] overflow-hidden sm:min-h-[390px]">
        {metadata.backdrop && <Image src={metadata.backdrop} alt="" fill sizes="100vw" unoptimized className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d10] via-black/25 to-black/15" />
        <button onClick={onPlay} className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full border border-white/50 bg-white text-black shadow-2xl transition duration-500 hover:scale-110 hover:bg-orange-400" aria-label={`تشغيل ${metadata.title}`}><Play className="mr-1 fill-current" size={27} /></button>
      </div>

      <div className="relative z-10 mx-auto -mt-10 grid max-w-6xl gap-7 px-4 pb-10 sm:-mt-16 sm:px-7 lg:grid-cols-[240px_1fr]">
        <aside>
          <div className="relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl sm:w-56 lg:mx-0">
            {poster ? <Image src={poster} alt={`ملصق ${metadata.title}`} fill sizes="224px" unoptimized className="object-cover" /> : <Clapperboard className="absolute inset-0 m-auto text-zinc-700" size={54} />}
          </div>
          <button onClick={onPlay} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-black text-black transition hover:scale-[1.02] hover:bg-orange-400"><Play size={18} className="fill-current" /> شاهد الآن</button>
          <div className="mt-5 space-y-3 text-xs text-zinc-400">
            {metadata.originalTitle && <p><strong className="block text-zinc-200">العنوان الأصلي</strong>{metadata.originalTitle}</p>}
            {metadata.languages.length > 0 && <p><strong className="block text-zinc-200">اللغة</strong>{metadata.languages.join("، ")}</p>}
            {metadata.countries.length > 0 && <p><strong className="block text-zinc-200">بلدان الإنتاج</strong>{metadata.countries.join("، ")}</p>}
          </div>
        </aside>

        <div className="pt-2 sm:pt-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-2xl font-black leading-tight sm:text-4xl">{metadata.title} {metadata.year ? `(${metadata.year})` : ""}</h2><div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">{metadata.releaseDate && <span className="flex items-center gap-1"><CalendarDays size={14} />{metadata.releaseDate}</span>}{metadata.runtime && <span className="flex items-center gap-1"><Clock3 size={14} />{metadata.runtime} دقيقة</span>}{metadata.certification && <span className="rounded border border-white/15 px-2">{metadata.certification}</span>}</div></div>
            {typeof metadata.rating === "number" && <div className="flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2"><Star className="fill-orange-400 text-orange-400" size={19} /><strong>{metadata.rating.toFixed(1)}</strong><span className="text-xs text-zinc-500">/ 10</span></div>}
          </div>
          {metadata.genres.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{metadata.genres.map((genre) => <span key={genre} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">{genre}</span>)}</div>}
          {metadata.overview && <p className="mt-5 max-w-4xl text-sm leading-8 text-zinc-300">{metadata.overview}</p>}
          <div className="mt-6 grid gap-3 border-t border-white/8 pt-5 text-sm sm:grid-cols-2">
            {metadata.directors.length > 0 && <p><strong className="ml-2 text-zinc-300">الإخراج</strong><span className="text-orange-400">{metadata.directors.map((p) => p.name).join("، ")}</span></p>}
            {metadata.writers.length > 0 && <p><strong className="ml-2 text-zinc-300">الكتابة</strong><span className="text-orange-400">{metadata.writers.map((p) => p.name).join("، ")}</span></p>}
          </div>

          {metadata.images.length > 0 && <DetailSection icon={<Globe2 size={21} />} title="الصور"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{metadata.images.slice(0, 10).map((src) => <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900"><Image src={src} alt="" fill sizes="220px" unoptimized className="object-cover transition duration-700 hover:scale-110" /></div>)}</div></DetailSection>}
          {metadata.cast.length > 0 && <DetailSection icon={<Users size={21} />} title="طاقم التمثيل"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metadata.cast.map((person) => <article key={person.id} className="flex items-center gap-3 rounded-xl bg-white/[.025] p-2"><span className="relative size-14 shrink-0 overflow-hidden rounded-full bg-zinc-800">{person.image && <Image src={person.image} alt={person.name} fill sizes="56px" unoptimized className="object-cover" />}</span><span className="min-w-0"><strong className="block truncate text-sm">{person.name}</strong>{person.role && <span className="block truncate text-xs text-zinc-500">{person.role}</span>}</span></article>)}</div></DetailSection>}
          <p className="mt-8 text-[10px] text-zinc-600">البيانات: TMDB{metadata.wikidataId ? " + Wikidata" : ""} • {metadata.imdbId ?? metadata.wikidataId ?? ""}</p>
        </div>
      </div>
    </section>
  );
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="mt-9"><h3 className="mb-4 flex items-center gap-2 border-r-4 border-orange-500 pr-3 text-xl font-black">{icon}{title}</h3>{children}</section>;
}
