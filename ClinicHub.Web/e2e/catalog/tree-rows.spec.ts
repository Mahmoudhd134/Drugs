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
import {expectNoCutOrOverlap, textRect} from "../support/ux.ts";

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

/**
 * The chevron icons by their drawing (Material icons' svg path `d`): MUI's `data-testid` on icons exists only in
 * development builds, never in the production build e2e runs against (T4 A-G4).
 */
const ICON_PATHS = {
    chevronLeft: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    chevronRight: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    expandMore: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
} as const;
const iconPath = (icon: keyof typeof ICON_PATHS) => `svg:has(path[d="${ICON_PATHS[icon]}"])`;

/** Lines of a row as read (its visible text, top to bottom). */
const linesOf = async (row: import("@playwright/test").Locator) =>
    (await row.innerText()).split("\n").map(part => part.trim()).filter(Boolean);

test.describe("The drug tree: rows and keys @area:catalog", () => {
    test("a drug row: the name only, its ingredients on one line (the full text in a tooltip; none, no empty line), «خاص بالعيادة» on an own drug and no «مشترك» chip on a shared one, an own drug's dosing sentence, never its description or an Arabic name @CAT-112 @CAT-278",
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
            // Measured on the ingredients' line (the block around a `<bdi>` isolating them, CAT-262)
            const layout = await shown.evaluate(found => {
                const el = found.tagName === "BDI" ? found.parentElement! : found;
                return {
                    cut: el.scrollWidth > el.clientWidth, noWrap: getComputedStyle(el).whiteSpace === "nowrap",
                    height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) || 20,
                };
            });
            if ((page.viewportSize()?.width ?? 1280) >= 600) {
                // From `sm`: one line with an ellipsis, the full text in a tooltip
                expect(layout.noWrap && layout.cut, "the ingredients on one cut line").toBe(true);
                expect(layout.height).toBeLessThan(layout.line * 1.5);
                if (!isMobile) {
                    // The pointer on the cut line itself (the tooltip's anchor): the `<bdi>` inside runs past the line's
                    // clipped end, so its centre is hidden and the row would take the hover
                    const line = await shown.evaluate(found => found.tagName === "BDI") ? shown.locator("xpath=..") : shown;
                    await line.hover();
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

            // A shared drug: no chip (no «مشترك», M1.7 review R2), its ingredients, no dosing sentence, never its hidden Arabic name («أليموكس»)
            await rx.tree.search(IMPORTED.alemox1g);
            const shared = rx.drug(IMPORTED.alemox1g);
            await expect(shared).toBeVisible();
            await expect(shared.getByText(tt.chipShared, {exact: true})).toHaveCount(0);
            await expect(shared.getByText(tt.chipOwn, {exact: true})).toHaveCount(0);
            if (alemox.activeIngredients) await expect(shared).toContainText(alemox.activeIngredients);
            await expect(shared).not.toContainText("أليموكس");
            await expect(sentenceIn(shared)).toHaveCount(0);
        });

    test("each ingredients line runs in its own text's direction: a short one starts at the interface's start (the right in Arabic, the left in English); a long Latin one shows its first word, the ellipsis at its end (decision C34) @CAT-262",
        async ({page, lang, data}) => {
            const u = unique();
            const clinic = await data.clinic();
            const latin = `TIMOLOL 0.5% ${u}.`;
            const arabic = `كلوريد الصوديوم 0.9٪ ${u}.`;
            const long = `BEGINNING${u} AMOXICILLIN TRIHYDRATE 875 MG + CLAVULANATE POTASSIUM 125 MG + LACTOBACILLUS ACIDOPHILUS 60 MILLION SPORES + ZINC SULPHATE MONOHYDRATE 10 MG + VITAMIN C 500 MG + VITAMIN D3 1000 IU ENDING${u}`;
            const timolol = await ownDrugIn(data, clinic, {name: `Latin ${u}`, activeIngredients: latin});
            const saline = await ownDrugIn(data, clinic, {name: `Arabic ${u}`, activeIngredients: arabic});
            const augmentin = await ownDrugIn(data, clinic, {name: `Long ${u}`, activeIngredients: long});
            const rx = await openDrugsTab(page, lang, clinic.owner.phone);
            // All in «العيون › المياه الزرقاء»: the one subcategory opens by itself
            await rx.tree.search(u);
            /** The line holding the text (the block around it, past any inline <bdi>): its box, direction and cut. */
            const lineOf = (row: import("@playwright/test").Locator, text: string) => row.getByText(text, {exact: true}).evaluate(found => {
                let el: HTMLElement = found as HTMLElement;
                while (getComputedStyle(el).display.startsWith("inline")) el = el.parentElement!;
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return {
                    left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight),
                    direction: style.direction, cut: el.scrollWidth > el.clientWidth, ellipsis: style.textOverflow === "ellipsis",
                    isolated: !!found.closest("bdi") || found.closest("[dir]")?.getAttribute("dir") === "auto",
                };
            });
            for (const [drug, text, direction] of [[timolol, latin, "ltr"], [saline, arabic, "rtl"]] as const) {
                const row = rx.drug(drug.name);
                await expect(row.getByText(text, {exact: true})).toBeVisible();
                const line = await lineOf(row, text);
                const shown = await textRect(row, text);
                expect(line.isolated, `${text}: in a <bdi> or dir="auto"`).toBe(true);
                expect(line.direction, `${text}: the line runs in its text's direction`).toBe(direction);
                expect(shown.width, `${text}: shorter than its line`).toBeLessThan(line.right - line.left - 20);
                if (lang === "ar") expect(Math.abs(line.right - shown.right), `${text}: starts at the right`).toBeLessThanOrEqual(2);
                else expect(Math.abs(shown.left - line.left), `${text}: starts at the left`).toBeLessThanOrEqual(2);
            }

            // The long Latin line: left to right in both languages, its first word inside the line's box
            const row = rx.drug(augmentin.name);
            await expect(row.getByText(long, {exact: true})).toBeVisible();
            const line = await lineOf(row, long);
            expect(line.direction, "the long Latin line runs left to right").toBe("ltr");
            const first = await textRect(row, `BEGINNING${u}`);
            expect(first.left, "its first word starts inside the line").toBeGreaterThanOrEqual(line.left - 1);
            expect(first.right, "its first word ends inside the line").toBeLessThanOrEqual(line.right + 1);
            if ((page.viewportSize()?.width ?? 1280) >= 600) {
                // From `sm` it is one cut line: the cut (and its ellipsis) at the end, the last word past the line's right
                expect(line.cut && line.ellipsis, "one cut line with an ellipsis").toBe(true);
                const last = await textRect(row, `ENDING${u}`);
                expect(last.left, "the end is what is cut").toBeGreaterThan(line.right);
            }
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
            // Two categories: «العيون» (an own drug in «المياه الزرقاء», another without a subcategory) and «أخرى» (two without a
            // subcategory, pinned last): neither has a lone subcategory of one drug, so nothing opens by itself (R3)
            const eyeIds = await categoryIds(api, EYE.en);
            const a = await ownDrugIn(data, clinic, {name: `Keys ${u} A`, defaultDosing: DOSINGS.dropRight4x});
            await ownDrugIn(data, clinic, {name: `Keys ${u} A2`, categoryId: eyeIds.categoryId, subCategoryId: null});
            await ownDrugIn(data, clinic, {name: `Keys ${u} B`, categoryId: other.categoryId, subCategoryId: null});
            await ownDrugIn(data, clinic, {name: `Keys ${u} B2`, categoryId: other.categoryId, subCategoryId: null});
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
            await expect(chevron(EYE[lang], false).locator(iconPath(lang === "ar" ? "chevronLeft" : "chevronRight"))).toBeVisible();

            await rx.tree.searchBox.press("ArrowDown");
            await expect(eye).toBeFocused();
            await page.keyboard.press(opening);
            await rx.tree.expectOpen(eye);
            await expect(chevron(EYE[lang], true).locator(iconPath("expandMore"))).toBeVisible();
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
