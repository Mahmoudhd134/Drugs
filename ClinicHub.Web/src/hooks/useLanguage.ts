import {useTranslation} from "react-i18next";
import {getLanguage, type LanguageCode} from "../i18n/languages.ts";

export const useLanguage = () => {
    const {i18n} = useTranslation();
    const language = getLanguage(i18n.resolvedLanguage);

    return {
        language: language.code,
        dir: language.dir,
        setLanguage: (code: LanguageCode) => i18n.changeLanguage(code),
    };
};
