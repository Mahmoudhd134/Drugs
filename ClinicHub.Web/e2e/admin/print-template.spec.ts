import {expect, settled, signInSuperAdmin, test} from "../support/fixtures.ts";
import {expectToast} from "../support/ui.ts";
import type {Lang} from "../support/texts.ts";
import {TEXTS} from "../support/texts.ts";
import {
    A4,
    designerOf,
    designerShown,
    expectClose,
    getTemplate,
    inlineStyle,
    layoutL,
    manualItem,
    placeOf,
    PT_TEXTS,
    putTemplate,
    staticItem,
    tabPath,
    textItem,
    typeInto,
} from "../support/print-template.ts";
import {expectNoCutOrOverlap, expectNotCut, fitsTheScreen, noHorizontalScroll, pageChecks, setLanguage} from "../support/ux.ts";

/** The print template designer through the real app and API: contract § 3; prescription-templates.business.md. */

test.describe("Print template: designing @area:admin", () => {
    test("a template built on the screen and saved shows as saved after a reload, in order, and the API holds it @TPL-051 @smoke",
        async ({page, data, lang, isMobile, healthy}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));

            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
            await designer.create.click();
            await designerShown(designer);
            await expect(designer.boxes).toHaveCount(1);
            await expect(designer.box("i1")).toContainText(pt.sampleText);

            await designer.paperSize.click();
            await page.getByRole("option", {name: pt.sizeA4, exact: true}).click();

            await designer.entry(pt.manualInput).click();
            await designer.field(pt.name).fill("السن");
            await designer.field(pt.x).fill("30.5");
            await designer.field(pt.y).fill("20");

            await designer.entry(pt.staticText).click();
            await designer.field(pt.text).fill("يُصرف مرة واحدة\nسطر ثان");
            await designer.field(pt.fontSize).fill("14");

            await designer.entry(pt.fullDate).click();

            await page.getByRole("button", {name: TEXTS[lang].save, exact: true}).click();
            await expectToast(page, pt.saved);

            await page.reload();
            await settled(page);
            await designerShown(designer);

            await expect(page.getByTestId("template-sheet")).toHaveAttribute("style", /width: 210mm/);
            await expect(page.getByTestId("template-sheet")).toHaveAttribute("style", /height: 297mm/);
            await expect(designer.boxes).toHaveCount(4);
            const ids = await designer.boxes.evaluateAll(boxes => boxes.map(box => (box as HTMLElement).dataset.itemId));
            expect(ids).toEqual(["i1", "i2", "i3", "i4"]);
            await expect(designer.box("i2")).toHaveText("السن");
            expect(await inlineStyle(designer.box("i2"), "left")).toBe("30.5mm");
            expect(await inlineStyle(designer.box("i2"), "top")).toBe("20mm");
            await expect(designer.box("i3")).toContainText("يُصرف مرة واحدة");
            await expect(designer.box("i3")).toContainText("سطر ثان");
            expect(await inlineStyle(designer.box("i3"), "fontSize")).toBe("14pt");

            const saved = await getTemplate(data, clinic);
            expect(saved?.layout.page).toEqual(A4);
            expect(saved?.layout.items.map(item => item.kind)).toEqual(["prescriptionText", "manualInput", "staticText", "function"]);
            expect(saved?.layout.items[2].text).toBe("يُصرف مرة واحدة\nسطر ثان");
            await healthy();
        });

    test("«حذف» confirmed through the real API: the empty state after a reload too @TPL-051",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            await page.getByRole("button", {name: TEXTS[lang].delete, exact: true}).click();
            await designer.deleteQuestion.getByRole("button", {name: TEXTS[lang].delete, exact: true}).click();
            await expectToast(page, pt.deleted);
            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
            expect(await getTemplate(data, clinic)).toBeUndefined();

            await page.reload();
            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
        });

    test("Arabic and English: X and Y mean the same physical place; the panel and the settings flip, the sheet doesn't @TPL-054",
        async ({page, data, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL({items: [textItem(), manualItem({xMm: 20, yMm: 30, wMm: 50, hMm: 10})]}));
            await signInSuperAdmin(page, tabPath(clinic));

            const seen: Record<string, { x: number; y: number; w: number; h: number }> = {};
            const panelIsLeftOfSheet: Record<string, boolean> = {};
            for (const lang of ["ar", "en"] as Lang[]) {
                await test.step(lang, async () => {
                    await setLanguage(page, lang);
                    const designer = designerOf(page, lang);
                    await designerShown(designer);
                    await expect(designer.sheet).toHaveAttribute("dir", "ltr");
                    seen[lang] = await placeOf(designer.box("m"), designer.sheet);
                    expectClose(seen[lang], {x: 20, y: 30, w: 50, h: 10}, `${lang}: the box on the sheet`);
                    const panel = (await designer.panel.boundingBox())!;
                    const area = (await designer.area.boundingBox())!;
                    panelIsLeftOfSheet[lang] = panel.x < area.x;
                    const settings = (await designer.settings.boundingBox())!;
                    // Three columns at 1280 px: the panel on the UI's start, the settings on its end
                    expect(settings.x < area.x, `${lang}: the settings are on the other side`).toBe(!panelIsLeftOfSheet[lang]);
                });
            }
            expectClose(seen.ar, seen.en, "the same place in both languages");
            expect(panelIsLeftOfSheet).toEqual({ar: false, en: true});
        });

    test("in the project's language at desktop width: axe and the cut-text check pass, with each kind selected and in each dialog @TPL-056",
        async ({page, data, lang, isMobile}) => {
            test.slow();
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            const designer = designerOf(page, lang);
            const {pt} = designer;
            const check = async (what: string) => {
                await pageChecks(page, what);
                const dialog = page.getByRole("dialog");
                await expectNoCutOrOverlap((await dialog.count()) ? dialog : page.locator("main"), what);
            };
            await signInSuperAdmin(page, tabPath(clinic));
            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
            await check("the empty state");

            await designer.create.click();
            await designerShown(designer);
            await check("a new sheet");

            await designer.entry(pt.manualInput).click();
            await check("a manual input selected");
            await designer.entry(pt.fullDate).click();
            await check("a function selected");
            await designer.entry(pt.staticText).click();
            await designer.field(pt.text).fill("نص ثابت");
            await check("a static text selected");
            await designer.box("i1").click();
            await check("the prescription text selected");

            await designer.paperSize.click();
            await page.getByRole("option", {name: pt.sizeCustom, exact: true}).click();
            await check("a custom size");

            await designer.field(pt.x).fill("500");
            await expect(designer.settings.getByText(pt.outside, {exact: true})).toBeVisible();
            await check("a field's message");
            await designer.field(pt.x).fill("14");

            await page.getByRole("button", {name: TEXTS[lang].save, exact: true}).click();
            await expectToast(page, pt.saved);

            await page.getByRole("button", {name: TEXTS[lang].delete, exact: true}).click();
            await expect(designer.deleteQuestion).toBeVisible();
            await check("the delete question");
            await designer.deleteQuestion.getByRole("button", {name: TEXTS[lang].cancel, exact: true}).click();
            await expect(designer.deleteQuestion).toHaveCount(0);

            await designer.field(pt.x).fill("15");
            await page.getByRole("tab", {name: TEXTS[lang].tabOverview}).click();
            await expect(designer.question).toBeVisible();
            await check("the unsaved question");
            await designer.question.getByRole("button", {name: TEXTS[lang].cancel, exact: true}).click();
        });

    test("in the Arabic UI, 12.5, 12,5 and «١٢٫٥» are each 12.5, never 125 or 0 @TPL-225",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile || lang !== "ar", "the Arabic UI on a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await designer.box("m").click();

            for (const typed of ["12.5", "12,5", "١٢٫٥"]) {
                await test.step(typed, async () => {
                    await typeInto(designer.field(pt.x), typed);
                    await expect.poll(() => inlineStyle(designer.box("m"), "left")).toBe("12.5mm");
                    await designer.field(pt.y).click();
                    await expect(designer.field(pt.x)).toHaveValue("12.5");
                });
            }

            await page.getByRole("button", {name: TEXTS.ar.save, exact: true}).click();
            await expectToast(page, pt.saved);
            expect((await getTemplate(data, clinic))?.layout.items[1].xMm).toBe(12.5);
        });

    test("a custom 420 x 600 mm page at 1280 px: it scrolls inside its own area, the panels stay reachable, the far corner can be selected, the page has no sideways scroll @TPL-227",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, {
                schemaVersion: 1,
                page: {size: "custom", widthMm: 420, heightMm: 600},
                items: [textItem(), manualItem({xMm: 380, yMm: 592, wMm: 40, hMm: 8})],
            });
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            const scroll = await designer.area.evaluate(area => ({
                x: area.scrollWidth > area.clientWidth,
                y: area.scrollHeight > area.clientHeight,
            }));
            expect(scroll).toEqual({x: true, y: true});
            await noHorizontalScroll(page, "420 x 600");
            expectClose(await placeOf(designer.box("m"), designer.sheet), {x: 380, y: 592, w: 40, h: 8}, "the far corner's box");

            await designer.box("m").click();
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
            await expect(designer.field(pt.x)).toHaveValue("380");
            await expect(designer.field(pt.y)).toHaveValue("592");
            await noHorizontalScroll(page, "420 x 600, the far corner selected");

            // The panels are still on screen, in the 1280 px window, after the sheet scrolled
            for (const panel of [designer.panel, designer.settings]) {
                const box = (await panel.boundingBox())!;
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(1280);
            }
            await designer.entry(pt.manualInput).click();
            await expect(designer.boxes).toHaveCount(3);
        });

    test("a box of 50 x 20 mm measures the same in the designer and in print layout, within 0.1 mm @TPL-228",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL({items: [textItem(), manualItem({xMm: 20, yMm: 30, wMm: 50, hMm: 20})]}));
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            const expected = {x: 20, y: 30, w: 50, h: 20};
            expectClose(await placeOf(designer.box("m"), designer.sheet), expected, "on the screen");
            // A selected box has an inset shadow, never a border: it stays exactly its size
            await designer.box("m").click();
            expectClose(await placeOf(designer.box("m"), designer.sheet), expected, "selected");

            await page.emulateMedia({media: "print"});
            expectClose(await placeOf(designer.box("m"), designer.sheet), expected, "in print layout");
            await page.emulateMedia({media: "screen"});
        });

    test("a 60-character unbroken name and a 1,000-character static text in small boxes: the sheet shows them past the box, unclipped; the settings keep their width; no sideways scroll @TPL-239",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            const name = "W".repeat(60);
            const text = "word ".repeat(200).trimEnd().padEnd(1000, "x");
            await putTemplate(data, clinic, {
                schemaVersion: 1,
                page: A4,
                items: [
                    textItem({xMm: 90, yMm: 10, wMm: 100, hMm: 90}),
                    manualItem({name, xMm: 14, yMm: 250, wMm: 60, hMm: 8}),
                    staticItem({text, xMm: 14, yMm: 10, wMm: 60, hMm: 8, fontSizePt: 11}),
                ],
            });
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            const shape = (id: string) => designer.box(id).evaluate(box => {
                const content = box.querySelector("span")!;
                const b = box.getBoundingClientRect();
                const c = content.getBoundingClientRect();
                const sheet = box.closest("[data-testid=template-sheet]")!.getBoundingClientRect();
                return {
                    boxHeight: b.height, contentHeight: c.height, contentOverflow: content.scrollWidth - content.clientWidth,
                    insideSheet: c.bottom <= sheet.bottom, overflow: getComputedStyle(box).overflow, text: content.textContent,
                };
            });

            for (const [id, shown] of [["m", name], ["s", text]] as const) {
                await test.step(id, async () => {
                    const measured = await shape(id);
                    expect(measured.text).toBe(shown);
                    expect(measured.overflow).toBe("visible");
                    expect(measured.contentHeight, "it shows past the box").toBeGreaterThan(measured.boxHeight);
                    // The content is as wide as its box by its own style: only what sticks out of it shows a line that didn't wrap
                    expect(measured.contentOverflow, "it wraps inside the box's width").toBeLessThanOrEqual(1);
                    expect(measured.insideSheet, "no line lost at the sheet's edge").toBe(true);
                });
            }
            await noHorizontalScroll(page, "long texts on the sheet");

            const settingsFit = () => designer.settings.evaluate(panel => panel.scrollWidth - panel.clientWidth);
            await designer.box("m").click({position: {x: 5, y: 5}});
            await expect(designer.field(pt.name)).toHaveValue(name);
            expect(await settingsFit()).toBeLessThanOrEqual(0);
            await noHorizontalScroll(page, "the long name in the settings");

            await designer.box("s").click({position: {x: 5, y: 5}});
            await expect(designer.field(pt.text)).toHaveValue(text);
            expect(await settingsFit()).toBeLessThanOrEqual(0);
            const wrapped = await designer.field(pt.text).evaluate(area => area.scrollWidth - area.clientWidth);
            expect(wrapped, "the text wraps in its field").toBeLessThanOrEqual(0);
            await noHorizontalScroll(page, "the long text in the settings");
        });
});

test.describe("Print template: a computer only @area:admin", () => {
    test("at 375 px the message and no designer; at 1280 px the designer @TPL-053",
        async ({page, data, lang, isMobile}) => {
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));

            if (isMobile) {
                await expect(page.getByRole("alert").filter({hasText: pt.desktopOnly})).toBeVisible();
                await expect(designer.sheet).toHaveCount(0);
                await expect(designer.panel).toHaveCount(0);
                await expect(page.getByRole("button", {name: TEXTS[lang].save, exact: true})).toHaveCount(0);
            } else {
                await designerShown(designer);
                await expect(page.getByText(pt.desktopOnly, {exact: true})).toHaveCount(0);
            }
        });

    test("the window narrowed to 899 px shows the message; at 900 px the designer again @TPL-053",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "resizes a computer's window");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);

            await page.setViewportSize({width: 899, height: 800});
            await expect(page.getByText(designer.pt.desktopOnly, {exact: true})).toBeVisible();
            await expect(designer.sheet).toHaveCount(0);

            await page.setViewportSize({width: 900, height: 800});
            await designerShown(designer);
            await expect(page.getByText(designer.pt.desktopOnly, {exact: true})).toHaveCount(0);
            await noHorizontalScroll(page, "the designer at 900 px");
            await expectNoCutOrOverlap(page.locator("main"), "the designer at 900 px");
            const area = (await designer.area.boundingBox())!;
            const settings = (await designer.settings.boundingBox())!;
            expect(settings.y, "the settings sit below the sheet's area").toBeGreaterThanOrEqual(area.y + area.height);
        });

    test("375 px in both languages: the four clinic tabs are reachable, the message wraps, no horizontal scroll @TPL-246",
        async ({page, data, isMobile}) => {
            test.skip(!isMobile, "the phone project");
            const clinic = await data.clinic();
            await signInSuperAdmin(page, tabPath(clinic));

            for (const lang of ["ar", "en"] as Lang[]) {
                await test.step(lang, async () => {
                    await setLanguage(page, lang);
                    const t = TEXTS[lang];
                    const pt = PT_TEXTS[lang];
                    const message = page.getByRole("alert").filter({hasText: pt.desktopOnly});

                    await expect(message).toBeVisible();
                    await fitsTheScreen(page, message, `${lang} the message`);
                    await expectNotCut(message, `${lang} the message`);
                    await noHorizontalScroll(page, `${lang} the print template tab`);
                    // The message's own text: on a phone the tabs scroll inside their row, which is how they stay reachable
                    await expectNoCutOrOverlap(message, `${lang} the print template tab`);

                    for (const [name, path] of [
                        [t.tabOverview, `/admin/clinics/${clinic.id}`],
                        [t.tabRoles, `/admin/clinics/${clinic.id}/roles`],
                        [t.tabStaff, `/admin/clinics/${clinic.id}/staff`],
                        [pt.tab, tabPath(clinic)],
                    ] as const) {
                        await page.getByRole("tab", {name, exact: true}).click();
                        await expect(page).toHaveURL(new RegExp(`${path}$`));
                        await expect(page.getByRole("tab", {name, exact: true})).toHaveAttribute("aria-selected", "true");
                        await noHorizontalScroll(page, `${lang} ${name}`);
                    }
                });
            }
        });
});

test.describe("Print template: the clinic page's tabs @area:admin", () => {
    test("the four tabs each have a URL, and a reload keeps the tab @ADM-098",
        async ({page, data, lang, t}) => {
            const clinic = await data.clinic();
            const pt = PT_TEXTS[lang];
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}`);
            await expect(page.getByRole("tablist").getByRole("tab")).toHaveText([t.tabOverview, t.tabRoles, t.tabStaff, pt.tab]);

            for (const [name, path] of [
                [t.tabRoles, `/admin/clinics/${clinic.id}/roles`],
                [t.tabStaff, `/admin/clinics/${clinic.id}/staff`],
                [pt.tab, tabPath(clinic)],
                [t.tabOverview, `/admin/clinics/${clinic.id}`],
            ] as const) {
                await test.step(name, async () => {
                    await page.getByRole("tab", {name, exact: true}).click();
                    await expect(page).toHaveURL(new RegExp(`${path}$`));
                    await page.reload();
                    await expect(page).toHaveURL(new RegExp(`${path}$`));
                    await expect(page.getByRole("tab", {name, exact: true})).toHaveAttribute("aria-selected", "true");
                });
            }
        });
});
