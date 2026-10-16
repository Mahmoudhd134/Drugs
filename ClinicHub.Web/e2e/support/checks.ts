import AxeBuilder from "@axe-core/playwright";
import {expect, type Page, type TestInfo} from "@playwright/test";
import type {Lang} from "./texts.ts";

/**
 * Checks every visited page gets (design M1.6 D3 "End-to-end rules"): `dir`/`lang` of the UI language, no horizontal
 * scroll, an axe-core scan without serious or critical violations; and, for the whole test, no console error and no
 * uncaught exception.
 */

/** Where a flagged element sits, read in the page (so a known bug matches only its documented elements). */
type Spot = {
    html: string;
    /** A `role="listbox"` list that a search field (`input[type=search]`) controls by `aria-controls` */
    searchResultList: boolean;
    /** The `<ul>` right inside the sidebar's `<nav>` (the permanent one on desktop, the drawer on a phone) */
    sidebarList: boolean;
    /** The `<ul>` of the clinic picker's card on /select-clinic */
    pickerList: boolean;
    /**
     * An unnamed MUI LinearProgress on a page that shows the drugs list (/drugs), the groups list (/groups) or a
     * SearchableList picker (/, /groups/new, /groups/:id). The bar often goes away before axe names its target (axe
     * then reports `:root`): its HTML decides then.
     */
    listLoadingBar: boolean;
};

/**
 * Axe findings that are known app bugs (docs/testing/known-bugs.md), each limited to the elements its row
 * documents. They are reported in the test's attachments, not failed, so the rest of the scan still guards every page;
 * the same rule on any other element fails.
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
];

const spotOf = async (page: Page, target: string, html: string): Promise<Spot> => {
    const nowhere = {searchResultList: false, sidebarList: false, pickerList: false, listLoadingBar: false};
    const where = await page.evaluate(({selector, html}) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const id = el.getAttribute("id");
        const listPage = /^\/(drugs|groups(\/[^/]+)?)?\/?$/.test(location.pathname);
        const unnamedBarHtml = /^<span\b[^>]*\bMuiLinearProgress-root\b/.test(html) && /\brole="progressbar"/.test(html)
            && !/\baria-label(ledby)?=/.test(html);
        const gone = el === document.documentElement;
        return {
            searchResultList: el.getAttribute("role") === "listbox" && !!id
                && !!document.querySelector(`input[type=search][aria-controls="${CSS.escape(id)}"]`),
            sidebarList: el.tagName === "UL" && !!el.parentElement?.matches(".MuiDrawer-paper nav"),
            pickerList: el.tagName === "UL" && location.pathname === "/select-clinic" && !!el.parentElement?.matches(".MuiCard-root"),
            listLoadingBar: listPage && unnamedBarHtml
                && (gone || el.matches("main .MuiLinearProgress-root[role=progressbar]:not([aria-label]):not([aria-labelledby])")),
        };
    }, {selector: target, html}).catch(() => null);
    return {html, ...(where ?? nowhere)};
};

export const expectHealthyPage = async (page: Page, lang: Lang, testInfo?: TestInfo, options: { ignoreKnownBugs?: boolean } = {}) => {
    const html = page.locator("html");
    await expect(html, "html lang").toHaveAttribute("lang", lang);
    await expect(html, "html dir").toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    // The page as the user reads it: loaded (its requests answered, no spinner or progress bar left)
    await page.waitForLoadState("networkidle").catch(() => { /* a page polling forever: the spinner check decides */ });
    await expect(page.locator("[role=progressbar]:visible"), "the page finished loading").toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        {message: "no horizontal scroll"}).toBeLessThanOrEqual(0);
    // Settled: no transition or finite animation running (a tooltip or dialog fading in or out reads pale to axe's
    // colour-contrast rule). Spinners' endless animations don't count; a page still moving after 5 s is scanned as is.
    await page.waitForFunction(() => document.getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .every(a => a.playState !== "running"), null, {timeout: 5_000}).catch(() => { /* axe decides */ });

    // Toasts are left out: they fade in and out (a scan mid-animation reads a pale colour), and their colours are
    // react-hot-toast's own (dark on white)
    const results = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("[data-rht-toaster]").analyze();
    const blocking: string[] = [];
    const known: string[] = [];
    for (const violation of results.violations) {
        if (violation.impact !== "serious" && violation.impact !== "critical") continue;
        for (const node of violation.nodes) {
            const target = node.target.join(" ");
            const line = `${violation.id} (${violation.impact}): ${target} — ${node.failureSummary?.split("\n").slice(0, 2).join(" ")}`;
            const candidates = options.ignoreKnownBugs === false ? [] : KNOWN_AXE.filter(k => k.rule === violation.id);
            const spot = candidates.length ? await spotOf(page, target, node.html) : null;
            const bug = spot ? candidates.find(k => k.matches(spot)) : undefined;
            if (bug) known.push(`${bug.bug}: ${line}`);
            else blocking.push(line);
        }
    }
    if (known.length && testInfo) await testInfo.attach("axe known bugs", {body: known.join("\n"), contentType: "text/plain"});
    expect(blocking, `axe: serious/critical violations on ${page.url()}`).toEqual([]);
};

/** What a test lets through in the console: network failures only when it cuts the API off on purpose. */
export type ConsolePolicy = { networkErrors: boolean };

/**
 * Console errors and uncaught exceptions of a page. Left out: the browser's own "Failed to load resource" line for an
 * API answer below 500 (a 401/403/404/409/429 the test asks for); and, only for a test that cut the API off on purpose
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
    page.on("pageerror", error => errors.push(`uncaught on ${page.url()}: ${error.message}`));
};
