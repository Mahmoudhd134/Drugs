import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createDrugs, createProtocol, dialog, drugRow, protocolCard, protocolCards, option} from "../support/catalog.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {expectToast, navTo} from "../support/ui.ts";
import {expectHealthyPage} from "../support/checks.ts";
import {type Lang, TEXTS} from "../support/texts.ts";
import {setLanguage} from "../support/ux.ts";

/** The groups page: cards, search, open, delete; the prescription's group search (docs/features/drug-groups). */
test.describe("The groups list @area:catalog", () => {
    test("cards show the name, «الأدوية: N» and the first 4 drugs; 6 drugs also show «+2 أخرى» @GRP-036",
        async ({page, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drugs = await createDrugs(data, clinic, ["F", "E", "D", "C", "B", "A"].map(l => `${l} drug ${u}`));
            const big = await createProtocol(data, clinic, `Six ${u}`, drugs.map(drug => ({drug})));
            const small = await createProtocol(data, clinic, `Two ${u}`, drugs.slice(0, 2).map(drug => ({drug})));
            await signIn(page, clinic.owner.phone, "asIs", "/groups");

            const card = protocolCard(page, big.name);
            await expect(card.getByText(ct.drugCount(6), {exact: true})).toBeVisible();
            // The group's order (not the names' order)
            await expect(card.locator("ol li")).toHaveText(drugs.slice(0, 4).map(d => d.name));
            await expect(card.getByText(ct.moreDrugs(2), {exact: true})).toBeVisible();

            const smallCard = protocolCard(page, small.name);
            await expect(smallCard.getByText(ct.drugCount(2), {exact: true})).toBeVisible();
            await expect(smallCard.locator("ol li")).toHaveText(drugs.slice(0, 2).map(d => d.name));
            await expect(smallCard.getByText(/^\+/)).toHaveCount(0);
            await healthy();
        });

    test("searching part of a name shows only the matching groups on page 1; no match says «لا توجد مجموعات مطابقة للبحث.» @GRP-038",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${u}`);
            // 13 "Alpha" + 12 "Beta" + the template's group = 26 groups: 3 pages of 12
            const names = [
                ...Array.from({length: 13}, (_, i) => `Alpha ${u} ${String(i).padStart(2, "0")}`),
                ...Array.from({length: 12}, (_, i) => `Beta ${u} ${String(i).padStart(2, "0")}`),
            ];
            for (let i = 0; i < names.length; i += 8) { // (createDrug logged the owner in once)
                await Promise.all(names.slice(i, i + 8).map(n => createProtocol(data, clinic, n, [{drug}])));
            }
            await signIn(page, clinic.owner.phone, "asIs", "/groups");
            await page.getByRole("button", {name: ct.goToPageN(3), exact: true}).click();
            await expect(page.getByRole("button", {name: ct.pageN(3), exact: true})).toHaveAttribute("aria-current", "page");

            await page.getByPlaceholder(t.searchProtocols).fill(`alpha ${u}`);
            await expect(page.getByRole("button", {name: ct.pageN(1), exact: true})).toHaveAttribute("aria-current", "page");
            await expect(protocolCards(page)).toHaveCount(12);
            await expect(protocolCards(page).filter({hasText: "Beta"})).toHaveCount(0);
            await page.getByRole("button", {name: ct.goToPageN(2), exact: true}).click();
            await expect(protocolCards(page)).toHaveCount(1);
            await expect(protocolCard(page, names[12])).toBeVisible();

            await page.getByPlaceholder(t.searchProtocols).fill(`nothing ${u}`);
            await expect(page.getByText(ct.protocolsNoResults, {exact: true})).toBeVisible();
            await expect(protocolCards(page)).toHaveCount(0);
        });

    test("clicking a card opens its editor at /groups/{id} @GRP-041", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Drug ${unique()}`);
        const protocol = await createProtocol(data, clinic, `Open me ${unique()}`, [{drug}]);
        await signIn(page, clinic.owner.phone, "asIs", "/groups");
        await protocolCard(page, protocol.name).getByText(protocol.name, {exact: true}).click();
        await expect(page).toHaveURL(new RegExp(`/groups/${protocol.id}$`));
        await expect(page.getByRole("heading", {level: 1, name: t.editProtocol})).toBeVisible();
        await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
    });

    test("a card's delete: «حذف المجموعة؟»; «إلغاء» keeps the group, «حذف» deletes it and keeps its drugs @GRP-042 @GRP-043",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Kept drug ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Delete me ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/groups");

            const askDelete = async () => {
                await protocolCard(page, protocol.name).getByRole("button", {name: t.delete, exact: true}).click();
                const confirm = dialog(page, ct.protocolDeleteTitle);
                await expect(confirm.locator(".MuiDialogContentText-root")).toHaveText(ct.protocolDeleteMessage(protocol.name));
                return confirm;
            };
            let confirm = await askDelete();
            await healthy();
            await confirm.getByRole("button", {name: t.cancel}).click();
            await expect(confirm).toHaveCount(0);
            await page.reload();
            await expect(protocolCard(page, protocol.name)).toBeVisible();

            confirm = await askDelete();
            await confirm.getByRole("button", {name: t.delete}).click();
            await expectToast(page, ct.protocolDeleted);
            await expect(protocolCard(page, protocol.name)).toHaveCount(0);
            await expect(confirm).toHaveCount(0);

            await navTo(page, t, t.navDrugs);
            await expect(drugRow(page, drug.name)).toBeVisible();
        });

    test("the prescription's Groups tab: typing «عمليه» lists «بعد عملية المياه» (desktop in the project's language; the 375 px phone in Arabic and English) @GRP-097",
        async ({page, lang, data, isMobile}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${unique()}`);
            await createProtocol(data, clinic, "بعد عملية المياه", [{drug}]);
            await createProtocol(data, clinic, "جفاف العين", [{drug}]);
            await signIn(page, clinic.owner.phone);
            for (const ui of isMobile ? ["ar", "en"] as Lang[] : [lang]) {
                await test.step(ui, async () => {
                    const t = TEXTS[ui];
                    if (ui !== lang) await setLanguage(page, ui);
                    await expect(page.getByRole("tab", {name: t.rxTabProtocols})).toHaveAttribute("aria-selected", "true");
                    await page.getByPlaceholder(t.searchProtocols).filter({visible: true}).fill("عمليه");
                    await expect(option(page, "بعد عملية المياه").filter({visible: true})).toBeVisible();
                    await expect(page.getByRole("option").filter({visible: true})).toHaveCount(1);
                    await expectHealthyPage(page, ui, test.info());
                });
            }
        });
});
