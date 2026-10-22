import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {pickCategory} from "../support/shared.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {expectContextLabel, expectToast, navTo, openSwitchClinic, pickerEntry, toast} from "../support/ui.ts";

test.describe("Clinic isolation in the browser @area:isolation", () => {
    test("switching from A's drugs page to B: B's own drugs (+ the shared ones) and B's protocols, never a moment of A's @ISO-040 @smoke", async ({page, t, lang, data}) => {
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const drugA = await data.drug(a, `Drug A ${u}`);
        const protocolA = await data.protocol(a, [drugA], `Protocol A ${u}`);
        const drugB = await data.drug(b, `Drug B ${u}`);
        const protocolB = await data.protocol(b, [drugB], `Protocol B ${u}`);
        const staff = await data.staff(a);
        await data.staff(b, {phone: staff.phone});
        await signIn(page, staff.phone, {clinicId: a.id}, "/drugs");
        await expect(page.getByRole("cell", {name: drugA.name})).toBeVisible();
        await openSwitchClinic(page, t);

        // From here (the picker), A's drug or protocol anywhere on screen is a leak
        await page.evaluate(([drug, protocol]) => {
            const flags = window as unknown as { leaked?: string };
            new MutationObserver(() => {
                const text = document.body.innerText;
                if (text.includes(drug) || text.includes(protocol)) flags.leaked = text.includes(drug) ? drug : protocol;
            }).observe(document, {subtree: true, childList: true, characterData: true});
        }, [drugA.name, protocolA.name]);
        await pickerEntry(page, b.name).click();
        await expectContextLabel(page, b.name);

        await navTo(page, t, t.navDrugs);
        await expect(page.getByRole("cell", {name: drugB.name})).toBeVisible();
        // The shared catalog shows in B too (design M1.7 D1), after B's own drugs
        await expect(page.getByText(SHARED_TEXTS[lang].chipShared, {exact: true}).first()).toBeVisible();
        await navTo(page, t, t.navProtocols);
        await expect(page.getByText(protocolB.name, {exact: true})).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { leaked?: string }).leaked ?? null)).toBeNull();
    });

    test("each clinic keeps its own prescription: B's is empty, A's line is still there when back @ISO-042", async ({page, t, data}) => {
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const drugA = await data.drug(a, `Drug A ${u}`);
        const staff = await data.staff(a);
        await data.staff(b, {phone: staff.phone});
        await signIn(page, staff.phone, {clinicId: a.id});
        await expectContextLabel(page, a.name);

        await page.getByRole("tab", {name: t.rxTabDrugs}).click();
        await page.getByRole("option", {name: new RegExp(drugA.name)}).click();
        await expect(page.getByText(t.rxEmpty)).toHaveCount(0);
        await page.getByRole("tab", {name: t.rxTabProtocols}).click();
        await expect(page.getByText(drugA.name).filter({visible: true}).first()).toBeVisible();

        await openSwitchClinic(page, t);
        await pickerEntry(page, b.name).click();
        await expectContextLabel(page, b.name);
        await expect(page.getByText(t.rxEmpty)).toBeVisible();
        await expect(page.getByText(drugA.name)).toHaveCount(0);

        await openSwitchClinic(page, t);
        await pickerEntry(page, a.name).click();
        await expectContextLabel(page, a.name);
        await page.getByRole("tab", {name: t.rxTabProtocols}).click();
        await expect(page.getByText(t.rxEmpty)).toHaveCount(0);
        await expect(page.getByText(drugA.name).filter({visible: true}).first()).toBeVisible();
        const stored = await page.evaluate(id => localStorage.getItem(`prescription.lines.${id}`), a.id);
        expect(stored).toContain(drugA.name);
    });

    test("A's user opening the URL of B's protocol: «هذا العنصر لم يعد موجودًا.» @ISO-043", async ({page, t, data, healthy, allowApiErrors}) => {
        // Another clinic's protocol is not found: the test's subject
        allowApiErrors({status: 404, method: "GET", path: /^\/api\/v1\/protocols\/\d+$/});
        const a = await data.clinic();
        const b = await data.clinic();
        const protocolB = await data.protocol(b, [await data.drug(b)]);
        await signIn(page, a.owner.phone, "asIs", `/protocols/${protocolB.id}`);

        await expect(page.getByText(t.notFound, {exact: true}).first()).toBeVisible();
        await expect(page.getByText(protocolB.name)).toHaveCount(0);
        await expectContextLabel(page, a.name);
        await healthy();
    });
});

test.describe("Client routes and an unreachable API @area:errors", () => {
    test("a client route asked from the server answers 200 with the SPA (deep links and reloads work) @ERR-019", async ({page, data}) => {
        for (const path of ["/drugs", "/protocols/5", "/admin/clinics/1", "/select-clinic"]) {
            const response = await page.request.get(path);
            expect(response.status(), path).toBe(200);
            expect(response.headers()["content-type"], path).toContain("text/html");
            expect(await response.text(), path).toContain('<div id="root">');
        }
        const clinic = await data.clinic();
        const protocol = await data.protocol(clinic, [await data.drug(clinic)]);
        await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
        await expect(page.getByRole("textbox").first()).toHaveValue(protocol.name);
    });

    test("the API unreachable while saving a drug or a protocol: «تعذّر الاتصال بالخادم» and the form keeps what was typed @ERR-031",
        async ({page, t, lang, data, allowNetworkErrors}) => {
            const clinic = await data.clinic();
            const drug = await data.drug(clinic);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            // The API unreachable on save: its "net::ERR_…" console lines are expected
            allowNetworkErrors();
            await page.route("**/api/v1/drugs", route => route.request().method() === "POST" ? route.abort("connectionrefused") : route.continue());
            await page.route("**/api/v1/protocols", route => route.request().method() === "POST" ? route.abort("connectionrefused") : route.continue());

            const name = `Drug ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("textbox", {name: t.drugName}).fill(name);
            await pickCategory(page, dialog, lang);
            await dialog.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.network);
            await expect(dialog.getByRole("textbox", {name: t.drugName})).toHaveValue(name);
            // On a phone the toast (bottom centre) covers the dialog's buttons and stays while the pointer is on it
            // (react-hot-toast pauses on hover; the Save click left the pointer there): move away, let it go
            await page.mouse.move(1, 1);
            await expect(toast(page, t.network)).toHaveCount(0);
            await dialog.getByRole("button", {name: t.cancel}).click();

            const protocol = `Protocol ${unique()}`;
            await page.goto("/protocols/new");
            await page.getByRole("textbox", {name: t.protocolName}).fill(protocol);
            await page.getByPlaceholder(t.searchDrugs).fill(drug.name);
            await page.getByRole("option", {name: new RegExp(drug.name)}).click();
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.network);
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol);
            await expect(page).toHaveURL(/\/protocols\/new$/);
        });
});
