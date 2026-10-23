import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {RxPage} from "../support/rx.ts";
import {EYE, ownDrugIn} from "../support/shared.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {categoryOf, treeOf} from "../support/tree.ts";
import {expectContextLabel, navTo, openSwitchClinic, pickerEntry} from "../support/ui.ts";

/*
 * The drug tree and the clinic switch (CAT-129, ISO-040; contract M1.7c § 3.3 "Clinic switch"): the query cache is
 * cleared by the context switch, so nothing of A's tree (its own drugs, its counts) shows in B.
 */

test.describe("The drug tree across clinics @area:catalog", () => {
    test("A's tree open (an own drug of A shown, A's counts), then the switch to B: none of A's drugs or counts in B's tree, never a moment of them @CAT-129",
        async ({page, t, lang, data}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            // A has two own drugs more than B in «العيون»: A's count for it differs from B's
            const drugA = await ownDrugIn(data, a, {name: `Leak ${u} one`});
            await ownDrugIn(data, a, {name: `Leak ${u} two`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            const eyeA = categoryOf(await treeOf(await data.ownerApi(a)), EYE.en);
            const eyeB = categoryOf(await treeOf(await data.ownerApi(b)), EYE.en);
            expect(eyeA.count).not.toBe(eyeB.count);

            await signIn(page, staff.phone, {clinicId: a.id});
            const rx = new RxPage(page, RX_TEXTS[lang]);
            const tt = rx.tree.tt;
            await rx.openDrugsTab();
            await rx.tree.settle();
            await expect(rx.tree.category(EYE[lang])).toHaveAttribute("aria-label", tt.node(EYE[lang], eyeA.count));
            await rx.tree.search(u);
            await expect(rx.drug(drugA.name)).toBeVisible();
            await openSwitchClinic(page, t);

            // From here (the picker), A's drug, or A's count for «العيون», anywhere on screen is a leak
            await page.evaluate(([drug, label]) => {
                const flags = window as unknown as { leaked?: string };
                const check = () => {
                    if (document.body.innerText.includes(drug)) flags.leaked = drug;
                    if (document.querySelector(`[role=treeitem][aria-label="${label}"]`)) flags.leaked = label;
                };
                new MutationObserver(check).observe(document, {subtree: true, childList: true, characterData: true, attributes: true});
            }, [drugA.name, tt.node(EYE[lang], eyeA.count)]);
            await pickerEntry(page, b.name).click();
            await expectContextLabel(page, b.name);
            await navTo(page, t, t.navPrescription);

            const rxB = new RxPage(page, RX_TEXTS[lang]);
            await rxB.openDrugsTab();
            await rxB.tree.settle();
            await expect(rxB.tree.category(EYE[lang])).toHaveAttribute("aria-label", tt.node(EYE[lang], eyeB.count));
            await rxB.tree.search(u);
            await expect(rxB.catalog.getByText(tt.noResults, {exact: true})).toBeVisible();
            await expect(rxB.drug(drugA.name)).toHaveCount(0);
            expect(await page.evaluate(() => (window as unknown as { leaked?: string }).leaked ?? null), "nothing of A's tree in B").toBeNull();
        });
});
