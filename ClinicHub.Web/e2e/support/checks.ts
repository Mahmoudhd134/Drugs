import AxeBuilder from "@axe-core/playwright";
import {expect, type Page, type TestInfo} from "@playwright/test";
import type {Lang} from "./texts.ts";

/**
 * Checks every visited page gets (design M1.6 D3 "End-to-end rules"): `dir`/`lang` of the UI language, no horizontal
 * scroll, an axe-core scan without serious or critical violations; and, for the whole test, no console error, no
 * uncaught exception and no API error answer (400–499) the test did not declare.
 */

/**
 * Where a flagged element sits, read in the page (so a known bug matches only its documented elements). A known bug
 * adds the fields its entry needs (e.g. "a `role=listbox` list that a search field controls"), read in `spotOf`.
 */
type Spot = {
    html: string;
    /** The element is no longer in the page (axe then names `:root`): the page changed during the scan */
    gone: boolean;
};

/**
 * Axe findings that are known app bugs (docs/testing/known-bugs.md), each limited to the rule and the elements its row
 * documents. They are reported in the test's attachments, not failed, so the rest of the scan still guards every page;
 * the same rule on any other element fails. Each bug's own test (`onlyBug`) fails on it until it is fixed. None today.
 */
export const KNOWN_AXE: { bug: string; rule: string; matches: (spot: Spot) => boolean }[] = [];

const spotOf = async (page: Page, target: string, html: string): Promise<Spot> => {
    const where = await page.evaluate(({selector, html}) => {
        const el = document.querySelector(selector);
        if (!el || (el === document.documentElement && !/^<html\b/i.test(html))) return null;
        return {gone: false};
    }, {selector: target, html}).catch(() => null);
    return {html, ...(where ?? {gone: true})};
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
