import type {Page} from "@playwright/test";
import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {sidebarEntries} from "../support/ui.ts";
import {dialog, pageChecks, tourClinic, tourPages} from "../support/ux.ts";

/**
 * Groups renamed to protocols (design M1.7 D10, "Texts"): on every screen no «مجموعة» / «المجموعات» is left, nor
 * "group" in English (the clinic's own names here hold neither). Both patterns are checked in both UI languages: the
 * prescription text is Arabic in the English UI too.
 */
const LEFTOVER = /مجموع|group/i;

/** The text a user sees now (the open dialog included) and the page title: no leftover of the old name. */
const expectNoGroupWord = async (page: Page, what: string) => {
    const shown = await page.locator("body").innerText();
    expect(shown.match(LEFTOVER)?.[0], `${what}: «${shown.match(new RegExp(`.{0,30}(?:${LEFTOVER.source}).{0,30}`, "i"))?.[0]}»`).toBeUndefined();
    expect(await page.title(), `${what}: the page title`).not.toMatch(LEFTOVER);
};

test.describe("No «مجموعة» or \"group\" left on the screens @area:i18n", () => {
    test("the sidebar, the protocols list and its delete question, the editor and its dialogs, the prescription tabs and dialogs @GRP-102",
        async ({page, t, data}) => {
            test.slow();
            const tour = await tourClinic(data);
            await signIn(page, tour.clinic.owner.phone);

            const entries = await sidebarEntries(page, t);
            expect(entries).toContain(t.navProtocols);
            expect(entries.join(" | ")).not.toMatch(LEFTOVER);
            await expectNoGroupWord(page, "prescription page with the sidebar");
            await expect(page.getByRole("tab", {name: t.rxTabProtocols})).toBeVisible();

            await tourPages(page, tour, async what => {
                await expectNoGroupWord(page, what);
                if (what === "protocols list") await expect(page.getByRole("heading", {level: 1, name: t.protocolsTitle})).toBeVisible();
            });
            await pageChecks(page, "prescription with lines");
        });

    test("the role editor's catalog permissions @GRP-102", async ({page, t, data}) => {
        const clinic = await data.clinic();
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
        await page.getByRole("button", {name: t.newRole}).click();
        const editor = dialog(page);
        await expect(editor.getByRole("checkbox", {name: new RegExp(`^${t.permissionLabel["protocols.list"]}`)})).toBeVisible();
        await expectNoGroupWord(page, "role editor");
        await pageChecks(page, "role editor");
    });
});
