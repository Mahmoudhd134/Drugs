import {screen, within} from "@testing-library/react";
import type {Permission} from "../../features/access/permissions.ts";
import type {Category, Drug} from "../../features/drugs/types.ts";
import {DrugsPage} from "../../features/drugs/pages/DrugsPage.tsx";
import {aCategory, aSubCategory, EYE, GLAUCOMA, OTHER, UNCLASSIFIED} from "../data.ts";
import {http, HttpResponse, type RequestHandler} from "msw";
import {api, drugCategoriesHandler, drugsHandlers, drugTreeHandler, type recordRequests} from "../msw.ts";
import {renderWithProviders} from "../render.tsx";
import {server} from "../server.ts";
import {categoryField, subCategoryField} from "./drugDialog.ts";

/*
 * The drugs page with its filters (M1.7c contract § 3.4; design M1.7 D9): the source toggle (`drugs.source.label`,
 * buttons «الكل» / «المشتركة» / «أدوية العيادة»), the category select (`drugs.category`, first option
 * `drugs.allCategories`) and the subcategory select (`drugs.subCategory`, disabled until a category is chosen, first
 * option `drugs.allSubCategories`, last `drugs.noSubCategory`), all in the URL query (C2); the view toggle
 * (`drugs.view.label`, «شجرة» / «قائمة», URL `view=list`; the tree is the default: docs/design/m1.7-review-contract.md R1).
 */

type Lang = "ar" | "en";

const TEXTS = {
    ar: {source: "الأدوية المعروضة", all: "الكل", shared: "المشتركة", own: "أدوية العيادة", view: "طريقة العرض", tree: "شجرة", list: "قائمة"},
    en: {source: "Drugs to show", all: "All", shared: "Shared", own: "Clinic's own", view: "View", tree: "Tree", list: "List"},
};

/** «العيون» (17: «المياه الزرقاء» 138, «جفاف العين» 139), «الجلدية» (5: «حب الشباب» 40), «أخرى» (23, pinned: «غير مصنف» 182). */
export const SKIN = {id: 5, nameEn: "Skin", nameAr: "الجلدية"};
export const ACNE = {id: 40, nameEn: "Acne", nameAr: "حب الشباب"};
export const DRY_EYE = {id: 139, nameEn: "Dry eye", nameAr: "جفاف العين"};

export const PAGE_CATEGORIES: Category[] = [
    aCategory({...EYE, subCategories: [{...GLAUCOMA, pinnedLast: false}, aSubCategory({...DRY_EYE})]}),
    aCategory({...SKIN, subCategories: [aSubCategory({...ACNE})]}),
    aCategory({...OTHER, pinnedLast: true, subCategories: [{...UNCLASSIFIED, pinnedLast: true}]}),
];

/** `route` with `view=list` added, unless it already names a view. */
export const inList = (route: string) => {
    const url = new URL(route, "http://localhost");
    if (!url.searchParams.has("view")) url.searchParams.append("view", "list");
    return `${url.pathname}${url.search}`;
};

/**
 * Renders the drugs page at `route` (default `/drugs`) over `drugs` (`drugTreeHandler` + `drugsHandlers`) and
 * `categories` (`GET /drug-categories`; default `PAGE_CATEGORIES`). `view` "list" (the default here: most page tests
 * test the table) adds `view=list` to a route without a view; "tree" opens the route as given (no `view`: the tree).
 * Doesn't wait for anything.
 */
export const renderDrugsPage = async (drugs: Drug[], options: {
    lang?: Lang; route?: string; view?: "tree" | "list"; permissions?: Permission[]; categories?: Category[];
    /** `GET /drug-categories` answers only once this resolves */
    categoriesHeld?: Promise<void>;
    /** Handlers of the test's own, used before the defaults (e.g. a `GET /drugs` with a huge total) */
    handlers?: RequestHandler[];
} = {}) => {
    const {lang = "ar", route = "/drugs", view = "list", permissions, categories = PAGE_CATEGORIES, categoriesHeld, handlers = []} = options;
    // The tree's handler first: drugsHandlers' `GET /drugs/:id` would answer `/drugs/tree` 404
    server.use(drugTreeHandler(drugs), ...drugsHandlers(drugs));
    // A later `server.use` wins over drugsHandlers' default categories
    server.use(categoriesHeld
        ? http.get(api("/drug-categories"), async () => {
            await categoriesHeld;
            return HttpResponse.json(categories);
        })
        : drugCategoriesHandler(categories));
    if (handlers.length) server.use(...handlers);
    return renderWithProviders(<DrugsPage/>, {lang, route: view === "list" ? inList(route) : route, path: "/drugs",
        user: permissions ? {permissions} : undefined});
};

/** The view toggle «طريقة العرض» / "View" (a group of two toggle buttons). */
export const viewToggle = (lang: Lang = "ar") => screen.getByRole("group", {name: TEXTS[lang].view});

/** One button of the view toggle: "tree" | "list". */
export const viewButton = (view: "tree" | "list", lang: Lang = "ar") =>
    within(viewToggle(lang)).getByRole("button", {name: TEXTS[lang][view]});

/** The view whose button is pressed (fails unless exactly one is). */
export const pressedView = (lang: Lang = "ar") => {
    const pressed = (["tree", "list"] as const).filter(v => viewButton(v, lang).getAttribute("aria-pressed") === "true");
    if (pressed.length !== 1) throw new Error(`Expected one pressed view button, found ${pressed.join(", ") || "none"}`);
    return pressed[0];
};

/** The source toggle (a group of three toggle buttons). */
export const sourceToggle = (lang: Lang = "ar") => screen.getByRole("group", {name: TEXTS[lang].source});

/** One button of the source toggle: "all" | "shared" | "own". */
export const sourceButton = (source: "all" | "shared" | "own", lang: Lang = "ar") =>
    within(sourceToggle(lang)).getByRole("button", {name: TEXTS[lang][source]});

/** The source whose button is pressed (fails unless exactly one is). */
export const pressedSource = (lang: Lang = "ar") => {
    const pressed = (["all", "shared", "own"] as const).filter(s => sourceButton(s, lang).getAttribute("aria-pressed") === "true");
    if (pressed.length !== 1) throw new Error(`Expected one pressed source button, found ${pressed.join(", ") || "none"}`);
    return pressed[0];
};

/** The page's category / subcategory filters (the drug dialog's helpers: by the start of the accessible name). */
export const categoryFilter = (lang: Lang = "ar") => categoryField(document.body, lang);
export const subCategoryFilter = (lang: Lang = "ar") => subCategoryField(document.body, lang);

/** The subtitle «إجمالي الأدوية: N» / "Total drugs: N" (N as shown: grouped digits). */
export const subtitle = (count: string, lang: Lang = "ar") => (lang === "ar" ? `إجمالي الأدوية: ${count}` : `Total drugs: ${count}`);

/** The table row of a drug, by its name. */
export const rowOf = async (name: string) => (await screen.findByText(name, {exact: true})).closest("tr") as HTMLElement;

/** The `GET /drugs` list requests recorded, as their query. */
export const listQueries = (recorded: ReturnType<typeof recordRequests>) =>
    recorded.requests.filter(r => r.method === "GET" && r.path === "/drugs").map(r => new URLSearchParams(r.search));

/** The query of the last `GET /drugs` recorded (fails when none). */
export const lastListQuery = (recorded: ReturnType<typeof recordRequests>) => {
    const queries = listQueries(recorded);
    if (!queries.length) throw new Error("No GET /drugs was sent");
    return queries[queries.length - 1];
};

/**
 * Watches the document for `texts` from now on (before the answers arrive): `seen()` lists those that were ever in the
 * page, even for a moment (e.g. an empty state flashing before the last page shows). Call `stop()` at the end.
 */
export const watchTexts = (...texts: string[]) => {
    const seen = new Set<string>();
    const check = () => {
        const content = document.body.textContent ?? "";
        for (const text of texts) if (content.includes(text)) seen.add(text);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    check();
    return {
        seen: () => {
            check();
            return [...seen];
        },
        stop: () => observer.disconnect(),
    };
};

/**
 * Categories whose id order, Arabic order and English order all differ, with the pinned «أخرى» (which would sort first
 * in Arabic and before "Skin" in English) and the catalog's longest name, 37 characters (CAT-145).
 */
export const LONG_CATEGORY_NAME = "مكافحة الشيخوخة وشد البشرة وحول العين";
export const ORDER_CATEGORIES: Category[] = [
    aCategory({id: 1, nameEn: "Anti-ageing and skin firming", nameAr: LONG_CATEGORY_NAME, subCategories: []}),
    aCategory({id: 3, nameEn: "Cardiology", nameAr: "أمراض القلب", subCategories: []}),
    aCategory({...SKIN, subCategories: [aSubCategory({...ACNE})]}),
    aCategory({
        ...EYE, subCategories: [
            aSubCategory({id: 140, nameEn: "Anti-infectives", nameAr: "مضادات العدوى للعين"}),
            {...UNCLASSIFIED, id: 182, pinnedLast: true},
            {...GLAUCOMA, pinnedLast: false},
            aSubCategory({id: 139, nameEn: "Dry eye", nameAr: "جفاف العين"}),
        ],
    }),
    aCategory({...OTHER, pinnedLast: true, subCategories: []}),
];

/** The expected order (design M1.7 D5): `Intl.Collator` in the UI language, the `pinnedLast` rows last. */
export const sortedNames = (rows: { nameEn: string; nameAr: string; pinnedLast: boolean }[], lang: "ar" | "en") => {
    const name = (r: { nameEn: string; nameAr: string }) => (lang === "ar" ? r.nameAr : r.nameEn);
    const collator = new Intl.Collator(lang);
    const byName = (list: typeof rows) => list.map(name).sort(collator.compare);
    return [...byName(rows.filter(r => !r.pinnedLast)), ...byName(rows.filter(r => r.pinnedLast))];
};
