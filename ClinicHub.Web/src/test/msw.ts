import {delay, http, HttpResponse, type JsonBodyType} from "msw";
import type {PagedResult} from "../api/types.ts";
import type {PermissionDefinition} from "../features/access/api.ts";
import type {ClinicDetails, ClinicSummary} from "../features/admin/types.ts";
import type {AuthResult, Context, Me} from "../features/auth/types.ts";
import type {Protocol} from "../features/protocols/types.ts";
import type {Category, Drug, DrugTreeCategory, DrugTreeData, ProtocolDrug} from "../features/drugs/types.ts";
import type {AdminDrug} from "../features/admin/drugs/types.ts";
import type {AdminCategory} from "../features/admin/categories/types.ts";
import type {Attachment, AttachmentRules} from "../features/attachments/types.ts";
import type {PrintLayout, PrintTemplate} from "../features/printTemplates/types.ts";
import type {Role} from "../features/roles/types.ts";
import type {StaffMember} from "../features/staff/types.ts";
import {aCategory, aMe, aPaperImage, asDrug, NO_CALIBRATION, PAPER_RULES, PERMISSION_CATALOG} from "./data.ts";
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
    // Read at each request: a test may change `given` (a delete splices it) and the next GET shows it
    const all = () => given.map(d => ("category" in d ? d : asDrug(d)));
    return [
        http.get(api("/drugs"), ({request}) => {
            const params = new URL(request.url).searchParams;
            const source = params.get("source") || "all";
            const categoryId = params.get("categoryId");
            const subCategoryId = params.get("subCategoryId");
            const listed = all().filter(d => !d.withdrawn
                && (source === "all" || (source === "shared") === d.isShared)
                && (!categoryId || d.category.id === Number(categoryId))
                && (!subCategoryId || (subCategoryId === "none" ? d.subCategory === null : d.subCategory?.id === Number(subCategoryId))));
            return json(pageOf(request, listed));
        }),
        http.get(api("/drugs/:id"), ({params}) => {
            const drug = all().find(d => d.id === Number(params.id));
            return drug ? json(drug) : problem(404, "notFound");
        }),
        // The drug dialog reads the categories on open (design M1.7 D9): «العيون › المياه الزرقاء» unless a test adds
        // its own `drugCategoriesHandler` after these (a later `server.use` wins)
        drugCategoriesHandler(),
    ];
};

/** The pins of the tree's answer, by id like the API («أخرى» 23, «غير مصنف» 182). */
const PINNED_CATEGORY = 23;
const PINNED_SUBCATEGORY = 182;

/**
 * The tree of `drugs` as `GET /drugs/tree` answers it: the drugs `drugsHandlers` lists for the same search (by name)
 * and source (withdrawn hidden), counted per category and subcategory; categories and subcategories by id, the bucket
 * last; nothing with 0 matches.
 */
export const treeOf = (drugs: Drug[], search = "", source = "all"): DrugTreeData => {
    const term = search.trim().toLowerCase();
    const listed = drugs.filter(d => !d.withdrawn
        && (source === "all" || (source === "shared") === d.isShared)
        && (!term || d.name.toLowerCase().includes(term)));
    const categories = new Map<number, DrugTreeCategory>();
    for (const drug of listed) {
        const category = categories.get(drug.category.id)
            ?? {...drug.category, pinnedLast: drug.category.id === PINNED_CATEGORY, count: 0, subCategories: []};
        categories.set(category.id, category);
        category.count++;
        const subId = drug.subCategory?.id ?? null;
        let sub = category.subCategories.find(s => s.id === subId);
        if (!sub) {
            sub = drug.subCategory
                ? {...drug.subCategory, pinnedLast: drug.subCategory.id === PINNED_SUBCATEGORY, count: 0}
                : {id: null, nameEn: null, nameAr: null, pinnedLast: false, count: 0};
            category.subCategories.push(sub);
        }
        sub.count++;
    }
    const last = Number.MAX_SAFE_INTEGER;
    const sorted = [...categories.values()].sort((a, b) => a.id - b.id);
    for (const c of sorted) c.subCategories.sort((a, b) => (a.id ?? last) - (b.id ?? last));
    return {categories: sorted};
};

/**
 * `GET /drugs/tree` over `given` (see `treeOf`; an unknown `source` → 400 `invalidRequest`). `delayMs` delays every
 * answer, or a function picks the delay per search (e.g. an older, slower answer: CAT-102).
 * Register it before `drugsHandlers` (`server.use(drugTreeHandler(drugs), ...drugsHandlers(drugs))`): their
 * `GET /drugs/:id` matches `/drugs/tree` too and would answer it 404.
 */
export const drugTreeHandler = (given: Array<Drug | ProtocolDrug>,
                                {delayMs}: { delayMs?: number | ((search: string) => number) } = {}) => {
    // Read at each request (as drugsHandlers): a drug a test adds or deletes shows in the next tree
    const drugs = () => given.map(d => ("category" in d ? d : asDrug(d)));
    return http.get(api("/drugs/tree"), async ({request}) => {
        const params = new URL(request.url).searchParams;
        const search = params.get("search") ?? "";
        const source = params.get("source") || "all";
        const wait = typeof delayMs === "function" ? delayMs(search) : delayMs;
        if (wait) await delay(wait);
        if (!["all", "shared", "own"].includes(source)) return problem(400, "invalidRequest");
        return json(treeOf(drugs(), search, source));
    });
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

/**
 * `GET`, `PUT` and `DELETE /admin/clinics/:clinicId/prescription-template`. `GET` answers `template` (default null: 204);
 * `PUT` answers the body as saved (`{layout, updatedAt}`); `DELETE` 204. With `stateful`, writes change what the next `GET`
 * answers (a reload shows the save); without it (default), `GET` keeps answering `template`. Errors are per test
 * (`http.put(api(`/admin/clinics/${id}/prescription-template`), () => problem(400, "templatePageInvalid"))`, added after these).
 */
export const printTemplateHandlers = (clinicId: number,
                                      {template = null, stateful = false}: { template?: PrintTemplate | null; stateful?: boolean } = {}) => {
    const url = api(`/admin/clinics/${clinicId}/prescription-template`);
    let current = template;
    return [
        http.get(url, () => (current ? json(current) : new HttpResponse(null, {status: 204}))),
        http.put(url, async ({request}) => {
            const body = await request.json() as PrintLayout;
            // As the server answers (step 4 design § 4): a Save that sends no calibration saves 0, 0
            const saved: PrintTemplate = {layout: {...body, calibration: body.calibration ?? NO_CALIBRATION}, updatedAt: "2026-11-05T10:00:00Z"};
            if (stateful) current = saved;
            return json(saved);
        }),
        http.delete(url, () => {
            if (stateful) current = null;
            return new HttpResponse(null, {status: 204});
        }),
    ];
};

/**
 * The six routes of a clinic's paper image (step 4 contract § 8.2), kept in `files` (changed in place, newest first, as the API answers). POST replaces what's there, as the server's handler does; PUT replaces
 * that id, or answers 404 `notFound`; DELETE answers 204, or 404; `GET /{id}` answers a body whose text is `content of <name>`, with the row's `contentType`. Errors are per test, in a later `server.use`, which wins.
 *
 * jsdom can't carry a `File` through a multipart body (attachments contract § 2): an upload only checks that a part named `file` came (none: 400 `attachmentEmpty`) and stores `stored()`: `aPaperImage()` unless a test gives its own,
 * so a row's name is the test's, never the picked file's. The real name and bytes are e2e's.
 */
export const paperImageHandlers = (clinicId: number, files: Attachment[] = [],
                                   {rules = PAPER_RULES, stored = () => aPaperImage()}: { rules?: AttachmentRules; stored?: () => Attachment } = {}) => {
    const url = api(`/admin/clinics/${clinicId}/prescription-template/paper-image`);
    const indexOf = (id: unknown) => files.findIndex(file => file.id === id);
    const upload = async (request: Request, place: (saved: Attachment) => void) => {
        if (!(await request.text()).includes('name="file"')) return problem(400, "attachmentEmpty");
        const saved = stored();
        place(saved);
        return json(saved);
    };
    return [
        // Before `:id`, which would match it too
        http.get(`${url}/rules`, () => json(rules)),
        http.get(url, () => json(files)),
        http.post(url, ({request}) => upload(request, saved => files.splice(0, 1, saved))),
        http.put(`${url}/:id`, ({request, params}) => {
            const index = indexOf(params.id);
            return index < 0 ? problem(404, "notFound") : upload(request, saved => {
                files.splice(index, 1);
                files.unshift(saved);
            });
        }),
        http.delete(`${url}/:id`, ({params}) => {
            const index = indexOf(params.id);
            if (index < 0) return problem(404, "notFound");
            files.splice(index, 1);
            return new HttpResponse(null, {status: 204});
        }),
        http.get(`${url}/:id`, ({params}) => {
            const file = files[indexOf(params.id)];
            return file
                ? new HttpResponse(`content of ${file.originalFileName}`, {headers: {"Content-Type": file.contentType}})
                : problem(404, "notFound");
        }),
    ];
};

/**
 * `GET /prescription-template`, the clinic's own read: `template` or 204 (default). Errors or a change between two reads
 * are per test (`server.use(http.get(api("/prescription-template"), …))`, added after this).
 */
export const clinicPrintTemplateHandler = (template: PrintTemplate | null = null) =>
    http.get(api("/prescription-template"), () => (template ? json(template) : new HttpResponse(null, {status: 204})));

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
