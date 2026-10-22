import type {Page, Request} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {DOSINGS, sentenceIn} from "../support/catalog.ts";
import {RxPage} from "../support/rx.ts";
import {EYE, GLAUCOMA, IMPORTED, ownDrugIn, sharedByName} from "../support/shared.ts";
import {SENTENCES} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import type {Lang} from "../support/texts.ts";
import {bucketPage, categoryIds, categoryName} from "../support/tree.ts";
import {expectNoCutOrOverlap} from "../support/ux.ts";

/*
 * The drug tree's rows and keys (design M1.7 D9; contract M1.7c § 3.3 and decision C3): what a drug row shows, a double
 * click on a node, the keyboard (mirrored in Arabic) and the chevrons.
 */

const openDrugsTab = async (page: Page, lang: Lang, phone: string) => {
    await signIn(page, phone);
    const rx = new RxPage(page, RX_TEXTS[lang]);
    await rx.openDrugsTab();
    await rx.tree.settle();
    return rx;
};

/** Lines of a row as read (its visible text, top to bottom). */
const linesOf = async (row: import("@playwright/test").Locator) =>
    (await row.innerText()).split("\n").map(part => part.trim()).filter(Boolean);

test.describe("The drug tree: rows and keys @area:catalog", () => {
    test("a drug row: the name only, its ingredients on one line (the full text in a tooltip; none, no empty line), the «مشترك» / «خاص بالعيادة» chip, an own drug's dosing sentence, never its description or an Arabic name @CAT-112",
        async ({page, lang, data, isMobile}) => {
            const u = unique();
            const clinic = await data.clinic();
            const ingredients = `AMOXICILLIN TRIHYDRATE 875 MG + CLAVULANATE POTASSIUM 125 MG + LACTOBACILLUS ACIDOPHILUS 60 MILLION SPORES + ZINC SULPHATE MONOHYDRATE 10 MG + VITAMIN C 500 MG + VITAMIN D3 1000 IU ${u}`;
            const described = await ownDrugIn(data, clinic, {
                name: `Rich ${u}`, activeIngredients: ingredients, description: `وصف لا يظهر ${u}`, defaultDosing: DOSINGS.dropRight4x,
            });
            const bare = await ownDrugIn(data, clinic, {name: `Bare ${u}`});
            const alemox = await sharedByName(await data.ownerApi(clinic), IMPORTED.alemox1g);
            const rx = await openDrugsTab(page, lang, clinic.owner.phone);
            const tt = rx.tree.tt;

            // Own drugs: both in «العيون › المياه الزرقاء», the one subcategory opens by itself
            await rx.tree.search(u);
            const rich = rx.drug(described.name);
            await expect(rich).toBeVisible();
            await expect(rich.getByText(tt.chipOwn, {exact: true})).toBeVisible();
            await expect(sentenceIn(rich)).toHaveText(SENTENCES.dropRight4x);
            await expect(rich).not.toContainText(`وصف لا يظهر ${u}`);
            const shown = rich.getByText(ingredients, {exact: true});
            await expect(shown).toBeVisible();
            const layout = await shown.evaluate(el => ({
                cut: el.scrollWidth > el.clientWidth, noWrap: getComputedStyle(el).whiteSpace === "nowrap",
                height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) || 20,
            }));
            if ((page.viewportSize()?.width ?? 1280) >= 600) {
                // From `sm`: one line with an ellipsis, the full text in a tooltip
                expect(layout.noWrap && layout.cut, "the ingredients on one cut line").toBe(true);
                expect(layout.height).toBeLessThan(layout.line * 1.5);
                if (!isMobile) {
                    await shown.hover();
                    await expect(page.getByRole("tooltip").filter({visible: true})).toHaveText(ingredients);
                    await page.mouse.move(1, 1);
                }
            } else {
                // Below `sm`: they wrap anywhere, all of them on screen
                expect(layout.cut, "the ingredients wrap instead of being cut").toBe(false);
            }
            // No ingredients: no empty line, no "null"; no dosing: no sentence
            const plain = rx.drug(bare.name);
            expect(await linesOf(plain)).toEqual([bare.name, tt.chipOwn]);
            await expect(plain).not.toContainText("null");
            await expect(sentenceIn(plain)).toHaveCount(0);

            // A shared drug: «مشترك», its ingredients, no dosing sentence, never its hidden Arabic name («أليموكس»)
            await rx.tree.search(IMPORTED.alemox1g);
            const shared = rx.drug(IMPORTED.alemox1g);
            await expect(shared).toBeVisible();
            await expect(shared.getByText(tt.chipShared, {exact: true})).toBeVisible();
            await expect(shared.getByText(tt.chipOwn, {exact: true})).toHaveCount(0);
            if (alemox.activeIngredients) await expect(shared).toContainText(alemox.activeIngredients);
            await expect(shared).not.toContainText("أليموكس");
            await expect(sentenceIn(shared)).toHaveCount(0);
        });

    test("at 375 px a long drug name wraps inside the tree's panel, never past it @CAT-112", async ({page, lang, data}) => {
        await page.setViewportSize({width: 375, height: 812});
        const u = unique();
        const clinic = await data.clinic();
        const long = await ownDrugIn(data, clinic, {name: `${"VERYLONGDRUGNAMEWITHOUTSPACES".repeat(4)}${u}`, activeIngredients: `${"INGREDIENT".repeat(12)} ${u}`});
        const rx = await openDrugsTab(page, lang, clinic.owner.phone);
        await rx.tree.search(u);
        const row = rx.drug(long.name);
        await expect(row).toBeVisible();
        const panel = await rx.tree.panelState();
        expect(panel.scrollWidth, "no sideways scroll in the panel").toBeLessThanOrEqual(panel.clientWidth);
        const box = (await row.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(panel.left - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(panel.right + 1);
        expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth), "the row's content fits its width").toBe(true);
        await expectNoCutOrOverlap(rx.catalog, "a long drug row at 375 px");
    });

    test("a double click on a category or a subcategory leaves it open (the second click of the burst ignored), its first page loaded once @CAT-123",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const {categoryId, subCategoryId} = await categoryIds(api, EYE.en, GLAUCOMA.en);
            const pages: number[] = [];
            page.on("request", (request: Request) => {
                const n = request.method() === "GET" ? bucketPage(request.url(), categoryId, subCategoryId) : null;
                if (n !== null) pages.push(n);
            });
            const rx = await openDrugsTab(page, lang, clinic.owner.phone);
            const category = rx.tree.category(EYE[lang]);
            await rx.tree.nameOf(category, EYE[lang]).dblclick();
            await rx.tree.expectOpen(category);
            const sub = rx.tree.subCategory(EYE[lang], GLAUCOMA[lang]);
            await rx.tree.nameOf(sub, GLAUCOMA[lang]).dblclick();
            await rx.tree.expectOpen(sub);
            await expect(rx.tree.drugsIn(sub).first()).toBeVisible();
            await rx.tree.settle();
            await rx.tree.expectOpen(category);
            await rx.tree.expectOpen(sub);
            expect(pages, "the subcategory's first page, once").toEqual([1]);
        });

    test("the keyboard only: ↓ to a category, the opening arrow opens it, ↓ to a subcategory, Enter opens it, ↓ to a drug, Enter adds it; the closing arrow or Esc closes the current level; in Arabic ← opens and → closes, and the chevrons point the reading direction @CAT-103",
        async ({page, lang, data}) => {
            const u = unique();
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const other = await categoryIds(api, "Other");
            // Two categories: «العيون» (an own drug in «المياه الزرقاء») and «أخرى» (one without a subcategory, pinned last)
            const a = await ownDrugIn(data, clinic, {name: `Keys ${u} A`, defaultDosing: DOSINGS.dropRight4x});
            await ownDrugIn(data, clinic, {name: `Keys ${u} B`, categoryId: other.categoryId, subCategoryId: null});
            const rx = await openDrugsTab(page, lang, clinic.owner.phone);
            const tt = rx.tree.tt;
            const opening = lang === "ar" ? "ArrowLeft" : "ArrowRight";
            const closing = lang === "ar" ? "ArrowRight" : "ArrowLeft";
            await rx.tree.search(u);
            const eye = rx.tree.category(EYE[lang]);
            const otherName = categoryName(other.category, lang);
            const otherRow = rx.tree.category(otherName);
            await expect(rx.tree.rows(1)).toHaveCount(2);
            await rx.tree.expectOpen(eye, false);

            // A closed category's chevron points the reading direction («فتح «العيون»»); open, it points down
            const chevron = (name: string, open: boolean) => eye.getByRole("button", {name: open ? tt.close(name) : tt.open(name), exact: true});
            await expect(chevron(EYE[lang], false)).toBeVisible();
            await expect(chevron(EYE[lang], false).getByTestId(lang === "ar" ? "ChevronLeftIcon" : "ChevronRightIcon")).toBeVisible();

            await rx.tree.searchBox.press("ArrowDown");
            await expect(eye).toBeFocused();
            await page.keyboard.press(opening);
            await rx.tree.expectOpen(eye);
            await expect(chevron(EYE[lang], true).getByTestId("ExpandMoreIcon")).toBeVisible();
            await page.keyboard.press("ArrowDown");
            const glaucoma = rx.tree.subCategory(EYE[lang], GLAUCOMA[lang]);
            await expect(glaucoma).toBeFocused();
            await page.keyboard.press("Enter");
            await rx.tree.expectOpen(glaucoma);
            await page.keyboard.press("ArrowDown");
            await expect(rx.drug(a.name)).toBeFocused();
            await page.keyboard.press("Enter");
            await rx.expectLines([[a.name, SENTENCES.dropRight4x]]);
            await expect(rx.drug(a.name)).toBeFocused();

            // The closing arrow on a drug closes its subcategory (the focus goes there)
            await page.keyboard.press(closing);
            await rx.tree.expectOpen(glaucoma, false);
            await expect(glaucoma).toBeFocused();
            // Esc on an open subcategory closes it
            await page.keyboard.press("Enter");
            await rx.tree.expectOpen(glaucoma);
            await page.keyboard.press("Escape");
            await rx.tree.expectOpen(glaucoma, false);
            await expect(glaucoma).toBeFocused();
            // The closing arrow on a closed subcategory closes its category
            await page.keyboard.press(closing);
            await rx.tree.expectOpen(eye, false);
            await expect(eye).toBeFocused();
            // Esc on an open category closes it; on a closed one it does nothing
            await page.keyboard.press(opening);
            await rx.tree.expectOpen(eye);
            await page.keyboard.press("Escape");
            await rx.tree.expectOpen(eye, false);
            await page.keyboard.press("Escape");
            await rx.tree.expectOpen(eye, false);
            await expect(eye).toBeFocused();
            // Enter opens a category too
            await page.keyboard.press("ArrowDown");
            await expect(otherRow).toBeFocused();
            await page.keyboard.press("Enter");
            await rx.tree.expectOpen(otherRow);
            await expect(rx.tree.subCategory(otherName, tt.noSubCategory)).toBeVisible();
            await rx.expectLines([[a.name, SENTENCES.dropRight4x]]);
        });
});
