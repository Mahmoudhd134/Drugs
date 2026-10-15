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

/** `errors.<code>` when that text exists. */
const translateCode = (code: string | null) =>
    code && i18n.exists(`errors.${code}`) ? i18n.t(`errors.${code}`) : null;

/** Translated, user-facing message for an API error (uses the "code" the API returns when present). */
export const getErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error) && !error.response) return i18n.t("errors.network");
    const apiError = toApiError(error);
    const message = translateCode(apiError?.code ?? null);
    if (message) return message;
    if (apiError?.status === 404) return i18n.t("errors.notFound");
    return i18n.t("errors.generic");
};

/**
 * Fields for codes the API answers without one (a 409 such as `staffExists` names no field), so the form shows them on
 * an input too: `{staffExists: "phone"}`.
 */
export type CodeFields = Readonly<Record<string, string>>;

const fieldOf = (item: ApiErrorItem, codeFields?: CodeFields) => item.field ?? codeFields?.[item.code];

/**
 * Translated message of the first error of each request field (`name`, `owner.phone`…), to show on the form's inputs.
 * Empty when the API named no field (show {@link getErrorMessage} instead).
 */
export const getFieldErrors = (error: unknown, codeFields?: CodeFields): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const item of toApiError(error)?.errors ?? []) {
        const field = fieldOf(item, codeFields);
        if (field && !(field in result)) result[field] = translateCode(item.code) ?? i18n.t("errors.generic");
    }
    return result;
};

/**
 * Translated messages (each once) of the errors a form can't show on its inputs: those of no field or of a field not
 * in `inputFields`. To toast next to the field errors.
 */
export const getOtherErrors = (error: unknown, inputFields: readonly string[], codeFields?: CodeFields): string[] => [
    ...new Set((toApiError(error)?.errors ?? [])
        .filter(item => {
            const field = fieldOf(item, codeFields);
            return !field || !inputFields.includes(field);
        })
        .map(item => translateCode(item.code) ?? i18n.t("errors.generic"))),
];

/**
 * A failed form save, split: the message of each input the form has (`fields`), and the rest to toast (`others`;
 * the error's message when no input shows anything, so something is always said).
 */
export const splitFormErrors = <F extends string>(error: unknown, inputFields: readonly F[], codeFields?: CodeFields) => {
    const all = getFieldErrors(error, codeFields);
    const fields: Partial<Record<F, string>> = {};
    for (const field of inputFields) if (all[field]) fields[field] = all[field];
    const others = Object.keys(fields).length === 0
        ? [getErrorMessage(error)]
        : getOtherErrors(error, inputFields, codeFields);
    return {fields, others};
};
