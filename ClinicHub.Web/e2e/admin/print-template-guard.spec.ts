import type {Dialog, Page} from "@playwright/test";
import {expect, settled, signInSuperAdmin, test} from "../support/fixtures.ts";
import {designerOf, designerShown, inlineStyle, layoutL, putTemplate, tabPath, typeInto, type Designer} from "../support/print-template.ts";
import {expectToast, navTo, openAccountMenu} from "../support/ui.ts";
import type {Texts} from "../support/texts.ts";

/** The designer's unsaved-changes guard, in the real app: contract § 3.8, business.md «التغييرات غير المحفوظة في المصمم». */

/** Selects the manual input and changes its X to 20, like a person. */
const edit = async (designer: Designer) => {
    await designer.box("m").click();
    await typeInto(designer.field(designer.pt.x), "20");
    await expect.poll(() => inlineStyle(designer.box("m"), "left")).toBe("20mm");
};

const expectEditKept = async (page: Page, designer: Designer, url: string) => {
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(designer.field(designer.pt.x)).toHaveValue("20");
    expect(await inlineStyle(designer.box("m"), "left")).toBe("20mm");
};

const stay = async (designer: Designer, t: Texts) => {
    await expect(designer.question).toBeVisible();
    await designer.question.getByRole("button", {name: t.cancel, exact: true}).click();
    await expect(designer.question).toHaveCount(0);
};

const leave = async (designer: Designer) => {
    await expect(designer.question).toBeVisible();
    await designer.question.getByRole("button", {name: designer.pt.leave, exact: true}).click();
    await expect(designer.question).toHaveCount(0);
};

/** A POP like the browser's buttons, without Playwright waiting for a navigation the router may undo. */
const browserBack = (page: Page) => page.evaluate(() => history.back());
const browserForward = (page: Page) => page.evaluate(() => history.forward());

test.describe("Print template: unsaved changes @area:admin", () => {
    const EXITS: [string, (page: Page, t: Texts, designer: Designer) => Promise<void>, RegExp][] = [
        ["the header's Back", (page, t) => page.getByRole("button", {name: t.back, exact: true}).click(), /\/admin$/],
        ["another clinic tab", (page, t) => page.getByRole("tab", {name: t.tabOverview, exact: true}).click(), /\/admin\/clinics\/\d+$/],
        ["a sidebar entry", (page, t, designer) => navTo(page, t, designer.pt.navClinics), /\/admin$/],
        ["the logo", (page, _t, designer) => page.getByRole("link", {name: designer.pt.home, exact: true}).click(), /\/admin$/],
    ];

    for (const [name, press, target] of EXITS) {
        test(`${name}: the question asks; staying keeps the edits; leaving drops them @TPL-232`,
            async ({page, data, lang, t, isMobile, healthy}) => {
                test.skip(isMobile, "the designer is for a computer");
                const clinic = await data.clinic();
                await putTemplate(data, clinic, layoutL());
                const designer = designerOf(page, lang);
                await signInSuperAdmin(page, tabPath(clinic));
                await designerShown(designer);
                await edit(designer);

                await press(page, t, designer);
                await expect(designer.question).toBeVisible();
                await expect(designer.question.getByRole("button")).toHaveText([t.cancel, designer.pt.leave]);
                await expect(designer.question.getByRole("button", {name: t.cancel, exact: true})).toBeFocused();
                await healthy();
                await stay(designer, t);
                await expectEditKept(page, designer, tabPath(clinic));

                await press(page, t, designer);
                await leave(designer);
                await expect(page).toHaveURL(target);

                // The edit is gone: the saved template shows
                await page.goto(tabPath(clinic));
                await settled(page);
                await designerShown(designer);
                expect(await inlineStyle(designer.box("m"), "left")).toBe("58mm");
            });
    }

    test("closing or reloading the page brings the browser's prompt; without changes, or after a save, it doesn't @TPL-232",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            const prompts: string[] = [];
            let answer: "accept" | "dismiss" = "accept";
            page.on("dialog", (dialog: Dialog) => {
                prompts.push(dialog.type());
                void (answer === "accept" ? dialog.accept() : dialog.dismiss());
            });
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            // No changes: a reload leaves without asking
            await designer.box("m").click();
            await page.reload();
            await designerShown(designer);
            expect(prompts).toEqual([]);

            // Changes, then close: asked; staying keeps the page and the changes
            await edit(designer);
            answer = "dismiss";
            await page.close({runBeforeUnload: true});
            await expect.poll(() => prompts).toEqual(["beforeunload"]);
            expect(page.isClosed()).toBe(false);
            await expect(designer.field(designer.pt.x)).toHaveValue("20");

            // Changes, then reload: asked; leaving drops them
            answer = "accept";
            await page.reload();
            expect(prompts).toEqual(["beforeunload", "beforeunload"]);
            await designerShown(designer);
            expect(await inlineStyle(designer.box("m"), "left")).toBe("58mm");

            // Saved: nothing asks
            await edit(designer);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, designer.pt.saved);
            await page.reload();
            await designerShown(designer);
            expect(prompts).toEqual(["beforeunload", "beforeunload"]);
            expect(await inlineStyle(designer.box("m"), "left")).toBe("20mm");
        });

    test("the browser's Back: the question asks; staying keeps the URL, the screen and the edits; leaving goes back @TPL-247",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, `/admin?search=${encodeURIComponent(clinic.name)}`);
            await page.getByRole("link", {name: clinic.name, exact: true}).click();
            await expect(page).toHaveURL(new RegExp(`/admin/clinics/${clinic.id}$`));
            await page.getByRole("tab", {name: designer.pt.tab, exact: true}).click();
            await designerShown(designer);
            await edit(designer);

            await browserBack(page);
            await stay(designer, t);
            await expectEditKept(page, designer, tabPath(clinic));

            await browserBack(page);
            await leave(designer);
            await expect(page).toHaveURL(/\/admin\?search=/);
            await expect(designer.sheet).toHaveCount(0);
        });

    test("the browser's Forward: the same question; staying keeps the URL, the screen and the edits @TPL-247",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            // A place to go Forward to: nothing unsaved yet, so nothing asks
            await page.getByRole("button", {name: t.back, exact: true}).click();
            await expect(page).toHaveURL(/\/admin$/);
            await browserBack(page);
            await expect(page).toHaveURL(new RegExp(`${tabPath(clinic)}$`));
            await designerShown(designer);
            await edit(designer);

            await browserForward(page);
            await stay(designer, t);
            await expectEditKept(page, designer, tabPath(clinic));

            await browserForward(page);
            await leave(designer);
            await expect(page).toHaveURL(/\/admin$/);
        });

    test("switching clinic from the user menu: the question first; staying keeps the edits; leaving opens the picker @TPL-248",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await edit(designer);

            await openAccountMenu(page, t);
            await page.getByRole("menuitem", {name: t.switchContext}).click();
            await stay(designer, t);
            await expectEditKept(page, designer, tabPath(clinic));

            await openAccountMenu(page, t);
            await page.getByRole("menuitem", {name: t.switchContext}).click();
            await leave(designer);
            await expect(page).toHaveURL(/\/select-clinic$/);
        });

    test("logging out from the user menu: the question first; staying doesn't log out; leaving does, with no second question @TPL-248",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await edit(designer);

            await openAccountMenu(page, t);
            await page.getByRole("menuitem", {name: t.logout}).click();
            await stay(designer, t);
            await expectEditKept(page, designer, tabPath(clinic));
            // Still logged in: the page reads through the session
            await expect(page.getByRole("button", {name: t.account})).toBeVisible();

            await openAccountMenu(page, t);
            await page.getByRole("menuitem", {name: t.logout}).click();
            await leave(designer);
            await expect(page).toHaveURL(/\/login$/);
            await expect(page.getByRole("button", {name: t.sendCode})).toBeVisible();
            await expect(designer.question).toHaveCount(0);
        });

    test("«تعديل العيادة النموذجية»: the question first; staying doesn't switch; leaving opens the template clinic's drugs, with no second question @TPL-248",
        async ({page, data, lang, t, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await edit(designer);

            await page.getByRole("button", {name: t.editTemplate}).click();
            await stay(designer, t);
            await expectEditKept(page, designer, tabPath(clinic));

            await page.getByRole("button", {name: t.editTemplate}).click();
            await leave(designer);
            await expect(page).toHaveURL(/\/drugs/);
            await expect(designer.question).toHaveCount(0);
        });
});
