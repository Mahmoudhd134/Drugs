import type {Locator, Page} from "@playwright/test";
import {expect, settled, signInSuperAdmin, test} from "../support/fixtures.ts";
import type {ClinicHandle, Data} from "../support/data.ts";
import {localPhone, uniqueDigits, uniquePhone} from "../support/phones.ts";
import {type Lang, TEXTS, type Texts} from "../support/texts.ts";
import {expectToast, toast} from "../support/ui.ts";
import {visitCatalogAdmin} from "../support/admin-catalog.ts";

/** Each admin page and dialog of a clinic, in turn: `check` runs on each one. */
const visitAdmin = async (page: Page, t: Texts, clinic: ClinicHandle, staffName: string, check: (what: string) => Promise<void>) => {
    await page.goto(`/admin?search=${encodeURIComponent(clinic.name.split(" ")[1])}`);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await check("clinics list");
    await page.goto("/admin/clinics/new");
    await expect(page.getByRole("textbox", {name: t.clinicName})).toBeVisible();
    await check("create page");

    await page.goto(`/admin/clinics/${clinic.id}`);
    await expect(page.getByRole("button", {name: t.rename})).toBeVisible();
    await check("overview");
    await page.getByRole("button", {name: t.rename}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("rename dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", {name: t.disable}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("disable confirm");
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", {name: t.deleteClinic}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("delete dialog");
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("tab", {name: t.tabRoles}).click();
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await check("roles tab");
    await page.getByRole("button", {name: t.newRole}).click();
    await expect(page.getByRole("dialog").getByRole("checkbox").first()).toBeVisible();
    await check("role editor");
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("tab", {name: t.tabStaff}).click();
    await expect(page.locator("tbody tr").filter({hasText: staffName})).toBeVisible();
    await check("staff tab");
    await page.getByRole("button", {name: t.addStaff}).click();
    await expect(page.getByRole("dialog").getByRole("checkbox").first()).toBeVisible();
    await check("staff editor");
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
};

/** A clinic named in Arabic only, with an Arabic-named staff member and role (no Latin letter in the data but the default role names). */
const arabicClinic = async (data: Data, name: string) => {
    const clinic = await data.clinic({name, ownerName: `مالك ${uniqueDigits()}`});
    await data.role(clinic, ["drugs.list"], `دور ${uniqueDigits()}`);
    const staff = await data.staff(clinic, {fullName: `موظف ${uniqueDigits()}`});
    return {clinic, staff};
};

const fitsTheScreen = async (page: Page, box: Locator, what: string) => {
    const width = page.viewportSize()!.width;
    for (const element of await box.all()) {
        const rect = await element.boundingBox();
        if (!rect) continue;
        expect(rect.x, `${what} starts on screen`).toBeGreaterThanOrEqual(-1);
        expect(rect.x + rect.width, `${what} ends on screen`).toBeLessThanOrEqual(width + 1);
    }
};

/**
 * An open dialog's text is wrapped, not cut: no element inside it (the paper, its title, its content…) is wider inside
 * than its box (a paper scrolls sideways when a line doesn't wrap, while the box itself still fits the screen). Inputs
 * are left out (a long name scrolls inside its field), and so is MUI's notched-outline legend (a visually hidden copy of
 * a field's label). With `name`, the name's text (where the dialog shows it) spans
 * more than one line.
 */
const dialogWraps = async (page: Page, what: string, name?: string) => {
    const dialog = page.getByRole("dialog");
    expect(await dialog.count(), `${what}: a dialog is open`).toBeGreaterThan(0);
    const result = await dialog.evaluate((root, wanted) => {
        const overflowing = [root, ...root.querySelectorAll("*")]
            .filter(e => !e.matches("input, textarea") && !e.closest("fieldset legend") && e.scrollWidth > e.clientWidth + 1)
            .map(e => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")}: ${e.scrollWidth} px in ${e.clientWidth} px`);
        let lines = 0;
        if (wanted) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const index = (node.textContent ?? "").indexOf(wanted);
                if (index < 0) continue;
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + wanted.length);
                lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
                break;
            }
        }
        return {overflowing, lines};
    }, name ?? null);
    expect(result.overflowing, `${what}: the dialog's text wraps (nothing wider than its box)`).toEqual([]);
    if (name) expect(result.lines, `${what}: the name is shown on several lines`).toBeGreaterThan(1);
};

const noHorizontalScroll = async (page: Page, what: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        {message: `${what}: no horizontal scroll`}).toBeLessThanOrEqual(0);
};

test.describe("Platform admin in Arabic and on a phone @area:admin", () => {
    test("Arabic UI: every admin page and dialog (the shared drugs and categories too) is RTL in Arabic, with no English UI string, and phones stay LTR @ADM-282",
        async ({page, t, lang, data, healthy}) => {
            // Many pages, scans or clinics: three times the usual time
            test.slow();
            test.skip(lang !== "ar", "the Arabic UI");
            const {clinic, staff} = await arabicClinic(data, `عيادة الشفاء ${uniqueDigits()}`);
            await signInSuperAdmin(page);

            await visitAdmin(page, t, clinic, staff.fullName, async what => {
                await test.step(what, async () => {
                    await healthy();
                    // Role names are clinic data (Doctor, Assistant stay as stored): the rest is Arabic
                    const text = await page.evaluate(() => document.body.innerText);
                    const latin = text.replace(/\b(Doctor|Assistant)\b/g, "").match(/[A-Za-z]+/g) ?? [];
                    expect(latin, `${what}: English UI strings`).toEqual([]);
                });
            });
            // The shared catalog screens (M1.7b): drug names and ingredients are catalog data (English), the rest Arabic
            await visitCatalogAdmin(page, t, "ar", async (what, shownData) => {
                await test.step(what, async () => {
                    await healthy();
                    let text = await page.evaluate(() => document.body.innerText);
                    for (const piece of [...shownData].sort((x, y) => y.length - x.length)) text = text.split(piece).join(" ");
                    const latin = text.match(/[A-Za-z]+/g) ?? [];
                    expect(latin, `${what}: English UI strings`).toEqual([]);
                });
            });

            // Phones left to right: the Overview's owner, the staff list
            await page.goto(`/admin/clinics/${clinic.id}`);
            await expect(page.getByText(clinic.owner.phone, {exact: true})).toHaveAttribute("dir", "ltr");
            await page.goto(`/admin/clinics/${clinic.id}/staff`);
            const phone = page.getByText(staff.phone, {exact: true}).filter({visible: true}).first();
            await expect(phone).toBeVisible();
            expect(await phone.evaluate(e => getComputedStyle(e).direction)).toBe("ltr");
        });

    test("a 375 px phone in both languages: no horizontal scroll on the admin pages and dialogs (the shared drugs and categories too); a 157-character name wraps in dialogs and toasts @ADM-283",
        async ({page, data, isMobile}) => {
            // Many pages, scans or clinics: three times the usual time
            test.slow();
            test.skip(!isMobile, "the phone project");
            const long = `عيادة ${uniqueDigits()} ${"الشفاء".repeat(10)} ${"د".repeat(40)} `;
            const name = long.padEnd(157, "ن").slice(0, 157);
            expect([...name]).toHaveLength(157);
            const {clinic, staff} = await arabicClinic(data, name);
            await signInSuperAdmin(page);

            for (const lang of ["ar", "en"] as Lang[]) {
                await test.step(lang, async () => {
                    const t = TEXTS[lang];
                    await page.evaluate(l => localStorage.setItem("language", l), lang);
                    await page.goto("/admin");
                    await expect(page.locator("html")).toHaveAttribute("lang", lang);
                    // The session restored (its refresh answered) before the next page load
                    await settled(page);
                    await visitAdmin(page, t, clinic, staff.fullName, async what => {
                        await noHorizontalScroll(page, `${lang} ${what}`);
                        await fitsTheScreen(page, page.getByRole("dialog"), `${lang} ${what} dialog`);
                        // The disable and delete confirmations show the name in their text (the rename dialog in its field)
                        const showsName = what === "disable confirm" || what === "delete dialog";
                        // The pages have no dialog open: only the dialogs' own checks must find one
                        if (/dialog|confirm|editor/.test(what)) await dialogWraps(page, `${lang} ${what}`, showsName ? name.trim() : undefined);
                    });
                    // The shared catalog screens (M1.7b) and their dialogs
                    await visitCatalogAdmin(page, t, lang, async what => {
                        await noHorizontalScroll(page, `${lang} ${what}`);
                        await fitsTheScreen(page, page.getByRole("dialog"), `${lang} ${what} dialog`);
                        if (/dialog|confirmation/.test(what)) await dialogWraps(page, `${lang} ${what}`);
                    });

                    // Toasts with the long name: created, then deleted
                    await page.goto("/admin/clinics/new");
                    await page.getByRole("textbox", {name: t.clinicName}).fill(name);
                    await page.getByRole("textbox", {name: t.ownerPhone}).fill(localPhone(uniquePhone()));
                    await page.getByRole("textbox", {name: t.ownerName}).fill(`مالك ${uniqueDigits()}`);
                    await page.getByRole("button", {name: t.createClinic}).click();
                    await expectToast(page, t.clinicCreated(name));
                    await fitsTheScreen(page, toast(page, t.clinicCreated(name)), `${lang} created toast`);
                    await noHorizontalScroll(page, `${lang} created toast`);
                    // The tall toast covers the page's top on a phone until it goes (a pointer over it pauses it)
                    await page.mouse.move(5, page.viewportSize()!.height - 5);
                    await expect(toast(page, t.clinicCreated(name))).toBeHidden({timeout: 15_000});
                    await page.getByRole("button", {name: t.deleteClinic}).click();
                    const dialog = page.getByRole("dialog");
                    await dialog.getByRole("textbox", {name: t.clinicName}).fill(name);
                    await dialog.getByRole("button", {name: t.deleteClinic}).click();
                    await expectToast(page, t.clinicDeleted(name));
                    await fitsTheScreen(page, toast(page, t.clinicDeleted(name)), `${lang} deleted toast`);
                    await noHorizontalScroll(page, `${lang} deleted toast`);
                });
            }
        });
});
