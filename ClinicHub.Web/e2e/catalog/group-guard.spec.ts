import type {Dialog, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createGroup, dialog, getGroup, groupCard} from "../support/catalog.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {expectToast} from "../support/ui.ts";
import type {Texts} from "../support/texts.ts";
import type {Data} from "../support/data.ts";

/** The group editor's unsaved-changes guard (docs/features/drug-groups/business.md "تعديل أو حذف مجموعة"). */

const setUp = async (data: Data, page: Page) => {
    const clinic = await data.clinic();
    const drug = await createDrug(data, clinic, `Drug ${unique()}`);
    const group = await createGroup(data, clinic, `Guarded ${unique()}`, [{drug}]);
    await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
    return {clinic, group};
};

/** Changes the name like a person (typing: the page gets a user activation, which the browser's leave prompt needs). */
const change = async (page: Page, t: Texts, text: string) => {
    const name = page.getByRole("textbox", {name: t.groupName});
    await name.click();
    await name.press("End");
    await name.pressSequentially(text);
};

test.describe("The group editor's unsaved-changes guard @area:catalog", () => {
    for (const how of ["cancel", "back"] as const) {
        test(`with unsaved changes, «${how === "cancel" ? "إلغاء" : "رجوع"}» asks «تجاهل التغييرات؟» with «تجاهل» and «إلغاء»; «إلغاء» keeps the changes @GRP-087 @GRP-088${how === "cancel" ? "" : ""}`,
            async ({page, t, lang, data, healthy}) => {
                const ct = CATALOG_TEXTS[lang];
                const {group} = await setUp(data, page);
                await change(page, t, " changed");
                const leave = how === "cancel"
                    ? page.getByRole("button", {name: t.cancel, exact: true})
                    : page.getByRole("button", {name: t.back, exact: true});
                await leave.click();
                const question = dialog(page, ct.discardTitle);
                await expect(question).toBeVisible();
                await expect(question.locator(".MuiDialogContentText-root")).toHaveText(ct.discardMessage);
                await expect(question.getByRole("button")).toHaveText([t.cancel, ct.discard]);
                await healthy();

                await question.getByRole("button", {name: t.cancel, exact: true}).click();
                await expect(question).toHaveCount(0);
                await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
                await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(`${group.name} changed`);
            });
    }

    test("«تجاهل» goes back to the list and the group is unchanged @GRP-089", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const {clinic, group} = await setUp(data, page);
        await change(page, t, " changed");
        await page.getByRole("button", {name: t.cancel, exact: true}).click();
        await dialog(page, ct.discardTitle).getByRole("button", {name: ct.discard}).click();
        await expect(page).toHaveURL(/\/groups$/);
        await expect(groupCard(page, group.name)).toBeVisible();
        await expect(groupCard(page, `${group.name} changed`)).toHaveCount(0);
        expect((await getGroup(data, clinic, group.id)).name).toBe(group.name);
    });

    test("closing or reloading the tab with unsaved changes brings the browser's leave prompt; without changes it doesn't @GRP-093",
        async ({page, t, data}) => {
            const {group} = await setUp(data, page);
            const prompts: string[] = [];
            let answer: "accept" | "dismiss" = "accept";
            page.on("dialog", (d: Dialog) => {
                prompts.push(d.type());
                void (answer === "accept" ? d.accept() : d.dismiss());
            });

            // No changes: a reload leaves without asking
            await page.getByRole("textbox", {name: t.groupName}).click();
            await page.reload();
            await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(group.name);
            expect(prompts).toEqual([]);

            // Changes, then close the tab: asked; staying keeps the page and the changes
            await change(page, t, " changed");
            answer = "dismiss";
            await page.close({runBeforeUnload: true});
            await expect.poll(() => prompts).toEqual(["beforeunload"]);
            expect(page.isClosed()).toBe(false);
            await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(`${group.name} changed`);

            // Changes, then reload: asked; leaving drops the changes
            answer = "accept";
            await page.reload();
            expect(prompts).toEqual(["beforeunload", "beforeunload"]);
            await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(group.name);
        });

    test("after a successful save the editor leaves without the discard question @GRP-095", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const {group} = await setUp(data, page);
        const prompts: string[] = [];
        page.on("dialog", d => {
            prompts.push(d.type());
            void d.accept();
        });
        await change(page, t, " saved");
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.groupUpdated);
        await expect(page).toHaveURL(/\/groups$/);
        await expect(dialog(page, ct.discardTitle)).toHaveCount(0);
        await expect(groupCard(page, `${group.name} saved`)).toBeVisible();
        // Nothing unsaved is left: a reload doesn't ask either
        await page.reload();
        await expect(groupCard(page, `${group.name} saved`)).toBeVisible();
        expect(prompts).toEqual([]);
    });
});
