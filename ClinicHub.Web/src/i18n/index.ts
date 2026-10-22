import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import {initReactI18next} from "react-i18next";
import en from "./locales/en.ts";
import ar from "./locales/ar.ts";
import {DEFAULT_LANGUAGE, getLanguage, LANGUAGES} from "./languages.ts";
import {formatCount} from "./numbers.ts";

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: {translation: en},
            ar: {translation: ar},
        },
        supportedLngs: LANGUAGES.map(l => l.code),
        fallbackLng: DEFAULT_LANGUAGE,
        load: "languageOnly",
        interpolation: {escapeValue: false},
        detection: {
            order: ["localStorage", "navigator"],
            lookupLocalStorage: "language",
            caches: ["localStorage"],
        },
    });

// `{{count, count}}`: grouped Latin digits in both languages (design M1.7 D9)
i18n.services.formatter?.add("count", (value: unknown, lng: string | undefined) =>
    formatCount(Number(value), lng ?? DEFAULT_LANGUAGE));

// Keep <html lang/dir> in sync so the browser, fonts and screen readers follow the language
const applyToDocument = (code: string | undefined) => {
    const language = getLanguage(code);
    document.documentElement.lang = language.code;
    document.documentElement.dir = language.dir;
};
applyToDocument(i18n.resolvedLanguage);
i18n.on("languageChanged", applyToDocument);

export default i18n;
