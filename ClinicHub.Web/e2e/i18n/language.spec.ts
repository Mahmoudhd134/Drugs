import type {Page} from "@playwright/test";
import {expect, loginViaUi, signIn, test} from "../support/fixtures.ts";
import {type Lang, TEXTS} from "../support/texts.ts";
import {LANGUAGE_NAMES, UX_TEXTS} from "../support/texts-ux.ts";
import {chooseLanguage, open, pageChecks, setLanguage} from "../support/ux.ts";
import {expectContextLabel} from "../support/ui.ts";

/** `<html lang>` / `<html dir>` and a few texts of the prescription page are in `lang`. */
const expectUiIn = async (page: Page, lang: Lang) => {
    const t = TEXTS[lang];
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", {level: 1, name: UX_TEXTS[lang].rxTitle})).toBeVisible();
    await expect(page.getByRole("tab", {name: t.rxTabGroups})).toBeVisible();
    await expect(page.getByRole("button", {name: UX_TEXTS[lang].language})).toHaveText(LANGUAGE_NAMES[lang]);
};

/** The language menu marks the current language with a check (its only icon), and only that one. */
const expectMenuCheck = async (page: Page, lang: Lang) => {
    await page.getByRole("button", {name: UX_TEXTS[lang].language}).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    for (const other of ["ar", "en"] as Lang[]) {
        await expect(menu.getByRole("menuitem", {name: LANGUAGE_NAMES[other]}).locator("svg"),
            `check on ${other}`).toHaveCount(other === lang ? 1 : 0);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
};

test.describe("Choosing the UI language @area:i18n", () => {
    test("from English, «العربية» in the top bar's menu switches the whole UI to Arabic at once (no reload), with a check on it; and back @I18N-001 @I18N-003 @smoke",
        async ({page, data}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            await expectContextLabel(page, clinic.name);
            await setLanguage(page, "en");
            await expectUiIn(page, "en");
            await expectMenuCheck(page, "en");
            await pageChecks(page, "English");

            // A marker on the window: a reload would drop it
            await page.evaluate(() => Object.assign(window, {__noReload: true}));
            await chooseLanguage(page, "ar");
            await expectUiIn(page, "ar");
            expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload), "no reload").toBe(true);
            await expectMenuCheck(page, "ar");
            await expectContextLabel(page, clinic.name);
            await pageChecks(page, "Arabic");

            await chooseLanguage(page, "en");
            await expectUiIn(page, "en");
            expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload), "no reload").toBe(true);
            await pageChecks(page, "English again");
        });

    test("Arabic chosen: it stays after a reload and in a new tab (localStorage language = ar) @I18N-002 @I18N-003",
        async ({page, data, newTab}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            await setLanguage(page, "en");
            await chooseLanguage(page, "ar");
            expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("ar");

            await page.reload();
            await expectUiIn(page, "ar");
            await pageChecks(page, "after a reload");

            const tab = await newTab();
            await open(tab, "/drugs");
            await expect(tab.locator("html")).toHaveAttribute("lang", "ar");
            await expect(tab.locator("html")).toHaveAttribute("dir", "rtl");
            await expect(tab.getByRole("heading", {level: 1, name: TEXTS.ar.drugsTitle})).toBeVisible();
            await pageChecks(tab, "new tab");
            await tab.close();
        });

    test("English chosen: it stays after a reload, html lang=en dir=ltr @I18N-002 @I18N-003", async ({page, data}) => {
        const clinic = await data.clinic();
        await signIn(page, clinic.owner.phone);
        await setLanguage(page, "ar");
        await chooseLanguage(page, "en");
        expect(await page.evaluate(() => localStorage.getItem("language"))).toBe("en");
        await page.reload();
        await expectUiIn(page, "en");
    });

    test("the login page's language menu works before login, and the choice is kept after login @I18N-004",
        async ({page, data, lang}) => {
            const clinic = await data.clinic();
            const other: Lang = lang === "ar" ? "en" : "ar";
            await open(page, "/login");
            await expect(page.locator("html")).toHaveAttribute("lang", lang);
            await chooseLanguage(page, other);
            const t = TEXTS[other];
            await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
            await expect(page.getByRole("button", {name: t.sendCode})).toBeVisible();
            await expect(page.locator("html")).toHaveAttribute("dir", other === "ar" ? "rtl" : "ltr");

            await loginViaUi(page, t, clinic.owner.phone, page.url());
            await expectContextLabel(page, clinic.name);
            await expectUiIn(page, other);
            expect(await page.evaluate(() => localStorage.getItem("language"))).toBe(other);
            await pageChecks(page, "after login");
        });
});
