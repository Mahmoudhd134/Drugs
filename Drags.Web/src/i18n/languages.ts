// Single source of truth for the languages the app supports.
// To add a language: add it here, add a locale file under ./locales,
// and register it in ./index.ts.
export const LANGUAGES = [
    {code: "en", label: "English", dir: "ltr"},
    {code: "ar", label: "العربية", dir: "rtl"},
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LanguageCode = Language["code"];
export type Direction = Language["dir"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const getLanguage = (code: string | undefined): Language =>
    LANGUAGES.find(l => l.code === code) ?? LANGUAGES.find(l => l.code === DEFAULT_LANGUAGE)!;
