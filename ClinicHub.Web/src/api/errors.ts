import axios from "axios";
import i18n from "../i18n";

/** Translated, user-facing message for an API error (uses the "code" the API returns when present). */
export const getErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error)) {
        const code = (error.response?.data as { code?: string } | undefined)?.code;
        if (code && i18n.exists(`errors.${code}`)) return i18n.t(`errors.${code}`);
        if (error.response?.status === 404) return i18n.t("errors.notFound");
        if (!error.response) return i18n.t("errors.network");
    }
    return i18n.t("errors.generic");
};
