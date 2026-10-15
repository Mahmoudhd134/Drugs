import {useCallback} from "react";
import {useTranslation} from "react-i18next";
import type {Context} from "./types.ts";

/**
 * A context's name on screen (picker, app bar, messages): the platform admin and the template clinic by a translated
 * label (the template's stored name is English), any other clinic by its name.
 */
export const useContextLabel = () => {
    const {t} = useTranslation();
    return useCallback((context: Context) =>
        context.type === "platform" ? t("auth.platform") : context.isTemplate ? t("auth.template") : context.clinicName, [t]);
};
