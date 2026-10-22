import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {DOSINGS} from "../support/texts-ux.ts";
import {closeSidebar} from "../support/ui.ts";
import {addDrugToRx, drugRow, drugWith, protocolWith, linesPanel, open, shownName, textRect, textsOf} from "../support/ux.ts";

const box = async (locator: Locator) => {
    const rect = await locator.boundingBox();
    expect(rect, "on screen").not.toBeNull();
    return rect!;
};

const center = (rect: { x: number; width: number }) => rect.x + rect.width / 2;

/** The horizontal middle of the page's content area. */
const mainMiddle = async (page: Page) => center(await box(page.locator("main")));

test.describe("Direction and alignment @area:i18n", () => {
    test("the Arabic UI is mirrored: sidebar on the right (phone drawer from the right), text right-aligned, back arrow pointing right, number avatars right and actions left of a line; the English UI the other way @I18N-005",
        async ({page, data, lang, isMobile}) => {
            const {t, u} = textsOf(lang);
            const rtl = lang === "ar";
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`, defaultDosing: DOSINGS.oneDropFour.dosing});
            const protocol = await protocolWith(data, clinic, `G ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone);
            const width = page.viewportSize()!.width;

            // The sidebar (permanent on a desktop, the drawer on a phone)
            const nav = page.getByRole("navigation", {name: t.navMain}).filter({visible: true});
            if (isMobile) {
                await page.getByRole("button", {name: t.navMenu}).click();
                const paper = page.locator(".MuiDrawer-modal .MuiDrawer-paper");
                await expect(nav).toBeVisible();
                // The drawer has slid in: it touches its side of the screen
                await expect.poll(async () => {
                    const rect = await box(paper);
                    return rtl ? Math.round(rect.x + rect.width) : Math.round(rect.x);
                }, {message: "the drawer is against its side"}).toBe(rtl ? width : 0);
                await closeSidebar(page);
            } else {
                const rect = await box(nav);
                if (rtl) expect(rect.x, "sidebar on the right").toBeGreaterThan(width / 2);
                else expect(rect.x + rect.width, "sidebar on the left").toBeLessThan(width / 2);
            }

            // The page title starts on the reading side
            const heading = page.getByRole("heading", {level: 1, name: u.rxTitle});
            const title = await textRect(heading, u.rxTitle);
            const middle = await mainMiddle(page);
            if (rtl) expect(title.left, "title right-aligned").toBeGreaterThan(middle);
            else expect(title.right, "title left-aligned").toBeLessThan(middle);

            // A prescription line: the number on the reading side, the actions on the other
            await addDrugToRx(page, t, drug.name);
            const lines = linesPanel(page, u);
            const name = await box(lines.getByText(drug.name, {exact: true}));
            const number = await box(lines.locator(".MuiAvatar-root").filter({hasText: /^1$/}));
            const edit = await box(lines.getByRole("button", {name: u.editLine}));
            const handle = await box(lines.getByRole("button", {name: u.dragToReorder}));
            if (rtl) {
                expect(center(number), "number right of the name").toBeGreaterThan(name.x + name.width);
                expect(center(edit), "actions left of the name").toBeLessThan(name.x);
                expect(center(handle), "drag handle at the right edge").toBeGreaterThan(center(number));
            } else {
                expect(center(number), "number left of the name").toBeLessThan(name.x);
                expect(center(edit), "actions right of the name").toBeGreaterThan(name.x + name.width);
                expect(center(handle), "drag handle at the left edge").toBeLessThan(center(number));
            }

            // The protocol editor's back arrow points back (right in Arabic), at the start of the header
            await open(page, `/protocols/${protocol.id}`);
            const back = page.getByRole("button", {name: t.back});
            const transform = await back.locator("svg").evaluate(e => getComputedStyle(e).transform);
            expect(transform, "arrow mirrored in Arabic only").toBe(rtl ? "matrix(-1, 0, 0, 1, 0, 0)" : "none");
            const editorTitle = await box(page.getByRole("heading", {level: 1}));
            const backBox = await box(back);
            if (rtl) expect(center(backBox), "back button right of the title").toBeGreaterThan(editorTitle.x + editorTitle.width - 1);
            else expect(center(backBox), "back button left of the title").toBeLessThan(editorTitle.x + 1);
        });

    test("the Arabic sentence under a drug name reads right to left: under the name's left edge in English, right-aligned in Arabic (drugs table, picker, line) @I18N-010",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`, defaultDosing: DOSINGS.twoDropsLeft.dosing});
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            const aligned = async (scope: Locator, what: string) => {
                const sentence = scope.getByText(DOSINGS.twoDropsLeft.text, {exact: true}).filter({visible: true}).first();
                await expect(sentence).toHaveAttribute("dir", "rtl");
                expect(await sentence.evaluate(e => getComputedStyle(e).direction), `${what}: reads right to left`).toBe("rtl");
                const name = await textRect(scope.getByText(drug.name, {exact: true}).filter({visible: true}).first(), drug.name);
                const text = await textRect(sentence, DOSINGS.twoDropsLeft.text);
                if (lang === "en") expect(Math.abs(text.left - name.left), `${what}: starts under the name (left)`).toBeLessThanOrEqual(2);
                else expect(Math.abs(text.right - name.right), `${what}: right-aligned with the name`).toBeLessThanOrEqual(2);
            };

            await aligned(drugRow(page, drug.name), "drugs table");
            await open(page, "/");
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            await page.getByRole("searchbox", {name: t.searchDrugs}).filter({visible: true}).fill(drug.name);
            const option = page.getByRole("option").filter({visible: true}).filter({hasText: drug.name});
            await expect(option).toHaveCount(1);
            await aligned(option, "drug picker");
            await option.click();
            await expect(shownName(page, drug.name)).toBeVisible();
            await aligned(linesPanel(page, textsOf(lang).u), "prescription line");
        });
});
