import {useCallback} from "react";
import {useLanguage} from "./useLanguage.ts";

/** Formats an ISO date in the UI language ("Oct 15, 2026", "15 أكتوبر 2026"), Latin digits like the app's counts. */
export const useFormatDate = () => {
    const {language} = useLanguage();
    return useCallback((iso: string, style: "medium" | "long" = "medium") =>
        new Intl.DateTimeFormat(language, {dateStyle: style, numberingSystem: "latn"}).format(new Date(iso)), [language]);
};
