import AxeBuilder from "@axe-core/playwright";
import {expect, type Page, type TestInfo} from "@playwright/test";
import type {Lang} from "./texts.ts";

/**
 * Checks every visited page gets (design M1.6 D3 "End-to-end rules"): `dir`/`lang` of the UI language, no horizontal
 * scroll, an axe-core scan without serious or critical violations; and, for the whole test, no console error and no
 * uncaught exception.
 */

/**
 * Axe findings that are known app bugs (docs/testing/known-bugs.e2e.md): `rule` + a part of the element's selector.
 * They are reported in the test's attachments, not failed, so the rest of the scan still guards every page.
 */
export const KNOWN_AXE: { bug: string; rule: string; matches: (node: { html: string; target: string }) => boolean }[] = [
    // The search result lists (prescription, group editor pickers): role="listbox" without an accessible name
    {bug: "BUG-500", rule: "aria-input-field-name", matches: n => n.html.includes('role="listbox"')},
    // MUI Lists (<ul>) whose entries are ListItemButtons directly, not <li>: the sidebar (<a>), the clinic picker
    {bug: "BUG-501", rule: "list", matches: n => n.html.startsWith("<ul") && n.html.includes("MuiList-root")},
    // The login page's display-mode banner: white on the warning orange (#ed6c02), 3.1:1
    {bug: "BUG-502", rule: "color-contrast", matches: n => /OTP display mode|وضع عرض الكود/.test(n.html)},
    // The drug dialog's dosing preview while empty: "No dosing set" in text.disabled on #f5f5f5, 2.6:1
    {bug: "BUG-505", rule: "color-contrast", matches: n => /No dosing set|لا توجد جرعة محددة/.test(n.html)},
    // The staff editor's locked phone: its explanation (helper text) in the disabled grey, 2.7:1
    {bug: "BUG-506", rule: "color-contrast", matches: n => /The number can't be changed|لا يمكن تغيير الرقم/.test(n.html)},
];

export const expectHealthyPage = async (page: Page, lang: Lang, testInfo?: TestInfo, options: { ignoreKnownBugs?: boolean } = {}) => {
    const html = page.locator("html");
    await expect(html, "html lang").toHaveAttribute("lang", lang);
    await expect(html, "html dir").toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    // The page as the user reads it: loaded (no spinner or progress bar left)
    await expect(page.locator("[role=progressbar]:visible"), "the page finished loading").toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        {message: "no horizontal scroll"}).toBeLessThanOrEqual(0);

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
            const bug = options.ignoreKnownBugs === false ? undefined
                : KNOWN_AXE.find(k => k.rule === violation.id && k.matches({html: node.html, target}));
            if (bug) known.push(`${bug.bug}: ${line}`);
            else blocking.push(line);
        }
    }
    if (known.length && testInfo) await testInfo.attach("axe known bugs", {body: known.join("\n"), contentType: "text/plain"});
    expect(blocking, `axe: serious/critical violations on ${page.url()}`).toEqual([]);
};

/**
 * Console errors and uncaught exceptions of a page. The browser's own "Failed to load resource" lines for API
 * answers (a 403/404/409/429 the test asks for, or the API stopped on purpose) are not app errors: they are left out.
 */
export const watchConsole = (page: Page, errors: string[]) => {
    page.on("console", message => {
        if (message.type() !== "error") return;
        const text = message.text();
        const url = message.location().url ?? "";
        if (text.startsWith("Failed to load resource") && /\/api\/v1\//.test(url)) return;
        errors.push(`console.error on ${page.url()}: ${text} (${url})`);
    });
    page.on("pageerror", error => errors.push(`uncaught on ${page.url()}: ${error.message}`));
};
