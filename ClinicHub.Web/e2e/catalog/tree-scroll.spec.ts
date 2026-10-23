import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import type {Lang} from "../support/texts.ts";
import {
    bucketPage,
    categoryName,
    type DrugTreeUi,
    subCategoryName,
    TREE_PAGE_SIZE,
    type TreeAnswer,
    treeOf,
} from "../support/tree.ts";
import {expectNoCutOrOverlap} from "../support/ux.ts";

/*
 * The drug tree's pages (design M1.7 D7, D9; contract M1.7c § 3.3 "Infinite scroll"): a subcategory loads 30 drugs at a
 * time when the end of its list scrolls into the tree's panel (the observer's root), keeps its place when a drug is
 * added, and scrolls inside its panel (the page scrolls past it). Counts come from the API's tree in the same run (D12).
 */

/** The bucket of the no-search tree whose subcategory has this English name (in any category). */
const bucketNamed = (answer: TreeAnswer, subEn: string) => {
    for (const category of answer.categories) {
        const sub = category.subCategories.find(s => s.nameEn === subEn);
        if (sub) return {category, sub};
    }
    throw new Error(`No subcategory "${subEn}" in the tree`);
};

/** The page numbers the page requested for a bucket, in order. */
const watchPages = (page: Page, categoryId: number, subCategoryId: number | null) => {
    const pages: number[] = [];
    page.on("request", request => {
        if (request.method() !== "GET") return;
        const n = bucketPage(request.url(), categoryId, subCategoryId);
        if (n !== null) pages.push(n);
    });
    return pages;
};

/** Scrolls the bucket's end (its sentinel) into the panel's view, as a user scrolling down the list. */
const scrollToEnd = (tree: DrugTreeUi, subRow: Locator) => tree.sentinelOf(subRow).evaluate(el => el.scrollIntoView({block: "end"}));

/** Opens the prescription's tree on a subcategory of the no-search tree; returns its row and the API's answer for it. */
const openBucket = async (page: Page, lang: Lang, phone: string, {category, sub}: ReturnType<typeof bucketNamed>) => {
    await signIn(page, phone);
    const rx = new RxPage(page, RX_TEXTS[lang]);
    await rx.openDrugsTab();
    await rx.tree.settle();
    const subRow = await rx.tree.openPath(categoryName(category, lang), subCategoryName(sub, rx.tree.tt));
    await expect(rx.tree.drugsIn(subRow)).toHaveCount(Math.min(TREE_PAGE_SIZE, sub.count));
    return {rx, subRow};
};

test.describe("The drug tree: pages while scrolling @area:catalog", () => {
    test("a subcategory of more than 30 drugs: scrolling to the end of its list loads the next 30 by itself (a spinner while loading), and so on to the last @CAT-097",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const answer = await treeOf(await data.ownerApi(clinic));
            // A subcategory of 3 to 5 pages (the first by id), so the test reaches its last page
            const pick = (tree: TreeAnswer) => {
                for (const category of tree.categories) {
                    const sub = category.subCategories.find(s => s.count > 2 * TREE_PAGE_SIZE && s.count <= 5 * TREE_PAGE_SIZE);
                    if (sub) return {category, sub};
                }
                throw new Error("no subcategory of 3 to 5 pages");
            };
            const {category, sub} = pick(answer);
            const requested = watchPages(page, category.id, sub.id);
            // The second page waits until the spinner was seen
            let release: () => void = () => {};
            const held = new Promise<void>(resolve => { release = resolve; });
            await page.route(url => bucketPage(url.href, category.id, sub.id) === 2, async route => {
                await held;
                await route.continue();
            });
            const {rx, subRow} = await openBucket(page, lang, clinic.owner.phone, {category, sub});
            const group = rx.tree.groupOf(subRow);

            await scrollToEnd(rx.tree, subRow);
            await expect(group.getByRole("progressbar", {name: rx.tree.tt.loading}), "a spinner while the page loads").toBeVisible();
            await expect(group).toHaveAttribute("aria-busy", "true");
            release();
            await expect(rx.tree.drugsIn(subRow)).toHaveCount(Math.min(2 * TREE_PAGE_SIZE, sub.count));
            await expect(group).not.toHaveAttribute("aria-busy", "true");

            const pages = Math.ceil(sub.count / TREE_PAGE_SIZE);
            for (let n = 3; n <= pages; n++) {
                await scrollToEnd(rx.tree, subRow);
                await expect(rx.tree.drugsIn(subRow), `page ${n}`).toHaveCount(Math.min(n * TREE_PAGE_SIZE, sub.count));
            }
            await expect(rx.tree.drugsIn(subRow)).toHaveCount(sub.count);
            // The last page: nothing more to load
            await expect(group.getByRole("button", {name: rx.tree.tt.loadMore})).toHaveCount(0);
            await expect(group.getByRole("progressbar")).toHaveCount(0);
            expect(requested, "each page once, without a click").toEqual(Array.from({length: pages}, (_, i) => i + 1));
        });

    test("\"Multivitamins\" scrolled to its 5th page, then a drug added: the tree keeps its place (no jump to the top, pages 1–5 not loaded again) @CAT-117",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const answer = await treeOf(await data.ownerApi(clinic));
            const {category, sub} = bucketNamed(answer, "Multivitamins");
            expect(sub.count).toBeGreaterThan(5 * TREE_PAGE_SIZE);
            const requested = watchPages(page, category.id, sub.id);
            const {rx, subRow} = await openBucket(page, lang, clinic.owner.phone, {category, sub});
            for (let n = 2; n <= 5; n++) {
                await scrollToEnd(rx.tree, subRow);
                await expect(rx.tree.drugsIn(subRow)).toHaveCount(n * TREE_PAGE_SIZE);
            }
            // A drug of the 5th page, in the middle of the panel
            const target = rx.tree.drugsIn(subRow).nth(5 * TREE_PAGE_SIZE - 10);
            const name = await target.getAttribute("aria-label") ?? "";
            await target.evaluate(el => el.scrollIntoView({block: "center"}));
            await rx.tree.settle();
            const before = await rx.tree.panelState();
            const loadedBefore = requested.length;

            await target.getByText(name, {exact: true}).first().click();
            await expect(rx.linesOf(name)).toHaveCount(1);
            await expect(target.getByText(rx.rt.added, {exact: true})).toBeVisible();
            const after = await rx.tree.panelState();
            expect(Math.abs(after.scrollTop - before.scrollTop), "the panel did not jump").toBeLessThanOrEqual(2);
            await expect(target).toBeInViewport();
            expect(await rx.tree.drugsIn(subRow).count()).toBeGreaterThanOrEqual(5 * TREE_PAGE_SIZE);
            expect(requested.slice(loadedBefore).filter(n => n <= 5), "pages 1–5 not loaded again").toEqual([]);
            await rx.tree.expectOpen(subRow);
        });

    test("at 375 px with \"Multivitamins\" open: the tree scrolls inside its panel (58vh), the page scrolls past it to the lines without loading more drugs; nothing cut, no sideways scroll @CAT-118",
        async ({page, lang, data, healthy}) => {
            await page.setViewportSize({width: 375, height: 812});
            const clinic = await data.clinic();
            const answer = await treeOf(await data.ownerApi(clinic));
            const {category, sub} = bucketNamed(answer, "Multivitamins");
            const {rx, subRow} = await openBucket(page, lang, clinic.owner.phone, {category, sub});
            const requested = watchPages(page, category.id, sub.id);

            const panel = await rx.tree.panelState();
            expect(panel.clientHeight, "the panel's height: at most 58vh").toBeLessThanOrEqual(0.58 * 812 + 1);
            expect(panel.scrollHeight, "the list scrolls inside the panel").toBeGreaterThan(panel.clientHeight);
            expect(panel.scrollWidth, "no sideways scroll in the panel").toBeLessThanOrEqual(panel.clientWidth);
            // The counts stay on the names' line or wrap below: every node row inside the panel's width
            for (const row of [rx.tree.category(categoryName(category, lang)), subRow]) {
                const box = (await row.boundingBox())!;
                expect(box.x).toBeGreaterThanOrEqual(panel.left - 1);
                expect(box.x + box.width).toBeLessThanOrEqual(panel.right + 1);
            }
            await expectNoCutOrOverlap(rx.catalog, "the tree at 375 px");

            // The page scrolls past the panel to the prescription's lines (below it); the panel's own list stays put
            const lines = (await rx.panel.boundingBox())!;
            expect(lines.y, "the lines are below the tree's panel").toBeGreaterThanOrEqual(panel.bottom - 1);
            await rx.panel.scrollIntoViewIfNeeded();
            await expect(rx.panel).toBeInViewport();
            expect((await rx.tree.panelState()).scrollTop, "the panel did not scroll").toBe(panel.scrollTop);
            await rx.tree.settle();
            await expect(rx.tree.drugsIn(subRow)).toHaveCount(TREE_PAGE_SIZE);
            expect(requested, "no page loaded while the page scrolled").toEqual([]);
            await rx.tree.restMouse();
            await healthy();
        });
});
