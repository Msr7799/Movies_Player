import type { MovieCategory } from "@/lib/movie-categories";

export type CategoryColors = Partial<Record<MovieCategory, string>>;

export const DEFAULT_CATEGORY_COLORS: CategoryColors = {
  egyptian: "#f59e0b", american: "#3b82f6", social: "#ec4899", site: "#14b8a6",
  arabic: "#f97316", historical: "#a16207", indian: "#e11d48", asian: "#8b5cf6",
  turkish: "#ef4444", anime: "#06b6d4", dubbed: "#84cc16", "arabic-series": "#fb7185",
  "turkish-series": "#dc2626", "foreign-series": "#6366f1", drama: "#a855f7", action: "#f43f5e",
  comedy: "#eab308", horror: "#991b1b", romance: "#f472b6", thriller: "#7c3aed",
  adventure: "#0ea5e9", crime: "#64748b", mystery: "#4338ca", "sci-fi": "#22d3ee",
  fantasy: "#c084fc", war: "#78716c", documentary: "#10b981", family: "#34d399",
  biography: "#d97706", musical: "#facc15", "new-2026": "#2dd4bf",
};

export function sanitizeCategoryColors(value: unknown): CategoryColors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [MovieCategory, string] => typeof entry[1] === "string" && /^#[0-9a-f]{6}$/i.test(entry[1]))) as CategoryColors;
}
