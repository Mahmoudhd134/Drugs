import {http, HttpResponse, type JsonBodyType} from "msw";
import type {PagedResult} from "../api/types.ts";
import type {PermissionDefinition} from "../features/access/api.ts";
import type {ClinicDetails, ClinicSummary} from "../features/admin/types.ts";
import type {AuthResult, Context, Me} from "../features/auth/types.ts";
import type {Protocol} from "../features/protocols/types.ts";
import type {Category, Drug, ProtocolDrug} from "../features/drugs/types.ts";
import type {AdminDrug} from "../features/admin/drugs/types.ts";
import type {AdminCategory} from "../features/admin/categories/types.ts";
import type {Role} from "../features/roles/types.ts";
import type {StaffMember} from "../features/staff/types.ts";
import {aCategory, aMe, asDrug, PERMISSION_CATALOG} from "./data.ts";
import {server} from "./server.ts";

/*
 * MSW handler builders for the API as docs/tech/overview.md "API (/api/v1)" defines it. Use them with
 * `server.use(...)`; for writes or special answers, add a handler of your own (`http.post(api("/drugs"), …)`).
 */

/** The full URL pattern of an API route, e.g. `api("/drugs/:id")` (the SPA's `baseURL` is `/api/v1`). */
export const api = (path: string) => `/api/v1${path}`;

/** Status → title, as `ApiProblemFactory` writes them (docs/tech/overview.md "Errors"). */
const TITLES: Record<number, string> = {
    400: "Validation failed", 401: "Unauthorized", 403: "Forbidden", 404: "Not found", 405: "Method not allowed",
    409: "Conflict", 429: "Too many requests", 500: "Unexpected error",
};

export type ProblemError = { code: string; description?: string; field?: string };

/**
 * A ProblemDetails body (docs/tech/overview.md "Errors"): `code` = the first error's code, `errors` = all of them
 * (one with `code` when not given), `clinicNames` only when given.
 */
export const problemBody = (status: number, code: string,
                            options: { errors?: ProblemError[]; clinicNames?: string[]; drugCount?: number } = {}) => {
    const errors = (options.errors ?? [{code}]).map(e => ({description: `${e.code} (test)`, ...e}));
    return {
        type: `https://httpstatuses.io/${status}`,
        title: TITLES[status] ?? "Error",
        status,
        detail: errors[0]?.description ?? null,
        instance: null,
        code,
        errors,
        traceId: "00-test-trace-01",
        ...(options.clinicNames ? {clinicNames: options.clinicNames} : {}),
        ...(options.drugCount !== undefined ? {drugCount: options.drugCount} : {}),
    };
};

/** An error answer: `return problem(409, "roleInUse")` inside a handler. */
export const problem = (status: number, code: string, options?: Parameters<typeof problemBody>[2]) =>
    HttpResponse.json(problemBody(status, code, options), {status, headers: {"Content-Type": "application/problem+json"}});

/** A network failure (no HTTP answer: the SPA says "can't reach the server"). */
export const networkError = () => HttpResponse.error();

/** One page of `items` for a `?search=&page=&pageSize=` request, the search matched like a name filter. */
const pageOf = <T extends { name?: string; fullName?: string }>(request: Request, items: T[]): PagedResult<T> => {
    const params = new URL(request.url).searchParams;
    const search = (params.get("search") ?? "").trim().toLowerCase();
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    const matches = search ? items.filter(i => (i.name ?? i.fullName ?? "").toLowerCase().includes(search)) : items;
    return {items: matches.slice((page - 1) * pageSize, page * pageSize), totalCount: matches.length, page, pageSize};
};

const json = (body: JsonBodyType) => HttpResponse.json(body);

/**
 * `GET /drugs` (paged, searched by name; `source`, `categoryId` and `subCategoryId` filtered like the API, in the given
 * order) and `GET /drugs/:id` (404 `notFound` when missing). A protocol line's drug gets the full shape (`asDrug`).
 */
export const drugsHandlers = (given: Array<Drug | ProtocolDrug>) => {
    const drugs = given.map(d => ("category" in d ? d : asDrug(d)));
    return [
        http.get(api("/drugs"), ({request}) => {
            const params = new URL(request.url).searchParams;
            const source = params.get("source") || "all";
            const categoryId = params.get("categoryId");
            const subCategoryId = params.get("subCategoryId");
            const listed = drugs.filter(d => !d.withdrawn
                && (source === "all" || (source === "shared") === d.isShared)
                && (!categoryId || d.category.id === Number(categoryId))
                && (!subCategoryId || (subCategoryId === "none" ? d.subCategory === null : d.subCategory?.id === Number(subCategoryId))));
            return json(pageOf(request, listed));
        }),
        http.get(api("/drugs/:id"), ({params}) => {
            const drug = drugs.find(d => d.id === Number(params.id));
            return drug ? json(drug) : problem(404, "notFound");
        }),
    ];
};

/** `GET /drug-categories` (default: «العيون» with «المياه الزرقاء»). */
export const drugCategoriesHandler = (categories: Category[] = [aCategory()]) =>
    http.get(api("/drug-categories"), () => json(categories));

/**
 * `GET /admin/drugs` (paged, searched by name, `status` active by default, category filters) and the admin writes:
 * `POST`/`PUT /admin/drugs[/:id]` answer the saved drug, `withdraw`/`restore` 204 (404 when missing). The list is kept
 * in memory, so a write shows in the next GET.
 */
export const adminDrugsHandlers = (drugs: AdminDrug[]) => {
    const find = (id: unknown) => drugs.find(d => d.id === Number(id));
    return [
        http.get(api("/admin/drugs"), ({request}) => {
            const params = new URL(request.url).searchParams;
            const status = params.get("status") || "active";
            const categoryId = params.get("categoryId");
            const subCategoryId = params.get("subCategoryId");
            const listed = drugs.filter(d => (status === "all" || (status === "withdrawn") === d.withdrawn)
                && (!categoryId || d.category.id === Number(categoryId))
                && (!subCategoryId || (subCategoryId === "none" ? d.subCategory === null : d.subCategory?.id === Number(subCategoryId))));
            return json(pageOf(request, listed));
        }),
        http.get(api("/admin/drugs/:id"), ({params}) => {
            const drug = find(params.id);
            return drug ? json(drug) : problem(404, "notFound");
        }),
        http.post(api("/admin/drugs/:id/withdraw"), ({params}) => {
            const drug = find(params.id);
            if (!drug) return problem(404, "notFound");
            if (!drug.withdrawn) Object.assign(drug, {withdrawn: true, withdrawnAt: "2026-10-22T10:00:00Z"});
            return new HttpResponse(null, {status: 204});
        }),
        http.post(api("/admin/drugs/:id/restore"), ({params}) => {
            const drug = find(params.id);
            if (!drug) return problem(404, "notFound");
            Object.assign(drug, {withdrawn: false, withdrawnAt: null});
            return new HttpResponse(null, {status: 204});
        }),
    ];
};

/**
 * `GET /admin/drug-categories` (with counts). Writes (create, rename, delete, and the 409 `categoryInUse` with
 * `drugCount`) are per test: `http.post(api("/admin/drug-categories"), …)`, `problem(409, "categoryInUse", {drugCount: 3})`.
 */
export const adminCategoriesHandler = (categories: AdminCategory[]) =>
    http.get(api("/admin/drug-categories"), () => json(categories));

/** `GET /protocols` (paged, searched by name) and `GET /protocols/:id` (404 `notFound` when missing). */
export const protocolsHandlers = (protocols: Protocol[]) => [
    http.get(api("/protocols"), ({request}) => json(pageOf(request, protocols))),
    http.get(api("/protocols/:id"), ({params}) => {
        const protocol = protocols.find(g => g.id === Number(params.id));
        return protocol ? json(protocol) : problem(404, "notFound");
    }),
];

/** `GET /me` (every permission in clinic 1 by default). */
export const meHandler = (me: Me = aMe()) => http.get(api("/me"), () => json(me));

/** `GET /permissions`: the catalog (the backend's 11 keys by default). */
export const permissionsHandler = (catalog: PermissionDefinition[] = PERMISSION_CATALOG) =>
    http.get(api("/permissions"), () => json(catalog));

/** `GET /auth/contexts`. */
export const contextsHandler = (contexts: Context[]) => http.get(api("/auth/contexts"), () => json(contexts));

/** `POST /auth/refresh`: the given session, or `problem(401, "unauthorized")` when null (logged out). */
export const refreshHandler = (auth: AuthResult | null) =>
    http.post(api("/auth/refresh"), () => (auth ? json(auth) : problem(401, "unauthorized")));

/** `GET /admin/clinics` (paged, searched by name) and `GET /admin/clinics/:id` (404 when missing). */
export const adminClinicsHandlers = (clinics: ClinicDetails[]) => [
    http.get(api("/admin/clinics"), ({request}) => {
        const status = new URL(request.url).searchParams.get("status");
        const summaries: ClinicSummary[] = clinics
            .filter(c => !status || c.status === status)
            .map(({id, name, status: clinicStatus, staffCount, createdAt}) => ({id, name, status: clinicStatus, staffCount, createdAt}));
        return json(pageOf(request, summaries));
    }),
    http.get(api("/admin/clinics/:id"), ({params}) => {
        const clinic = clinics.find(c => c.id === Number(params.id));
        return clinic ? json(clinic) : problem(404, "notFound");
    }),
];

/** `GET /admin/clinics/:clinicId/roles` (Owner first, then by name, as the API orders them). */
export const rolesHandler = (clinicId: number, roles: Role[]) =>
    http.get(api(`/admin/clinics/${clinicId}/roles`), () =>
        json([...roles].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name))));

/** `GET /admin/clinics/:clinicId/staff` (paged, searched by name). */
export const staffHandler = (clinicId: number, staff: StaffMember[]) =>
    http.get(api(`/admin/clinics/${clinicId}/staff`), ({request}) => json(pageOf(request, staff)));

export type RecordedRequest = { method: string; path: string; search: string; body: unknown };

/**
 * Records every request the SPA sends from now on (method, path without `/api/v1`, query, JSON body), e.g. to check
 * that a double click sends one POST, or that nothing is saved on the server (`writes()`).
 */
export const recordRequests = () => {
    const requests: RecordedRequest[] = [];
    const listener = async ({request}: { request: Request }) => {
        const url = new URL(request.url);
        const text = await request.clone().text();
        let body: unknown = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = text;
        }
        requests.push({method: request.method, path: url.pathname.replace(/^\/api\/v1/, ""), search: url.search, body});
    };
    server.events.on("request:start", listener);
    return {
        requests,
        /** The requests that change something on the server (every method but GET) */
        writes: () => requests.filter(r => r.method !== "GET"),
        stop: () => server.events.removeListener("request:start", listener),
    };
};
