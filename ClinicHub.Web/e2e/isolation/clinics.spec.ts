import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {expectContextLabel, expectToast, navTo, openSwitchClinic, pickerEntry} from "../support/ui.ts";

test.describe("Clinic isolation in the browser @area:isolation", () => {
    test("switching from A's drugs page to B: only B's drugs and groups, never a moment of A's @ISO-040 @smoke", async ({page, t, data}) => {
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const drugA = await data.drug(a, `Drug A ${u}`);
        const groupA = await data.group(a, [drugA], `Group A ${u}`);
        const drugB = await data.drug(b, `Drug B ${u}`);
        const groupB = await data.group(b, [drugB], `Group B ${u}`);
        const staff = await data.staff(a);
        await data.staff(b, {phone: staff.phone});
        await signIn(page, staff.phone, {clinicId: a.id}, "/drugs");
        await expect(page.getByRole("cell", {name: drugA.name})).toBeVisible();
        await openSwitchClinic(page, t);

        // From here (the picker), A's drug or group anywhere on screen is a leak
        await page.evaluate(([drug, group]) => {
            const flags = window as unknown as { leaked?: string };
            new MutationObserver(() => {
                const text = document.body.innerText;
                if (text.includes(drug) || text.includes(group)) flags.leaked = text.includes(drug) ? drug : group;
            }).observe(document, {subtree: true, childList: true, characterData: true});
        }, [drugA.name, groupA.name]);
        await pickerEntry(page, b.name).click();
        await expectContextLabel(page, b.name);

        await navTo(page, t, t.navDrugs);
        await expect(page.getByRole("cell", {name: drugB.name})).toBeVisible();
        await navTo(page, t, t.navGroups);
        await expect(page.getByText(groupB.name, {exact: true})).toBeVisible();
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
        await page.getByRole("tab", {name: t.rxTabGroups}).click();
        await expect(page.getByText(drugA.name).filter({visible: true}).first()).toBeVisible();

        await openSwitchClinic(page, t);
        await pickerEntry(page, b.name).click();
        await expectContextLabel(page, b.name);
        await expect(page.getByText(t.rxEmpty)).toBeVisible();
        await expect(page.getByText(drugA.name)).toHaveCount(0);

        await openSwitchClinic(page, t);
        await pickerEntry(page, a.name).click();
        await expectContextLabel(page, a.name);
        await page.getByRole("tab", {name: t.rxTabGroups}).click();
        await expect(page.getByText(t.rxEmpty)).toHaveCount(0);
        await expect(page.getByText(drugA.name).filter({visible: true}).first()).toBeVisible();
        const stored = await page.evaluate(id => localStorage.getItem(`prescription.lines.${id}`), a.id);
        expect(stored).toContain(drugA.name);
    });

    test("A's user opening the URL of B's group: «هذا العنصر لم يعد موجودًا.» @ISO-043", async ({page, t, data, healthy}) => {
        const a = await data.clinic();
        const b = await data.clinic();
        const groupB = await data.group(b, [await data.drug(b)]);
        await signIn(page, a.owner.phone, "asIs", `/groups/${groupB.id}`);

        await expect(page.getByText(t.notFound, {exact: true}).first()).toBeVisible();
        await expect(page.getByText(groupB.name)).toHaveCount(0);
        await expectContextLabel(page, a.name);
        await healthy();
    });
});

test.describe("Client routes and an unreachable API @area:errors", () => {
    test("a client route asked from the server answers 200 with the SPA (deep links and reloads work) @ERR-019", async ({page, data}) => {
        for (const path of ["/drugs", "/groups/5", "/admin/clinics/1", "/select-clinic"]) {
            const response = await page.request.get(path);
            expect(response.status(), path).toBe(200);
            expect(response.headers()["content-type"], path).toContain("text/html");
            expect(await response.text(), path).toContain('<div id="root">');
        }
        const clinic = await data.clinic();
        const group = await data.group(clinic, [await data.drug(clinic)]);
        await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
        await expect(page.getByRole("textbox").first()).toHaveValue(group.name);
    });

    test("the API unreachable while saving a drug or a group: «تعذّر الاتصال بالخادم» and the form keeps what was typed @ERR-031",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await data.drug(clinic);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.route("**/api/v1/drugs", route => route.request().method() === "POST" ? route.abort("connectionrefused") : route.continue());
            await page.route("**/api/v1/drug-groups", route => route.request().method() === "POST" ? route.abort("connectionrefused") : route.continue());

            const name = `Drug ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("textbox", {name: t.drugName}).fill(name);
            await dialog.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.network);
            await expect(dialog.getByRole("textbox", {name: t.drugName})).toHaveValue(name);
            await dialog.getByRole("button", {name: t.cancel}).click();

            const group = `Group ${unique()}`;
            await page.goto("/groups/new");
            await page.getByRole("textbox", {name: t.groupName}).fill(group);
            await page.getByPlaceholder(t.searchDrugs).fill(drug.name);
            await page.getByRole("option", {name: new RegExp(drug.name)}).click();
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.network);
            await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(group);
            await expect(page).toHaveURL(/\/groups\/new$/);
        });
});
