import type {Page} from "@playwright/test";
import {addToProtocol, createDrug, createProtocol, deleteProtocol, search} from "../support/catalog.ts";
import type {ClinicHandle, Data} from "../support/data.ts";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {expectToast, sidebarEntries} from "../support/ui.ts";
import {dialog, open, pageChecks, rxTab, tourClinic, tourPages} from "../support/ux.ts";

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

/** Deletes every protocol of the clinic (a new clinic starts with a copy of the template's), through the API. */
const withoutProtocols = async (data: Data, clinic: ClinicHandle) => {
    const api = await data.ownerApi(clinic);
    for (;;) {
        const {items} = await api.ok<{ items: { id: number }[] }>("GET", "/api/v1/protocols?pageSize=50");
        if (items.length === 0) return;
        for (const protocol of items) await deleteProtocol(data, clinic, protocol);
    }
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
    test("the protocol editor's save toasts: an edited protocol «تم تحديث البروتوكول», a new one «تم إنشاء البروتوكول» @GRP-102",
        async ({page, t, lang, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Tobradex ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Before ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);

            await page.getByRole("textbox", {name: t.protocolName}).fill(`After ${unique()}`);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.protocolUpdated);
            await expectNoGroupWord(page, "protocol updated toast");

            await page.getByRole("link", {name: t.newProtocol}).click();
            await expect(page).toHaveURL(/\/protocols\/new$/);
            await page.getByRole("textbox", {name: t.protocolName}).fill(`New ${unique()}`);
            await addToProtocol(page, lang, drug.name);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.protocolCreated);
            await expectNoGroupWord(page, "protocol created toast");
            await pageChecks(page, "protocols list after the created toast");
        });

    test("the protocols list's no-results and empty states, the prescription's Protocols tab in a clinic without protocols @GRP-102",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            await withoutProtocols(data, clinic);
            const drug = await createDrug(data, clinic, `Tobradex ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Only ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/protocols");

            await search(page, page.getByPlaceholder(t.searchProtocols).filter({visible: true}), `missing ${unique()}`);
            await expect(page.getByText(ct.protocolsNoResults, {exact: true})).toBeVisible();
            await expectNoGroupWord(page, "protocols list without search results");
            await pageChecks(page, "protocols list without search results");

            await deleteProtocol(data, clinic, protocol);
            await open(page, "/protocols");
            await expect(page.getByText(ct.protocolsEmptyTitle, {exact: true})).toBeVisible();
            await expectNoGroupWord(page, "empty protocols list");
            await pageChecks(page, "empty protocols list");

            await open(page, "/");
            await rxTab(page, t, "protocols");
            await expect(page.getByText(ct.protocolsPickerEmpty, {exact: true}).filter({visible: true})).toBeVisible();
            await settled(page);
            await expectNoGroupWord(page, "prescription's empty Protocols tab");
            await pageChecks(page, "prescription's empty Protocols tab");
        });
});
