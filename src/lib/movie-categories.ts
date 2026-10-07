export const MOVIE_CATEGORIES = [
  ["egyptian", "أفلام مصرية"], ["american", "أفلام أمريكية"],
  ["social", "أفلام التواصل الاجتماعي"], ["site", "أفلام الموقع"],
  ["arabic", "أفلام عربية"], ["historical", "أفلام تاريخية"],
  ["indian", "أفلام هندية"], ["asian", "أفلام آسيوية"],
  ["turkish", "أفلام تركية"], ["anime", "أفلام أنمي"],
  ["dubbed", "أفلام مدبلجة"], ["arabic-series", "مسلسلات عربية"],
  ["turkish-series", "مسلسلات تركية"], ["foreign-series", "مسلسلات أجنبية"],
  ["drama", "دراما"], ["action", "أكشن"], ["comedy", "كوميديا"],
  ["horror", "رعب"], ["romance", "رومانسي"], ["thriller", "إثارة"],
  ["adventure", "مغامرة"], ["crime", "جريمة"], ["mystery", "غموض"],
  ["sci-fi", "خيال علمي"], ["fantasy", "فانتازيا"], ["war", "حربي"],
  ["documentary", "وثائقي"], ["family", "عائلي"], ["biography", "سيرة ذاتية"],
  ["musical", "موسيقي"], ["new-2026", "أفلام 2026"],
] as const;

export type MovieCategory = typeof MOVIE_CATEGORIES[number][0];
export const MOVIE_CATEGORY_IDS = new Set<string>(MOVIE_CATEGORIES.map(([id]) => id));
export const MOVIE_CATEGORY_LABELS = Object.fromEntries(MOVIE_CATEGORIES) as Record<MovieCategory, string>;

export function validMovieCategories(value: unknown): MovieCategory[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is MovieCategory => typeof item === "string" && MOVIE_CATEGORY_IDS.has(item)))].slice(0, 8);
}
