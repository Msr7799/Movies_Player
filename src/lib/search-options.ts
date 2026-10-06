export const MOVIE_LANGUAGE_OPTIONS = [
  { value: "any", label: "كل اللغات", search: "any country or language" },
  { value: "ar", label: "عربي", search: "Arabic-language cinema" },
  { value: "en", label: "إنجليزي", search: "English-language cinema" },
  { value: "hi", label: "هندي", search: "Indian cinema, especially Hindi and Bollywood" },
  { value: "tr", label: "تركي", search: "Turkish-language cinema" },
  { value: "ko", label: "كوري", search: "Korean-language cinema" },
  { value: "ja", label: "ياباني", search: "Japanese-language cinema" },
  { value: "fr", label: "فرنسي", search: "French-language cinema" },
  { value: "es", label: "إسباني", search: "Spanish-language cinema" },
  { value: "world", label: "أخرى / عالمية", search: "world cinema outside the common English-language results" },
] as const;

export const SUBTITLE_LANGUAGE_OPTIONS = [
  { value: "any", label: "بدون تفضيل", search: "no subtitle-language requirement" },
  { value: "ar", label: "ترجمة عربية", search: "Arabic subtitles" },
  { value: "en", label: "ترجمة إنجليزية", search: "English subtitles" },
  { value: "tr", label: "ترجمة تركية", search: "Turkish subtitles" },
  { value: "fr", label: "ترجمة فرنسية", search: "French subtitles" },
  { value: "es", label: "ترجمة إسبانية", search: "Spanish subtitles" },
  { value: "de", label: "ترجمة ألمانية", search: "German subtitles" },
  { value: "it", label: "ترجمة إيطالية", search: "Italian subtitles" },
] as const;

export type MovieLanguageValue = (typeof MOVIE_LANGUAGE_OPTIONS)[number]["value"];
export type SubtitleLanguageValue = (typeof SUBTITLE_LANGUAGE_OPTIONS)[number]["value"];

export function movieLanguageOption(value: unknown) {
  return MOVIE_LANGUAGE_OPTIONS.find((option) => option.value === value) ?? MOVIE_LANGUAGE_OPTIONS[0];
}

export function subtitleLanguageOption(value: unknown) {
  return SUBTITLE_LANGUAGE_OPTIONS.find((option) => option.value === value) ?? SUBTITLE_LANGUAGE_OPTIONS[0];
}
