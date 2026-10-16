import {type BrowserContext, expect, type Page, test as base} from "@playwright/test";
import type {AuthResult} from "./api.ts";
import {type ConsolePolicy, expectHealthyPage, watchConsole} from "./checks.ts";
import {Data} from "./data.ts";
import {claimSuperAdminPhone} from "./phones.ts";
import {runState} from "./run.ts";
import {type Lang, TEXTS, type Texts} from "./texts.ts";

/** Where a fast login (`signIn`) lands: the login's own answer, a clinic, the platform or the template. */
export type SignInTarget = "asIs" | "platform" | "template" | { clinicId: number };

export type Options = {
    /** The UI language of the project (its browser locale makes the SPA pick it on the first visit) */
    lang: Lang;
};

type Fixtures = {
    /** The expected texts in the project's language */
    t: Texts;
    /** Test data through the API (the worker's super admin; owners for drugs and groups) */
    data: Data;
    /** dir/lang, no horizontal scroll, axe (serious/critical) on the page as it is now */
    healthy: (page?: Page) => Promise<void>;
    /** Another tab of the test's browser context (same cookies), its console watched too */
    newTab: () => Promise<Page>;
    /** Another browser (own cookies), with the project's options, its console watched */
    newBrowser: () => Promise<{ context: BrowserContext; page: Page }>;
    /** Every console error / uncaught exception of the test's pages (checked at the end) */
    consoleErrors: string[];
    /** What the console check lets through (see `allowNetworkErrors`) */
    consolePolicy: ConsolePolicy;
    /** The test cuts the API off on purpose (`route.abort`): the browser's "net::ERR_…" lines for /api/v1 are expected */
    allowNetworkErrors: () => void;
    /** The other pages and browsers the test opened (newTab, newBrowser): the end-of-test page checks run on these
     * pages too; the browsers close after them */
    opened: { pages: Page[]; contexts: BrowserContext[] };
};

type WorkerFixtures = {
    /** The worker's super admin API session (platform context) */
    admin: import("./api.ts").ApiSession;
};

export const test = base.extend<Options & Fixtures, WorkerFixtures>({
    lang: ["ar", {option: true}],
    // eslint-disable-next-line no-empty-pattern
    baseURL: async ({}, provide) => provide(runState().baseURL),
    t: async ({lang}, provide) => provide(TEXTS[lang]),
    // eslint-disable-next-line no-empty-pattern
    admin: [async ({}, provide) => {
        const session = await Data.superAdmin();
        await provide(session);
        await session.dispose();
    }, {scope: "worker"}],
    data: async ({admin}, provide) => {
        const data = new Data(admin);
        await provide(data);
        await data.dispose();
    },
    // eslint-disable-next-line no-empty-pattern
    consoleErrors: async ({}, provide) => {
        const errors: string[] = [];
        await provide(errors);
        expect(errors, "no console error or uncaught exception").toEqual([]);
    },
    // eslint-disable-next-line no-empty-pattern
    consolePolicy: async ({}, provide) => provide({networkErrors: false}),
    allowNetworkErrors: async ({consolePolicy}, provide) => provide(() => { consolePolicy.networkErrors = true; }),
    // eslint-disable-next-line no-empty-pattern
    opened: async ({}, provide) => {
        const opened = {pages: [] as Page[], contexts: [] as BrowserContext[]};
        await provide(opened);
        for (const context of opened.contexts) await context.close();
    },
    page: async ({page, consoleErrors, consolePolicy, opened, lang}, provide, testInfo) => {
        watchConsole(page, consoleErrors, consolePolicy);
        await provide(page);
        // Every test ends with the page checks on each page it left open (besides its own `healthy()` calls)
        if (testInfo.status !== "passed") return;
        for (const open of [page, ...opened.pages]) {
            if (open.isClosed() || !open.url().startsWith("http")) continue;
            const stored = await open.evaluate(() => localStorage.getItem("language")).catch(() => null);
            await expectHealthyPage(open, stored === "ar" || stored === "en" ? stored : lang, testInfo);
        }
    },
    healthy: async ({page, lang}, provide, testInfo) => {
        await provide(target => expectHealthyPage(target ?? page, lang, testInfo));
    },
    newTab: async ({context, consoleErrors, consolePolicy, opened}, provide) => {
        await provide(async () => {
            const tab = await context.newPage();
            watchConsole(tab, consoleErrors, consolePolicy);
            opened.pages.push(tab);
            return tab;
        });
    },
    newBrowser: async ({browser, consoleErrors, consolePolicy, opened}, provide, testInfo) => {
        await provide(async () => {
            const {locale, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent} = testInfo.project.use;
            const context = await browser.newContext({
                baseURL: runState().baseURL, locale, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent,
            });
            opened.contexts.push(context);
            const page = await context.newPage();
            watchConsole(page, consoleErrors, consolePolicy);
            opened.pages.push(page);
            return {context, page};
        });
    },
});

export {expect};

/** A super admin phone for a UI login (each login of the run gets its own: OTP limits). */
export const superAdminPhone = claimSuperAdminPhone;

/**
 * Logs in through the login page (real OTP flow, display mode: the code is filled in and sent automatically).
 * Ends where the app goes after the login (a clinic's `/`, the picker…); the caller asserts it.
 */
export const loginViaUi = async (page: Page, t: Texts, phone: string, from = "/login") => {
    await page.goto(from);
    await page.getByRole("textbox", {name: t.phone}).fill(phone);
    await page.getByRole("button", {name: t.sendCode}).click();
};

/**
 * The fast login (no login page): the OTP request and verify through the browser context's own request API, so the
 * refresh cookie lands in the browser, then an optional switch, then the SPA opens `path` and restores the session
 * from the cookie as on any reload. For tests whose subject is not the login itself.
 */
export const signIn = async (page: Page, phone: string, target: SignInTarget = "asIs", path = "/") => {
    const http = page.context().request;
    // Setup calls: a long timeout, the API may be slow on a busy machine (several test runs at once)
    const timeout = 60_000;
    const otp = await http.post("/api/v1/auth/otp/request", {data: {phone}, timeout});
    expect(otp.status(), `OTP request for ${phone}`).toBe(200);
    const {devCode} = await otp.json() as { devCode: string };
    const verify = await http.post("/api/v1/auth/otp/verify", {data: {phone, code: devCode}, timeout});
    expect(verify.status(), `login of ${phone}: ${await verify.text()}`).toBe(200);
    let auth = await verify.json() as AuthResult;
    if (target !== "asIs") {
        const context = target === "platform" ? auth.contexts.find(c => c.type === "platform")
            : target === "template" ? auth.contexts.find(c => c.type === "clinic" && c.isTemplate)
                : auth.contexts.find(c => c.type === "clinic" && c.clinicId === target.clinicId);
        if (!context) throw new Error(`${phone} has no context ${JSON.stringify(target)}`);
        const body = context.type === "platform" ? {type: "platform"} : {type: "clinic", clinicId: context.clinicId};
        const switched = await http.post("/api/v1/auth/context", {data: body, headers: {Authorization: `Bearer ${auth.accessToken}`}, timeout});
        expect(switched.status(), `switch of ${phone}: ${await switched.text()}`).toBe(200);
        auth = await switched.json() as AuthResult;
    }
    await page.goto(path);
    await settled(page);
    return auth;
};

/** The page finished loading what it shows (its requests answered, no spinner or progress bar left). */
export const settled = async (page: Page) => {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[role=progressbar]:visible"), "the page finished loading").toHaveCount(0);
};

/** The super admin on the platform (`/admin`), through the fast login. */
export const signInSuperAdmin = async (page: Page, path = "/admin") => {
    const phone = claimSuperAdminPhone();
    await signIn(page, phone, "platform", path);
    return phone;
};
