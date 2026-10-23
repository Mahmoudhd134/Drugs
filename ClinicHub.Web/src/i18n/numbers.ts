import {useTranslation} from "react-i18next";

/**
 * Every count shown (design M1.7 D9: tree, subtitles, cards, pagination, admin): grouped Latin digits in both
 * languages («23,414»). Locale texts use it as the `count` formatter: `{{count, count}}` (registered in i18n/index.ts).
 */
export const formatCount = (value: number, language: string) =>
    new Intl.NumberFormat(language, {numberingSystem: "latn"}).format(value);

/** `formatCount` in the UI language. */
export const useFormatCount = () => {
    const {i18n} = useTranslation();
    return (value: number) => formatCount(value, i18n.language);
};
