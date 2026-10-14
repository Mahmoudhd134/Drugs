import axios from "axios";
import i18n from "../i18n";

/** One error of the API's ProblemDetails `errors` list. */
export interface ApiErrorItem {
    code: string;
    /** English, for developers; the UI translates `code` instead. */
    description: string;
    /** Request property, e.g. `name` or `items[0].dosing`, when known. */
    field?: string;
}

/**
 * An error answered by the API. Every API error is a ProblemDetails
 * (`type, title, status, detail, instance, code, errors[], traceId`); this is the part the SPA uses.
 */
export interface ApiError {
    status: number;
    /** The first error's code (translated as `errors.<code>`); null if the body is not a ProblemDetails. */
    code: string | null;
    errors: ApiErrorItem[];
    traceId: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseItems = (value: unknown): ApiErrorItem[] =>
    Array.isArray(value)
        ? value.filter(isObject).flatMap(item => typeof item.code === "string"
            ? [{
                code: item.code,
                description: typeof item.description === "string" ? item.description : "",
                ...(typeof item.field === "string" ? {field: item.field} : {}),
            }]
            : [])
        : [];

/**
 * The one place that reads API error responses: the ApiError of a failed request, or null when there
 * is no HTTP response (network error, cancelled) or the error is not from axios.
 */
export const toApiError = (error: unknown): ApiError | null => {
    if (!axios.isAxiosError(error) || !error.response) return null;
    const data: unknown = error.response.data;
    const body = isObject(data) ? data : {};
    return {
        status: error.response.status,
        code: typeof body.code === "string" ? body.code : null,
        errors: parseItems(body.errors),
        traceId: typeof body.traceId === "string" ? body.traceId : null,
    };
};

/** Translated, user-facing message for an API error (uses the "code" the API returns when present). */
export const getErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error) && !error.response) return i18n.t("errors.network");
    const apiError = toApiError(error);
    if (apiError?.code && i18n.exists(`errors.${apiError.code}`)) return i18n.t(`errors.${apiError.code}`);
    if (apiError?.status === 404) return i18n.t("errors.notFound");
    return i18n.t("errors.generic");
};
