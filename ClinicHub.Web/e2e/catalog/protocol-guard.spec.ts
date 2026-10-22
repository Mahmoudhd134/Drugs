import type {Dialog, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createProtocol, dialog, getProtocol, protocolCard} from "../support/catalog.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {expectToast} from "../support/ui.ts";
import type {Texts} from "../support/texts.ts";
import type {Data} from "../support/data.ts";

/** The protocol editor's unsaved-changes guard (docs/features/protocols/business.md "تعديل أو حذف بروتوكول"). */

const setUp = async (data: Data, page: Page) => {
    const clinic = await data.clinic();
    const drug = await createDrug(data, clinic, `Drug ${unique()}`);
    const protocol = await createProtocol(data, clinic, `Guarded ${unique()}`, [{drug}]);
    await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
    return {clinic, protocol};
};

/** Changes the name like a person (typing: the page gets a user activation, which the browser's leave prompt needs). */
const change = async (page: Page, t: Texts, text: string) => {
    const name = page.getByRole("textbox", {name: t.protocolName});
    await name.click();
    await name.press("End");
    await name.pressSequentially(text);
};

test.describe("The protocol editor's unsaved-changes guard @area:catalog", () => {
    for (const how of ["cancel", "back"] as const) {
        test(`with unsaved changes, «${how === "cancel" ? "إلغاء" : "رجوع"}» asks «تجاهل التغييرات؟» with «تجاهل» and «إلغاء»; «إلغاء» keeps the changes @GRP-087 @GRP-088${how === "cancel" ? "" : ""}`,
            async ({page, t, lang, data, healthy}) => {
                const ct = CATALOG_TEXTS[lang];
                const {protocol} = await setUp(data, page);
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
                await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
                await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(`${protocol.name} changed`);
            });
    }

    test("«تجاهل» goes back to the list and the protocol is unchanged @GRP-089", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const {clinic, protocol} = await setUp(data, page);
        await change(page, t, " changed");
        await page.getByRole("button", {name: t.cancel, exact: true}).click();
        await dialog(page, ct.discardTitle).getByRole("button", {name: ct.discard}).click();
        await expect(page).toHaveURL(/\/protocols$/);
        await expect(protocolCard(page, protocol.name)).toBeVisible();
        await expect(protocolCard(page, `${protocol.name} changed`)).toHaveCount(0);
        expect((await getProtocol(data, clinic, protocol.id)).name).toBe(protocol.name);
    });

    test("closing or reloading the tab with unsaved changes brings the browser's leave prompt; without changes it doesn't @GRP-093",
        async ({page, t, data}) => {
            const {protocol} = await setUp(data, page);
            const prompts: string[] = [];
            let answer: "accept" | "dismiss" = "accept";
            page.on("dialog", (d: Dialog) => {
                prompts.push(d.type());
                void (answer === "accept" ? d.accept() : d.dismiss());
            });

            // No changes: a reload leaves without asking
            await page.getByRole("textbox", {name: t.protocolName}).click();
            await page.reload();
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
            expect(prompts).toEqual([]);

            // Changes, then close the tab: asked; staying keeps the page and the changes
            await change(page, t, " changed");
            answer = "dismiss";
            await page.close({runBeforeUnload: true});
            await expect.poll(() => prompts).toEqual(["beforeunload"]);
            expect(page.isClosed()).toBe(false);
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(`${protocol.name} changed`);

            // Changes, then reload: asked; leaving drops the changes
            answer = "accept";
            await page.reload();
            expect(prompts).toEqual(["beforeunload", "beforeunload"]);
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
        });

    test("after a successful save the editor leaves without the discard question @GRP-095", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const {protocol} = await setUp(data, page);
        const prompts: string[] = [];
        page.on("dialog", d => {
            prompts.push(d.type());
            void d.accept();
        });
        await change(page, t, " saved");
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolUpdated);
        await expect(page).toHaveURL(/\/protocols$/);
        await expect(dialog(page, ct.discardTitle)).toHaveCount(0);
        await expect(protocolCard(page, `${protocol.name} saved`)).toBeVisible();
        // Nothing unsaved is left: a reload doesn't ask either
        await page.reload();
        await expect(protocolCard(page, `${protocol.name} saved`)).toBeVisible();
        expect(prompts).toEqual([]);
    });
});
