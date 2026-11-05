import type {Dialog} from "@playwright/test";
import {expect, settled, test} from "../support/fixtures.ts";
import {
    areaRect,
    areaScroll,
    COMPUTER_ONLY,
    designerShown,
    expectMm,
    expectUntouched,
    getTemplate,
    ONE_LANGUAGE,
    openDesigner,
    openDesignerByTab,
    plainLayout,
    pressBox,
    tabPath,
    tabTo,
    zoomTo,
} from "../support/print-template.ts";
import {expectToast} from "../support/ui.ts";

/** The keyboard and undo through the real app: step 3 design § 3 "Keyboard", "Undo and redo"; contract § 3.5, § 3.6. The rest of these rules are `ui` cases. */

test.describe("Print template: the keyboard @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("in the Arabic UI the left arrow moves left: arrows are physical @TPL-441",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", "the Arabic UI");
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            await box.click();

            await page.keyboard.press("ArrowLeft");
            await expectMm(box, {x: 39, y: 20}, "left");
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("ArrowRight");
            await expectMm(box, {x: 41, y: 20}, "right");
            await page.keyboard.press("ArrowUp");
            await expectMm(box, {x: 41, y: 19}, "up");
            await page.keyboard.press("ArrowDown");
            await expectMm(box, {x: 41, y: 20}, "down");
        });

    test("a whole template built with the keyboard alone: it saves @TPL-481",
        async ({page, data, lang}) => {
            test.slow();
            const {clinic, designer, pt} = await openDesigner(page, data, lang, null);

            await tabTo(page, designer.create);
            await page.keyboard.press("Enter");
            await designerShown(designer);
            await expect(designer.boxes).toHaveCount(1);

            // Added by the keyboard, the focus stays on the entry and arrows move the new item
            await tabTo(page, designer.entry(pt.manualInput));
            await page.keyboard.press("Enter");
            await expect(designer.boxes).toHaveCount(2);
            await page.keyboard.press("Shift+ArrowDown");
            await page.keyboard.press("Shift+ArrowDown");
            await page.keyboard.press("ArrowRight");
            await expectMm(designer.box("i2"), {x: 12, y: 21}, "the manual input");

            await tabTo(page, designer.field(pt.name));
            await page.keyboard.press("Control+KeyA");
            await page.keyboard.type("السن");
            await expect(designer.field(pt.name)).toHaveValue("السن");

            await tabTo(page, designer.entry(pt.fullDate));
            await page.keyboard.press("Enter");
            await expect(designer.boxes).toHaveCount(3);
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("ArrowDown");
            await expectMm(designer.box("i3"), {x: 17, y: 20}, "the date");

            await tabTo(page, designer.box("i2"));
            await page.keyboard.press("Enter");
            await expect(designer.box("i2")).toHaveAttribute("aria-pressed", "true");
            await page.keyboard.press("Alt+ArrowRight");
            await expectMm(designer.box("i2"), {x: 12.1, y: 21}, "a tenth of a mm");

            await tabTo(page, designer.save);
            await page.keyboard.press("Enter");
            await expectToast(page, pt.saved);

            const saved = (await getTemplate(data, clinic))!.layout;
            expect(saved.items.map(item => [item.id, item.xMm, item.yMm])).toEqual([["i1", 14, 80], ["i2", 12.1, 21], ["i3", 17, 20]]);
            expect(saved.items[1].name).toBe("السن");
        });

    test("Alt+ArrowLeft and Alt+ArrowRight on a clean template, with real history behind: the item moves 0.1 mm, the URL stays, no guard question @TPL-515",
        async ({page, data, lang}) => {
            const {clinic, designer} = await openDesignerByTab(page, data, lang, plainLayout());
            const box = designer.box("m");
            const url = new RegExp(`${tabPath(clinic)}$`);
            await box.click();

            await page.keyboard.press("Alt+ArrowLeft");
            await expectMm(box, {x: 39.9, y: 20}, "left");
            await expect(page).toHaveURL(url);
            await expect(designer.question).toHaveCount(0);

            await page.keyboard.press("Alt+ArrowRight");
            await expectMm(box, {x: 40, y: 20}, "right");
            await expect(page).toHaveURL(url);
            await expect(designer.question).toHaveCount(0);
            await expect(designer.sheet).toBeVisible();
        });

    test("at 200%, arrows taking a box past the visible area: the area scrolls to keep it visible @TPL-561",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await box.click();
            const startTop = (await areaScroll(designer)).top;

            for (let presses = 0; presses < 30; presses++) await page.keyboard.press("Shift+ArrowDown");
            await expectMm(box, {y: 170}, "moved down");

            await expect.poll(async () => (await areaScroll(designer)).top, {message: "the area scrolled"}).toBeGreaterThan(startTop);
            await expect.poll(async () => {
                const [rect, area] = [(await box.boundingBox())!, await areaRect(designer)];
                return rect.y >= area.y - 1 && rect.y + rect.height <= area.y + area.height + 1;
            }, {message: "the box inside the area"}).toBe(true);
        });
});

test.describe("Print template: undo and redo @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work with the focus on the sheet; in a field the field's own undo runs, and the buttons still undo the layout @TPL-454",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await drag.release();
            await expect(box).toBeFocused();
            await expectMm(box, {x: 60, y: 40}, "dragged");

            await page.keyboard.press("Control+KeyZ");
            await expectMm(box, {x: 40, y: 20}, "Ctrl+Z on the box");
            await page.keyboard.press("Control+KeyY");
            await expectMm(box, {x: 60, y: 40}, "Ctrl+Y on the box");

            await designer.area.focus();
            await page.keyboard.press("Control+KeyZ");
            await expectMm(box, {x: 40, y: 20}, "Ctrl+Z on the area");
            await page.keyboard.press("Control+Shift+KeyZ");
            await expectMm(box, {x: 60, y: 40}, "Ctrl+Shift+Z on the area");

            // In a field the shortcut is the field's: the text goes back, the drag stays
            await box.click();
            const name = designer.field(pt.name);
            const before = await name.inputValue();
            await name.click();
            await name.press("End");
            await name.pressSequentially("ز");
            await expect(name).toHaveValue(`${before}ز`);
            await page.keyboard.press("Control+KeyZ");
            await expect(name).toHaveValue(before);
            await expectMm(box, {x: 60, y: 40}, "the field's undo leaves the layout");

            // The button still undoes the layout
            await designer.undo.click();
            await expectMm(box, {x: 40, y: 20}, "the button");
            await expect(name).toHaveValue(before);
        });

    test("history and a changed zoom: the question cancelled keeps them; leaving and returning, or reloading: undo and redo off, the zoom at Fit @TPL-568",
        async ({page, data, lang, t}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            const fit = (await designer.zoomPercent.textContent())!;
            const overviewTab = page.getByRole("tab", {name: t.tabOverview, exact: true});
            const printTab = page.getByRole("tab", {name: pt.tab, exact: true});
            const dragAway = async () => {
                const drag = await pressBox(page, designer, "m");
                await drag.toMm(60, 40);
                await drag.release();
                await expectMm(box, {x: 60, y: 40}, "dragged");
            };

            await dragAway();
            await zoomTo(designer, 100);

            await overviewTab.click();
            await expect(designer.question).toBeVisible();
            await designer.question.getByRole("button", {name: t.cancel, exact: true}).click();
            await expect(designer.question).toHaveCount(0);
            await expect(designer.undo, "the history stays").toBeEnabled();
            await expect(box, "the selection stays").toHaveAttribute("aria-pressed", "true");
            await expect(designer.zoomPercent, "the zoom stays").toHaveText("100%");
            await expectMm(box, {x: 60, y: 40}, "the edit stays");

            await overviewTab.click();
            await designer.question.getByRole("button", {name: pt.leave, exact: true}).click();
            await expect(designer.sheet).toHaveCount(0);
            await printTab.click();
            await designerShown(designer);
            await expectUntouched(designer);
            await expect(designer.redo).toBeDisabled();
            await expect(designer.zoomPercent, "Fit again").toHaveText(fit);
            await expectMm(box, {x: 40, y: 20}, "the saved place");

            // Reloading: with a step to undo and one to redo
            await dragAway();
            const again = await pressBox(page, designer, "m");
            await again.toMm(62, 50);
            await again.release();
            await designer.undo.click();
            await expect(designer.redo).toBeEnabled();
            await zoomTo(designer, 100);
            page.on("dialog", (dialog: Dialog) => void dialog.accept());
            await page.reload();
            await settled(page);
            await designerShown(designer);
            await expectUntouched(designer);
            await expect(designer.redo).toBeDisabled();
            await expect(designer.zoomPercent, "Fit again").toHaveText(fit);
        });
});
