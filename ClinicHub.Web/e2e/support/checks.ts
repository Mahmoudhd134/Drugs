import AxeBuilder from "@axe-core/playwright";
import {expect, type Page, type TestInfo} from "@playwright/test";
import type {Lang} from "./texts.ts";

/**
 * Checks every visited page gets (design M1.6 D3 "End-to-end rules"): `dir`/`lang` of the UI language, no horizontal
 * scroll, an axe-core scan without serious or critical violations; and, for the whole test, no console error, no
 * uncaught exception and no API error answer (400–499) the test did not declare.
 */

/** Where a flagged element sits, read in the page (so a known bug matches only its documented elements). */
type Spot = {
    html: string;
    /** The element is no longer in the page (axe then names `:root`): the page changed during the scan */
    gone: boolean;
    /** A `role="listbox"` list that a search field (`input[type=search]`) controls by `aria-controls` */
    searchResultList: boolean;
    /** The `<ul>` right inside the sidebar's `<nav>` (the permanent one on desktop, the drawer on a phone) */
    sidebarList: boolean;
    /** The `<ul>` of the clinic picker's card on /select-clinic */
    pickerList: boolean;
    /**
     * One of the documented list loading bars: an unnamed MUI LinearProgress alone in its 4 px box right after a search
     * field's box, inside `main`, on the drugs list (/drugs: the box under the search, above the table), the groups
     * list (/groups: under the search's card) or a SearchableList picker (/, /groups/new, /groups/:id: under its
     * search field).
     */
    listLoadingBar: boolean;
    /** A button of the Quill toolbar (`.ql-toolbar button`) in a dialog (the «تعديل قبل النسخ» editor) */
    quillToolbarButton: boolean;
    /** The Quill toolbar's alignment picker label (`.ql-picker-label[role=button]`) in that dialog */
    quillPickerLabel: boolean;
};

/**
 * Axe findings that are known app bugs (docs/testing/known-bugs.md), each limited to the rule and the elements its row
 * documents. They are reported in the test's attachments, not failed, so the rest of the scan still guards every page;
 * the same rule on any other element fails. Each bug's own test (`onlyBug`) fails on it until it is fixed.
 */
export const KNOWN_AXE: { bug: string; rule: string; matches: (spot: Spot) => boolean }[] = [
    // The SearchableList result lists (prescription, group editor pickers): role="listbox" without an accessible name
    {bug: "BUG-500", rule: "aria-input-field-name", matches: s => s.searchResultList},
    // MUI Lists whose entries are ListItemButtons directly, not <li>: the sidebar (<a>; desktop and phone), the picker
    {bug: "BUG-501", rule: "list", matches: s => s.sidebarList || s.pickerList},
    // The login page's display-mode banner: white on the warning orange (#ed6c02), 3.1:1
    {bug: "BUG-502", rule: "color-contrast", matches: s => /OTP display mode|وضع عرض الكود/.test(s.html)},
    // The drug dialog's dosing preview while empty: "No dosing set" in text.disabled on #f5f5f5, 2.6:1
    {bug: "BUG-505", rule: "color-contrast", matches: s => /No dosing set|لا توجد جرعة محددة/.test(s.html)},
    // The staff editor's locked phone: its explanation (helper text) in the disabled grey, 2.7:1
    {bug: "BUG-506", rule: "color-contrast", matches: s => /The number can't be changed|لا يمكن تغيير الرقم/.test(s.html)},
    // The loading bar (MUI LinearProgress without aria-label) of DrugsPage, DrugGroupsPage and SearchableList
    {bug: "BUG-551", rule: "aria-progressbar-name", matches: s => s.listLoadingBar},
    // The Edit-before-copying dialog's Quill toolbar: its icon buttons, and its alignment picker's label
    {bug: "BUG-570", rule: "button-name", matches: s => s.quillToolbarButton},
    {bug: "BUG-570", rule: "aria-command-name", matches: s => s.quillPickerLabel},
];

const spotOf = async (page: Page, target: string, html: string): Promise<Spot> => {
    const nowhere = {
        gone: true, searchResultList: false, sidebarList: false, pickerList: false, listLoadingBar: false,
        quillToolbarButton: false, quillPickerLabel: false,
    };
    const where = await page.evaluate(({selector, html}) => {
        const el = document.querySelector(selector);
        if (!el || (el === document.documentElement && !/^<html\b/i.test(html))) return null;
        const id = el.getAttribute("id");
        const listPage = /^\/(drugs|groups(\/[^/]+)?)?\/?$/.test(location.pathname);
        const box = el.parentElement;
        const before = box?.previousElementSibling;
        const besideSearch = !!before && (before.matches("input[type=search]") || !!before.querySelector("input[type=search]"));
        const editorToolbar = !!el.closest(".MuiDialog-paper .ql-toolbar");
        return {
            gone: false,
            searchResultList: el.getAttribute("role") === "listbox" && !!id
                && !!document.querySelector(`input[type=search][aria-controls="${CSS.escape(id)}"]`),
            sidebarList: el.tagName === "UL" && !!el.parentElement?.matches(".MuiDrawer-paper nav"),
            pickerList: el.tagName === "UL" && location.pathname === "/select-clinic" && !!el.parentElement?.matches(".MuiCard-root"),
            listLoadingBar: listPage && !!el.closest("main")
                && el.matches(".MuiLinearProgress-root[role=progressbar]:not([aria-label]):not([aria-labelledby])")
                && !!box && box.children.length === 1 && getComputedStyle(box).height === "4px" && besideSearch,
            quillToolbarButton: editorToolbar && el.tagName === "BUTTON",
            quillPickerLabel: editorToolbar && el.matches(".ql-picker-label[role=button]"),
        };
    }, {selector: target, html}).catch(() => null);
    return {html, ...(where ?? nowhere)};
};

/** How a page check treats the known axe bugs (KNOWN_AXE). */
export type HealthOptions = {
    /**
     * A known bug's own test: that bug's allowance is dropped (its rule on its elements fails), the other known bugs are
     * still let through, so the test fails because of its own bug only and passes once that bug is fixed.
     */
    onlyBug?: string;
};

/** The serious/critical axe findings of the page now: the known bugs let through, the rest, and whether to scan again. */
const axeFindings = async (page: Page, options: HealthOptions) => {
    const results = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("[data-rht-toaster]").analyze();
    const blocking: string[] = [];
    const known: string[] = [];
    let changed = false;
    for (const violation of results.violations) {
        if (violation.impact !== "serious" && violation.impact !== "critical") continue;
        for (const node of violation.nodes) {
            const target = node.target.join(" ");
            const line = `${violation.id} (${violation.impact}): ${target} — ${node.failureSummary?.split("\n").slice(0, 2).join(" ")}`;
            const candidates = KNOWN_AXE.filter(k => k.rule === violation.id);
            const spot = candidates.length ? await spotOf(page, target, node.html) : null;
            if (spot?.gone) {
                // Gone before it could be placed (e.g. the loading bar of a refetch that ended): the page is scanned again
                changed = true;
                blocking.push(`${line} (element gone: ${node.html.slice(0, 120)})`);
                continue;
            }
            const bug = spot ? candidates.find(k => k.matches(spot)) : undefined;
            if (bug && bug.bug !== options.onlyBug) known.push(`${bug.bug}: ${line}`);
            else blocking.push(bug ? `${bug.bug} (this test's known bug): ${line}` : line);
        }
    }
    return {blocking, known, changed};
};

export const expectHealthyPage = async (page: Page, lang: Lang, testInfo?: TestInfo, options: HealthOptions = {}) => {
    if (options.onlyBug && !KNOWN_AXE.some(k => k.bug === options.onlyBug)) throw new Error(`${options.onlyBug} is not in KNOWN_AXE`);
    const html = page.locator("html");
    await expect(html, "html lang").toHaveAttribute("lang", lang);
    await expect(html, "html dir").toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    // The page as the user reads it: loaded (its requests answered, no spinner or progress bar left)
    const loaded = async () => {
        await page.waitForLoadState("networkidle").catch(() => { /* a page polling forever: the spinner check decides */ });
        await expect(page.locator("[role=progressbar]:visible"), "the page finished loading").toHaveCount(0);
    };
    await loaded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        {message: "no horizontal scroll"}).toBeLessThanOrEqual(0);
    // Settled: no transition or finite animation running (a tooltip or dialog fading in or out reads pale to axe's
    // colour-contrast rule). Spinners' endless animations don't count; a page still moving after 5 s is scanned as is.
    await page.waitForFunction(() => document.getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .every(a => a.playState !== "running"), null, {timeout: 5_000}).catch(() => { /* axe decides */ });

    // Toasts are left out: they fade in and out (a scan mid-animation reads a pale colour), and their colours are
    // react-hot-toast's own (dark on white). A flagged element that went away during the scan (the loading bar of a
    // refetch) can't be placed: the page is scanned again once loaded (at most 3 scans; still gone then fails).
    let findings = await axeFindings(page, options);
    for (let scan = 2; findings.changed && scan <= 3; scan++) {
        await loaded();
        findings = await axeFindings(page, options);
    }
    if (findings.known.length && testInfo) await testInfo.attach("axe known bugs", {body: findings.known.join("\n"), contentType: "text/plain"});
    expect(findings.blocking, `axe: serious/critical violations on ${page.url()}`).toEqual([]);
};

/** An API error answer (status 400–499) a test expects: its status, and the method and path (pathname) it comes from. */
export type ApiErrorSpec = { status: number; method?: string; path?: RegExp };

/** An API answer of 400–499 a page received. */
type ApiError = { status: number; method: string; path: string; page: string };

/**
 * What a test lets through: network failures only when it cuts the API off on purpose (`allowNetworkErrors`); API
 * answers of 400–499 only the ones it declares (`allowApiErrors`), besides `ALWAYS_EXPECTED`. `seen` collects the
 * API error answers of the test's pages.
 */
export type ConsolePolicy = { networkErrors: boolean; apiErrors: ApiErrorSpec[]; seen: ApiError[] };

/**
 * The API errors any test may meet: a page load without a session (anonymous, or logged out) restores nothing:
 * `POST /auth/refresh` answers 401 and the app opens /login without a message (auth tech § Frontend).
 */
const ALWAYS_EXPECTED: ApiErrorSpec[] = [{status: 401, method: "POST", path: /^\/api\/v1\/auth\/refresh$/}];

const matchesSpec = (error: ApiError, spec: ApiErrorSpec) => error.status === spec.status
    && (!spec.method || spec.method === error.method) && (!spec.path || spec.path.test(error.path));

/** The API answers of 400–499 the test's pages got and the test did not declare. */
export const unexpectedApiErrors = (policy: ConsolePolicy) => policy.seen
    .filter(e => ![...ALWAYS_EXPECTED, ...policy.apiErrors].some(spec => matchesSpec(e, spec)))
    .map(e => `API ${e.method} ${e.path} answered ${e.status} on ${e.page} (not declared with allowApiErrors)`);

/**
 * Console errors and uncaught exceptions of a page, and its API answers of 400–499 (checked at the end of the test
 * against what it declared). Left out of the console: the browser's own "Failed to load resource" line for an API
 * answer below 500 (the answer itself is recorded); and, only for a test that cut the API off on purpose
 * (`allowNetworkErrors()`), its "net::ERR_…" lines. An API 5xx is an error.
 */
export const watchConsole = (page: Page, errors: string[], policy: ConsolePolicy) => {
    page.on("console", message => {
        if (message.type() !== "error") return;
        const text = message.text();
        const url = message.location().url ?? "";
        if (text.startsWith("Failed to load resource") && /\/api\/v1\//.test(url)) {
            const status = /status of (\d+)/.exec(text);
            if (status && Number(status[1]) < 500) return;
            if (!status && policy.networkErrors && /net::ERR_/.test(text)) return;
        }
        errors.push(`console.error on ${page.url()}: ${text} (${url})`);
    });
    page.on("response", response => {
        const status = response.status();
        if (status < 400 || status >= 500) return;
        const path = new URL(response.url()).pathname;
        if (!path.startsWith("/api/v1/")) return;
        policy.seen.push({status, method: response.request().method(), path, page: page.url()});
    });
    page.on("pageerror", error => errors.push(`uncaught on ${page.url()}: ${error.message}`));
};
