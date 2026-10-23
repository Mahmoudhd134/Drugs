import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {choose, createProtocol, editorLines, fillNumber} from "../support/catalog.ts";
import {markClipboard, readClipboard, RxPage} from "../support/rx.ts";
import {CATALOG_TEXTS, SENTENCES} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {IMPORTED, ownDrugIn, sharedByName} from "../support/shared.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {expectToast} from "../support/ui.ts";

/**
 * Imported shared drugs in prescriptions and protocols (design M1.7 D3, D9): no default dosing and no description, so a
 * line shows a muted «لا توجد جرعة محددة» on screen only, and the copied text is the name alone unless the line is
 * edited. The imported drugs are only read (design D12).
 */

/** Adds a drug from the Drugs tab's tree after searching its exact name (the imported catalog is far longer than a page). */
const addShared = async (rx: RxPage, name: string) => {
    await rx.openDrugsTab();
    await rx.addDrug(name);
    await expect(rx.linesOf(name)).toHaveCount(1);
};

test.describe("Prescription: shared drugs @area:prescription", () => {
    test.beforeEach(async ({context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("an imported drug added alone: the name and a muted «لا توجد جرعة محددة»; copied, the name alone; ✎ opens with every field empty @CAT-169 @RX-107",
        async ({page, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await addShared(rx, IMPORTED.nailner);
            const line = rx.linesOf(IMPORTED.nailner);
            await expect(line.getByText(st.noDosing, {exact: true})).toBeVisible();
            await healthy();

            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            const copied = await readClipboard(page);
            expect(copied.text).toBe(IMPORTED.nailner);
            expect(copied.html).not.toContain(st.noDosing);

            const dialog = await rx.editLine(line);
            await expect(dialog.getByRole("spinbutton", {name: rt.amount, exact: true})).toHaveValue("");
            for (const eye of [rt.eyeRight, rt.eyeLeft, rt.eyeBoth]) {
                await expect(dialog.getByRole("button", {name: eye, exact: true})).toHaveAttribute("aria-pressed", "false");
            }
            await expect(dialog.getByRole("textbox", {name: rt.lineNote})).toHaveValue("");
            await dialog.getByRole("button", {name: rt.cancel, exact: true}).click();
            await expect(dialog).toBeHidden();
        });

    test("an imported drug with no edit: the copied text is its full name, nothing invented @RX-107", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await addShared(rx, IMPORTED.vigamox);
        await markClipboard(page);
        await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
        await expectToast(page, rt.copied);
        const copied = await readClipboard(page);
        expect(copied.text).toBe(IMPORTED.vigamox);
        expect(copied.html).toContain(`<strong dir="ltr">${IMPORTED.vigamox}</strong>`);
    });

    test("a shared drug's line edited to «نقطة في العين اليمنى 4 مرات يوميًا», then copied: the Arabic sentence as for own drugs @RX-108",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await addShared(rx, IMPORTED.vigamox);
            const dialog = await rx.editLine(rx.linesOf(IMPORTED.vigamox));
            await fillNumber(dialog, ct.dose, 1);
            await choose(page, dialog, ct.unit, ct.units.drop);
            await dialog.getByRole("button", {name: ct.eyes.right, exact: true}).click();
            await choose(page, dialog, ct.frequency, ct.frequencies.daily);
            await fillNumber(dialog, ct.timesPerDay, 4);
            await dialog.getByRole("button", {name: rt.save, exact: true}).click();
            await expect(dialog).toBeHidden();
            await rx.expectLines([[IMPORTED.vigamox, SENTENCES.dropRight4x]]);

            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            expect((await readClipboard(page)).text).toBe(`${IMPORTED.vigamox}\n${SENTENCES.dropRight4x}`);
        });

    test("a shared drug's protocol line with no override: «لا توجد جرعة محددة» in the editor, never a made-up dosing; added to a prescription, the same @CAT-170",
        async ({page, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const vigamox = await sharedByName(await data.ownerApi(clinic), IMPORTED.vigamox);
            const own = await ownDrugIn(data, clinic, {name: `Own ${unique()}`});
            const protocol = await createProtocol(data, clinic, `Shared line ${unique()}`, [{drug: vigamox}, {drug: own}]);
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            await expect(lines.nth(0)).toContainText(IMPORTED.vigamox);
            await expect(lines.nth(0).getByText(st.noDosing, {exact: true})).toBeVisible();
            await expect(lines.nth(0), "no made-up dosing sentence").not.toContainText(/مرات|يوميًا|نقطة|قرص/);
            await healthy();

            await page.goto("/");
            const rx = new RxPage(page, rt);
            await rx.openProtocolsTab();
            await rx.search("protocols").fill(protocol.name);
            await rx.addProtocol(protocol.name);
            await expect(rx.linesOf(IMPORTED.vigamox)).toHaveCount(1);
            await expect(rx.linesOf(IMPORTED.vigamox).getByText(st.noDosing, {exact: true})).toBeVisible();
            await expect(rx.linesOf(IMPORTED.vigamox), "no made-up dosing sentence").not.toContainText(/مرات|يوميًا|نقطة|قرص/);
        });
});
