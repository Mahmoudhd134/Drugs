import type {Dialog, Page} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {expectToast} from "../support/ui.ts";
import {
    apiPath,
    areaScroll,
    COMPUTER_ONLY,
    expectMm,
    expectUntouched,
    getTemplate,
    ONE_LANGUAGE,
    openDesigner,
    openDesignerByTab,
    plainLayout,
    pressBox,
    pressEntry,
    pressHandle,
    scrollAreaTo,
    syntheticPointer,
    zoomTo,
} from "../support/print-template.ts";

/**
 * How a drag ends other than by a drop, and what it swallows meanwhile: step 3 design § 3 "Drag mechanics", contract § 3.4 "Cancel" and
 * § 3.5 "During a drag". Synthetic events only for what a real mouse can't produce (contract § 4.2).
 */

/** Pointer listeners on `window`, `document` and `body` added since now, less those removed. */
const watchPointerListeners = (page: Page) => page.evaluate(() => {
    const watched = window as unknown as { pointerListeners: number };
    watched.pointerListeners = 0;
    const isPointer = (type: string) => /pointer|mouse/.test(type);
    for (const target of [window, document, document.body] as EventTarget[]) {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        target.addEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]) => {
            if (isPointer(type)) watched.pointerListeners++;
            add(type, ...rest);
        };
        target.removeEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject | null, (boolean | EventListenerOptions)?]) => {
            if (isPointer(type)) watched.pointerListeners--;
            remove(type, ...rest);
        };
    }
});

const pointerListeners = (page: Page) => page.evaluate(() => (window as unknown as { pointerListeners: number }).pointerListeners);

/** A POP like the browser's button, without Playwright waiting for a navigation the router may undo (as in print-template-guard.spec.ts). */
const browserBack = (page: Page) => page.evaluate(() => history.back());

test.describe("Print template: a drag that doesn't end in a drop @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("before the release Save stays off; Esc: the item is back, no undo step, nothing was ever unsaved, leaving asks nothing @TPL-413 @TPL-530",
        async ({page, data, lang, t}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, plainLayout({xMm: 40.3}));
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await expectMm(box, {x: 60, y: 40}, "the preview");
            await expect(designer.save, "a drag doesn't touch the layout").toBeDisabled();

            await page.keyboard.press("Escape");
            await expectMm(box, {x: 40.3, y: 20}, "back");
            await drag.release();
            await expectMm(box, {x: 40.3, y: 20}, "after the release");
            await expectUntouched(designer);

            await page.getByRole("tab", {name: t.tabOverview, exact: true}).click();
            await expect(page).toHaveURL(new RegExp(`/admin/clinics/${clinic.id}$`));
            await expect(designer.question).toHaveCount(0);
        });

    test("a pointercancel during a drag: the item is back @TPL-414",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await expectMm(box, {x: 60, y: 40}, "the preview");
            await syntheticPointer(box, "pointercancel");
            await expectMm(box, {x: 40, y: 20}, "back");

            await drag.by(50, 50);
            await expectMm(box, {x: 40, y: 20}, "nothing follows the pointer");
            await drag.release();
            await expectMm(box, {x: 40, y: 20}, "after the release");
            await expect(box, "the selection stays").toHaveAttribute("aria-pressed", "true");
            await expectUntouched(designer);
        });

    test("an item dragged out of the window and released there: at the clamped edge, one undo step, no drag left running @TPL-510",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            const view = page.viewportSize()!;

            for (const [side, x, edge] of [["right", view.width + 200, 108], ["left", -200, 0]] as const) {
                await test.step(side, async () => {
                    const drag = await pressBox(page, designer, "m");
                    await drag.to({x, y: drag.start.y});
                    await drag.release();
                    await expectMm(box, {x: edge, y: 20, w: 40, h: 8}, "at the edge");

                    // No drag left running: the pointer back over the sheet, no button down
                    await page.mouse.move(drag.start.x, drag.start.y);
                    await page.mouse.move(drag.start.x + 40, drag.start.y + 40);
                    await expectMm(box, {x: edge, y: 20}, "nothing follows the pointer");

                    await designer.undo.click();
                    await expectMm(box, {x: 40, y: 20}, "one step back");
                    await expectUntouched(designer);
                });
            }
        });

    test("a panel drag released out of the window: nothing added, and the ghost goes @TPL-511",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.by(30, 0);
            await expect(designer.ghost).toBeVisible();
            await drag.to({x: -200, y: drag.start.y});
            await drag.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);
        });

    for (const [what, event] of [
        ["the pointer back with no button down", {type: "pointermove", init: {buttons: 0, button: -1}}],
        ["the capture lost with no pointerup", {type: "lostpointercapture", init: {}}],
    ] as const) {
        test(`a missed release, ${what}: the item is back, no step, nothing sticks to the pointer @TPL-512`,
            async ({page, data, lang}) => {
                test.skip(lang !== "ar", ONE_LANGUAGE);
                const {designer} = await openDesigner(page, data, lang, plainLayout());
                const box = designer.box("m");

                const drag = await pressBox(page, designer, "m");
                await drag.toMm(60, 40);
                await expectMm(box, {x: 60, y: 40}, "the preview");
                await syntheticPointer(box, event.type, {clientX: drag.now().x, clientY: drag.now().y, ...event.init});
                await expectMm(box, {x: 40, y: 20}, "back");

                await drag.release();
                await page.mouse.move(drag.start.x + 50, drag.start.y + 50);
                await expectMm(box, {x: 40, y: 20}, "nothing follows the pointer");
                await expectUntouched(designer);
            });
    }

    test("a pointercancel during a resize: the box is back exactly; during a panel drag: nothing added, no ghost @TPL-513",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout({xMm: 40.3, wMm: 40.7}));
            const box = designer.box("m");
            await box.click();

            const resize = await pressHandle(page, designer, "m", "e");
            await resize.toMm(110, 24);
            await expectMm(box, {x: 40.3, w: 69.7}, "the preview");
            await syntheticPointer(designer.handle("e"), "pointercancel");
            await expectMm(box, {x: 40.3, y: 20, w: 40.7, h: 8}, "back");
            await resize.release();
            await expectMm(box, {x: 40.3, y: 20, w: 40.7, h: 8}, "after the release");
            await expectUntouched(designer);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.toMm(60, 40);
            await expect(designer.ghost).toBeVisible();
            await syntheticPointer(designer.entry(pt.manualInput), "pointercancel");
            await expect(designer.ghost).toHaveCount(0);
            await drag.release();
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);
        });

    for (const kind of ["a box", "a panel entry"] as const) {
        test(`a drag of ${kind} when the session is lost and the designer unmounts: no ghost, no console error, user-select restored, no pointer listener left @TPL-514`,
            async ({page, data, lang, t, allowApiErrors}) => {
                test.skip(lang !== "ar", ONE_LANGUAGE);
                // The session lost as in another tab's logout: the next answer is a 401 and the refresh is refused
                allowApiErrors({status: 401, method: "PUT", path: /prescription-template$/});
                const {clinic, designer, pt} = await openDesigner(page, data, lang, plainLayout());
                await designer.box("m").click();
                await page.keyboard.press("ArrowRight");

                let answer = () => {};
                const held = new Promise<void>(resolve => { answer = resolve; });
                const unauthorized = {status: 401, contentType: "application/problem+json", json: {status: 401, code: "unauthorized"}};
                await page.route(`**${apiPath(clinic)}`, async route => {
                    if (route.request().method() !== "PUT") return route.continue();
                    await held;
                    return route.fulfill(unauthorized);
                });
                await page.route("**/api/v1/auth/refresh", route => route.fulfill(unauthorized));
                const sent = page.waitForRequest(request => request.method() === "PUT" && request.url().endsWith(apiPath(clinic)));
                await designer.save.click();
                await sent;

                await watchPointerListeners(page);
                const drag = kind === "a box" ? await pressBox(page, designer, "m") : await pressEntry(page, designer, pt.manualInput);
                await drag.toMm(60, 40);
                if (kind === "a box") {
                    await expectMm(designer.box("m"), {x: 60, y: 40}, "the preview");
                    await expect.poll(() => page.evaluate(() => document.body.style.userSelect)).toBe("none");
                } else {
                    await expect(designer.ghost).toBeVisible();
                }

                answer();
                await expect(page).toHaveURL(/\/login$/);
                await expect(designer.sheet).toHaveCount(0);
                await expect(designer.ghost).toHaveCount(0);
                expect(await page.evaluate(() => getComputedStyle(document.body).userSelect), "user-select restored").not.toBe("none");
                expect(await pointerListeners(page), "no pointer listener left").toBeLessThanOrEqual(0);

                // No error from a pointer still moving: the fixture fails the test on any console error
                await drag.by(40, 40);
                await drag.release();
                await expect(page.getByRole("button", {name: t.sendCode})).toBeVisible();
            });
    }

    test("a reload during a drag on a clean template: no leave prompt and no half-done position saved; Ctrl+A on a focused box changes nothing in the layout @TPL-522",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            const prompts: string[] = [];
            page.on("dialog", (dialog: Dialog) => {
                prompts.push(dialog.type());
                void dialog.accept();
            });

            await box.click();
            await expect(box).toBeFocused();
            await page.keyboard.press("Control+KeyA");
            await expectMm(box, {x: 40, y: 20, w: 40, h: 8}, "after Ctrl+A");
            await expectUntouched(designer);

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await expectMm(box, {x: 60, y: 40}, "the preview");
            await page.reload();
            await drag.release();
            await expect(box).toBeVisible();
            expect(prompts, "no leave prompt").toEqual([]);
            await expectMm(box, {x: 40, y: 20}, "after the reload");
            const saved = (await getTemplate(data, clinic))!.layout.items[1];
            expect([saved.xMm, saved.yMm]).toEqual([40, 20]);
        });

    test("Delete during a drag or a resize is ignored: the item stays, and the gesture goes on @TPL-523",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            await box.click();

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await page.keyboard.press("Delete");
            await expect(designer.boxes).toHaveCount(2);
            await drag.toMm(62, 50);
            await expectMm(box, {x: 62, y: 50}, "still following");
            await drag.release();
            await expectMm(box, {x: 62, y: 50}, "dropped");

            const resize = await pressHandle(page, designer, "m", "e");
            await resize.toMm(110, 54);
            await page.keyboard.press("Delete");
            await expect(designer.boxes).toHaveCount(2);
            await resize.toMm(116, 54);
            await expectMm(box, {x: 62, w: 54}, "still resizing");
            await resize.release();
            await expectMm(box, {x: 62, y: 50, w: 54, h: 8}, "resized");
        });

    test("Ctrl+Z and Ctrl+Y during a drag: the history doesn't change, the drag goes on, and a later Esc returns to the press position @TPL-525",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            await box.click();
            await page.keyboard.press("ArrowRight");
            await expectMm(box, {x: 41, y: 20}, "one step in the history");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await expectMm(box, {x: 60, y: 40}, "the preview");
            await page.keyboard.press("Control+KeyZ");
            await page.keyboard.press("Control+KeyY");
            await page.keyboard.press("Control+Shift+KeyZ");
            await expectMm(box, {x: 60, y: 40}, "the shortcuts change nothing");
            await drag.toMm(62, 50);
            await expectMm(box, {x: 62, y: 50}, "still following");

            await page.keyboard.press("Escape");
            await expectMm(box, {x: 41, y: 20}, "the press position");
            await drag.release();
            await expect(designer.redo, "nothing was undone").toBeDisabled();

            await designer.undo.click();
            await expectMm(box, {x: 40, y: 20}, "the step from before the drag");
            await expectUntouched(designer);
        });

    test("an arrow during a drag: the item doesn't jump and the area doesn't scroll @TPL-526",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await scrollAreaTo(designer, 0, 0);

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(32, 26);
            await expectMm(box, {x: 32, y: 26}, "the preview");
            const before = await areaScroll(designer);
            for (const key of ["ArrowDown", "ArrowDown", "ArrowRight", "Shift+ArrowDown", "Alt+ArrowUp"]) await page.keyboard.press(key);

            await expectMm(box, {x: 32, y: 26}, "no jump");
            expect(await areaScroll(designer), "no scroll").toEqual(before);
            await page.keyboard.press("Escape");
            await drag.release();
        });

    test("Esc in a drag ends it and the selection stays; with the button still held nothing restarts and the release changes nothing; a second Esc deselects @TPL-527",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            await box.click();

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await page.keyboard.press("Escape");
            await expectMm(box, {x: 40, y: 20}, "back");
            await expect(box, "the same press doesn't deselect").toHaveAttribute("aria-pressed", "true");

            await drag.toMm(62, 50);
            await expectMm(box, {x: 40, y: 20}, "moving doesn't restart it");
            await drag.release();
            await expectMm(box, {x: 40, y: 20}, "the release changes nothing");
            await expect(box).toHaveAttribute("aria-pressed", "true");
            await expectUntouched(designer);

            await page.keyboard.press("Escape");
            await expect(box).toHaveAttribute("aria-pressed", "false");
            await expect(designer.handles).toHaveCount(0);
        });

    test("Tab and Enter during a drag are swallowed: the focus stays, no request holds a mid-drag position, the page size doesn't change @TPL-528",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            const sent: string[] = [];
            page.on("request", request => {
                if (request.method() === "PUT" && request.url().endsWith(apiPath(clinic))) sent.push(request.postData() ?? "");
            });
            // Save is on, so an Enter reaching it would send
            await box.click();
            await page.keyboard.press("ArrowRight");
            await expect(designer.save).toBeEnabled();

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            for (const key of ["Tab", "Enter", "Tab", "Tab", "Shift+Tab", "Enter", "Space"]) await page.keyboard.press(key);
            await expect(box, "Tab is swallowed").toBeFocused();
            await expect(page.getByRole("listbox")).toHaveCount(0);
            await expect(designer.sheet).toHaveAttribute("style", /width: 148mm/);
            await expectMm(box, {x: 60, y: 40}, "the drag goes on");

            await page.keyboard.press("Escape");
            await drag.release();
            await expectMm(box, {x: 41, y: 20}, "back");
            expect(sent, "nothing was sent").toEqual([]);
        });

    test("a Save in flight and a drag ended before the answer: the item stays, Save is on and leaving asks; the baseline is what was sent @TPL-529",
        async ({page, data, lang, t}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");
            await box.click();
            await page.keyboard.press("ArrowRight");
            await expectMm(box, {x: 41, y: 20}, "the change being saved");

            let answer = () => {};
            const held = new Promise<void>(resolve => { answer = resolve; });
            await page.route(`**${apiPath(clinic)}`, async route => {
                if (route.request().method() === "PUT") await held;
                return route.continue();
            });
            const sent = page.waitForRequest(request => request.method() === "PUT" && request.url().endsWith(apiPath(clinic)));
            await designer.save.click();
            await sent;

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await drag.release();
            await expectMm(box, {x: 60, y: 40}, "dropped before the answer");

            answer();
            await expectToast(page, pt.saved);
            await expectMm(box, {x: 60, y: 40}, "after the answer");
            await expect(designer.save).toBeEnabled();
            const saved = (await getTemplate(data, clinic))!.layout.items[1];
            expect([saved.xMm, saved.yMm], "what was sent").toEqual([41, 20]);

            await page.getByRole("tab", {name: t.tabOverview, exact: true}).click();
            await expect(designer.question).toBeVisible();
            await designer.question.getByRole("button", {name: t.cancel, exact: true}).click();
            await expect(designer.question).toHaveCount(0);
        });

    test("the browser's Back during a drag: the drag ends with the item back; clean leaves, dirty asks; staying leaves nothing stuck to the pointer @TPL-532",
        async ({page, data, lang, t}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer, pt} = await openDesignerByTab(page, data, lang, plainLayout());
            const box = designer.box("m");
            const overview = new RegExp(`/admin/clinics/${clinic.id}$`);

            await test.step("clean: it leaves", async () => {
                const drag = await pressBox(page, designer, "m");
                await drag.toMm(60, 40);
                await expectMm(box, {x: 60, y: 40}, "the preview");
                await browserBack(page);
                await expect(page).toHaveURL(overview);
                await expect(designer.question).toHaveCount(0);
                await expect(designer.sheet).toHaveCount(0);
                await drag.release();
            });

            await page.getByRole("tab", {name: pt.tab, exact: true}).click();
            await expect(designer.sheet).toBeVisible();

            await test.step("dirty: it asks, on the layout before the drag", async () => {
                await box.click();
                await page.keyboard.press("ArrowRight");
                await expectMm(box, {x: 41, y: 20}, "the change before the drag");

                const drag = await pressBox(page, designer, "m");
                await drag.toMm(60, 40);
                await expectMm(box, {x: 60, y: 40}, "the preview");
                await browserBack(page);
                await expect(designer.question).toBeVisible();
                await expectMm(box, {x: 41, y: 20}, "back");
                await drag.release();

                await designer.question.getByRole("button", {name: t.cancel, exact: true}).click();
                await expect(designer.question).toHaveCount(0);
                await expect(page).not.toHaveURL(overview);
                await drag.by(60, 60);
                await expectMm(box, {x: 41, y: 20}, "nothing follows the pointer");
                await expect(designer.save).toBeEnabled();
            });
        });
});
