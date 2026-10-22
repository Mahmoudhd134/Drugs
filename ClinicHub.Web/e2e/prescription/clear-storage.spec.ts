import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, readClipboard, markClipboard, rxDeleteDrug, rxDrug, rxProtocol, rxName, rxUpdateDrug, rxUpdateProtocol} from "../support/rx.ts";
import {dropDailySentence, RX_TEXTS} from "../support/texts-rx.ts";
import {expectToast, focusBack, recordRequests, toast} from "../support/ui.ts";

const NOTE = "رج الزجاجة قبل الاستعمال";

test.describe("Prescription: clear, undo and what the browser keeps @area:prescription", () => {
    test("«مسح الكل» empties the list with «تم مسح القائمة» and «تراجع»; «تراجع» brings back the same lines and closes the toast @RX-083 @RX-084 @smoke",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c] = await Promise.all(["Alpha", "Beta", "Gamma"].map((w, i) => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(i + 2, 1, "right")})));
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b, c]);
            await rx.saveNote(rx.line(1), NOTE);
            const dialog = await rx.editLine(rx.line(2));
            await dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true}).fill("6");
            await dialog.getByRole("button", {name: rt.save, exact: true}).click();
            await expect(dialog).toBeHidden();
            const lines = [[a.name, dropDailySentence(2, 1, "right")], [b.name, dropDailySentence(3, 1, "right"), NOTE], [c.name, dropDailySentence(6, 1, "right")]];
            await rx.expectLines(lines);

            await page.getByRole("button", {name: rt.clearAll}).click();
            await expect(rx.lines).toHaveCount(0);
            await expect(rx.count).toHaveText("0");
            await expect(page.getByText(rt.emptyTitle, {exact: true})).toBeVisible();
            const cleared = toast(page, rt.cleared);
            await expect(cleared).toBeVisible();
            const undo = cleared.getByRole("button", {name: rt.undo, exact: true});
            await expect(undo).toBeVisible();

            await undo.click();
            await rx.expectLines(lines);
            await expect(cleared).toHaveCount(0);
        });

    test("a reload, or the page closed and opened again, shows the same lines, order, dosings and notes @RX-088 @smoke",
        async ({page, lang, data, newTab}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b] = await Promise.all(["Alpha", "Beta"].map((w, i) => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(i + 2, 1, "left")})));
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b]);
            await rx.saveNote(rx.line(1), NOTE);
            await rx.line(0).getByRole("button", {name: rt.addOtherEye}).click();
            const lines = [[a.name, dropDailySentence(2, 1, "left")], [a.name, dropDailySentence(2, 1, "right")], [b.name, dropDailySentence(3, 1, "left"), NOTE]];
            await rx.expectLines(lines);

            await page.reload();
            await settled(page);
            await rx.expectLines(lines);

            const again = await newTab();
            await page.close();
            await again.goto("/");
            await settled(again);
            await new RxPage(again, rt).expectLines(lines);
        });

    test("a cleared list is still empty after a reload @RX-089", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.addAlone([a]);
        await page.getByRole("button", {name: rt.clearAll}).click();
        await expect(rx.lines).toHaveCount(0);

        await page.reload();
        await settled(page);
        await expect(page.getByText(rt.emptyTitle, {exact: true})).toBeVisible();
        await expect(rx.lines).toHaveCount(0);
        await expect(rx.count).toHaveText("0");
    });

    test("another browser of the same user does not see this browser's prescription @RX-091", async ({page, lang, data, newBrowser}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.addAlone([a]);
        await rx.expectLines([[a.name, dropDailySentence(4, 1)]]);

        const other = await newBrowser();
        await signIn(other.page, clinic.owner.phone);
        const otherRx = new RxPage(other.page, rt);
        await expect(other.page.getByText(rt.emptyTitle, {exact: true})).toBeVisible();
        await expect(otherRx.lines).toHaveCount(0);
        await expect(otherRx.count).toHaveText("0");
        await rx.expectLines([[a.name, dropDailySentence(4, 1)]]);
    });

    test("a drug renamed and given another default after it was added: its line keeps the old name and sentence; removed and added again, the new ones @RX-099 @RX-101",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a]);
            const renamed = rxName("Omega");
            await rxUpdateDrug(data, clinic, a, {name: renamed, dosing: dropDaily(2, 2, "left")});

            await page.reload();
            await settled(page);
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")]]);

            await rx.line(0).getByRole("button", {name: rt.remove}).click();
            await expect(rx.lines).toHaveCount(0);
            await rx.addAlone([{name: renamed}]);
            await rx.expectLines([[renamed, dropDailySentence(2, 2, "left")]]);
        });

    test("a drug deleted after it was added: its line stays and is still copied @RX-100", async ({page, context, lang, data}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.addAlone([a]);
        await rxDeleteDrug(data, clinic, a);

        await page.reload();
        await settled(page);
        await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")]]);
        await rx.openDrugsTab();
        // Gone from the tree: its name finds nothing
        await rx.tree.search(a.name);
        await expect(rx.catalog.getByText(rt.tree.noResults, {exact: true})).toBeVisible();
        await expect(rx.option(a.name)).toHaveCount(0);
        await markClipboard(page);
        await page.getByRole("button", {name: rt.quickCopy, exact: true}).click();
        await expectToast(page, rt.copied);
        expect((await readClipboard(page)).text).toBe(`${a.name}\n${dropDailySentence(4, 1, "right")}`);
    });

    test("a protocol and a drug changed elsewhere while the page is open: the protocol picker and the drug tree add the old version until they load again (a reload), not on focus @RX-102",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            const protocol = await rxProtocol(data, clinic, [{drug: a, dosing: {frequency: "daily", frequencyValue: 3}}]);
            // The page's clock, to make its data older than the 30 s after which a focus could reload it
            await page.clock.install();
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await expect(rx.option(protocol.name)).toBeVisible();
            // The tree shows B's row (its subcategory loaded) before the change
            await rx.openDrugsTab();
            await rx.tree.show(b.name);
            await rx.openProtocolsTab();

            // Another window changes them: the protocol's line, the drug's default
            const newProtocolName = rxName("Renamed");
            await rxUpdateProtocol(data, clinic, protocol, [{drug: a, dosing: {frequency: "daily", frequencyValue: 6}}], newProtocolName);
            await rxUpdateDrug(data, clinic, b, {dosing: dropDaily(5, 1)});
            // The lists' data is now stale (older than 30 s): a list that reloaded on focus would load the new versions
            await page.clock.fastForward("00:31");
            const reloads = recordRequests(page, "GET", /^\/api\/v1\/(drugs|drugs\/tree|protocols)$/);
            await focusBack(page);
            await page.waitForTimeout(1000);
            expect(reloads, "no reload on focus").toHaveLength(0);

            await rx.addProtocol(protocol.name);
            await rx.expectLines([[a.name, dropDailySentence(3, 1, "right")]]);
            // The tree kept its search and its open subcategory: B's row as loaded before, its old default
            await rx.openDrugsTab();
            await rx.tree.select(b.name);
            await rx.expectLines([[a.name, dropDailySentence(3, 1, "right")], [b.name, dropDailySentence(2, 1)]]);

            await page.getByRole("button", {name: rt.clearAll}).click();
            await expect(rx.lines).toHaveCount(0);
            await page.reload();
            await settled(page);
            await expect(rx.option(protocol.name)).toHaveCount(0);
            await rx.addProtocol(newProtocolName);
            await rx.expectLines([[a.name, dropDailySentence(6, 1, "right")]]);
            await rx.addAlone([b]);
            await rx.expectLines([[a.name, dropDailySentence(6, 1, "right")], [b.name, dropDailySentence(5, 1)]]);
        });
});
