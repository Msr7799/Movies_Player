import "server-only";
import type { MovieMetadata, MoviePerson } from "@/lib/media-types";

const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";

function cleanTitle(value: string) {
  return value
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/(?:مشاهدة|فيلم|مترجم|مدبلج|اون\s*لاين|أون\s*لاين|HD|Full|Movie|Watch|كيو\s*فيلم|ماي\s*سيما)/gi, " ")
    .replace(/[|_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tmdbHeaders(): Record<string, string> {
  const token = process.env.API_READ_AUTH_TOKEN?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function tmdbUrl(path: string, params: URLSearchParams) {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!process.env.API_READ_AUTH_TOKEN?.trim() && key) params.set("api_key", key);
  return `${TMDB}${path}?${params}`;
}

async function tmdbJson(path: string, params: URLSearchParams) {
  if (!process.env.API_READ_AUTH_TOKEN?.trim() && !process.env.TMDB_API_KEY?.trim()) return null;
  const response = await fetch(tmdbUrl(path, params), { headers: tmdbHeaders(), signal: AbortSignal.timeout(12_000), next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error(`TMDB_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function image(path: unknown, size = "w500") {
  return typeof path === "string" && path ? `${TMDB_IMAGE}/${size}${path}` : undefined;
}

function people(rows: unknown, role: (row: Record<string, unknown>) => string | undefined): MoviePerson[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 24).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name) return [];
    return [{ id: String(row.id ?? name), name, role: role(row), image: image(row.profile_path, "w185") }];
  });
}

async function wikidata(title: string) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action: "wbsearchentities", search: title, language: "en", uselang: "ar", type: "item", limit: "5", format: "json", origin: "*" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "AnyMovie/2.2 (movie metadata)" }, signal: AbortSignal.timeout(10_000), next: { revalidate: 86_400 } });
  if (!response.ok) return {};
  const payload = await response.json() as { search?: Array<{ id?: string; label?: string; description?: string }> };
  const match = payload.search?.find((item) => /film|movie|فيلم/i.test(item.description ?? "")) ?? payload.search?.[0];
  return { wikidataId: match?.id, wikidataOverview: match?.description };
}

export async function lookupMovieMetadata(rawTitle: string): Promise<MovieMetadata> {
  const year = Number(rawTitle.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? 0) || undefined;
  const title = cleanTitle(rawTitle) || rawTitle.trim();
  const searchParams = new URLSearchParams({ query: title, language: "ar-AE", include_adult: "false" });
  if (year) searchParams.set("year", String(year));
  const [search, wiki] = await Promise.all([tmdbJson("/search/movie", searchParams).catch(() => null), wikidata(title).catch(() => ({}))]);
  const first = Array.isArray(search?.results) ? search.results[0] as Record<string, unknown> | undefined : undefined;
  const id = typeof first?.id === "number" ? first.id : undefined;
  if (!id) return { title, overview: "wikidataOverview" in wiki ? wiki.wikidataOverview : undefined, genres: [], countries: [], languages: [], images: [], directors: [], writers: [], cast: [], wikidataId: "wikidataId" in wiki ? wiki.wikidataId : undefined, source: "wikidata" };

  const params = new URLSearchParams({ language: "ar-AE", append_to_response: "credits,images,external_ids,release_dates", include_image_language: "ar,en,null" });
  const [details, english] = await Promise.all([
    tmdbJson(`/movie/${id}`, params),
    tmdbJson(`/movie/${id}`, new URLSearchParams({ language: "en-US" })),
  ]);
  if (!details) throw new Error("TMDB_DETAILS_EMPTY");
  const credits = details.credits as Record<string, unknown> | undefined;
  const crew = Array.isArray(credits?.crew) ? credits.crew as Record<string, unknown>[] : [];
  const images = details.images as Record<string, unknown> | undefined;
  const backdrops = Array.isArray(images?.backdrops) ? images.backdrops as Record<string, unknown>[] : [];
  const posters = Array.isArray(images?.posters) ? images.posters as Record<string, unknown>[] : [];
  const external = details.external_ids as Record<string, unknown> | undefined;
  const releaseDates = details.release_dates as { results?: Array<{ iso_3166_1?: string; release_dates?: Array<{ certification?: string }> }> } | undefined;
  const certification = releaseDates?.results?.flatMap((region) => region.release_dates ?? []).map((item) => item.certification).find(Boolean);
  const directorRows = crew.filter((row) => row.job === "Director");
  const writerRows = crew.filter((row) => ["Writer", "Screenplay", "Story"].includes(String(row.job)));
  const visual = [...posters, ...backdrops].map((row) => image(row.file_path, "w780")).filter((value): value is string => Boolean(value));
  const overview = typeof details.overview === "string" && details.overview ? details.overview : typeof english?.overview === "string" ? english.overview : undefined;
  return {
    title: String(details.title || english?.title || title),
    originalTitle: String(details.original_title || "") || undefined,
    overview,
    releaseDate: typeof details.release_date === "string" ? details.release_date : undefined,
    year: Number(String(details.release_date ?? "").slice(0, 4)) || year,
    runtime: typeof details.runtime === "number" ? details.runtime : undefined,
    rating: typeof details.vote_average === "number" ? details.vote_average : undefined,
    voteCount: typeof details.vote_count === "number" ? details.vote_count : undefined,
    certification,
    genres: Array.isArray(details.genres) ? details.genres.map((item) => String((item as Record<string, unknown>).name ?? "")).filter(Boolean) : [],
    countries: Array.isArray(details.production_countries) ? details.production_countries.map((item) => String((item as Record<string, unknown>).name ?? "")).filter(Boolean) : [],
    languages: Array.isArray(details.spoken_languages) ? details.spoken_languages.map((item) => String((item as Record<string, unknown>).name ?? "")).filter(Boolean) : [],
    poster: image(details.poster_path, "w780") ?? image(first?.poster_path, "w780"),
    backdrop: image(details.backdrop_path, "original") ?? image(first?.backdrop_path, "original"),
    images: [...new Set(visual)].slice(0, 12),
    directors: people(directorRows, (row) => String(row.job ?? "")),
    writers: people(writerRows, (row) => String(row.job ?? "")),
    cast: people(credits?.cast, (row) => String(row.character ?? "")).slice(0, 16),
    imdbId: typeof external?.imdb_id === "string" ? external.imdb_id : undefined,
    tmdbId: id,
    wikidataId: "wikidataId" in wiki ? wiki.wikidataId : undefined,
    source: "wikidataId" in wiki && wiki.wikidataId ? "combined" : "tmdb",
  };
}
