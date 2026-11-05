import type {Locator} from "@playwright/test";
import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {visitCatalogAdmin} from "../support/admin-catalog.ts";
import {unique} from "../support/phones.ts";
import type {Lang} from "../support/texts.ts";
import {dialog, expectNoCutOrOverlap, expectNoDialog, fitsTheScreen, noHorizontalScroll, open, pageChecks, rxTab, setLanguage, tourClinic, tourPages} from "../support/ux.ts";
import {closeEditor, openEditor, openPrescription, printButton, printPopup} from "../support/print.ts";
import {designerOf, designerShown, layoutL, manualItem, tabPath, textItem} from "../support/print-template.ts";
import {RxPage} from "../support/rx.ts";
import {IMPORTED} from "../support/shared.ts";
import {RX_TEXTS, TREE_TEXTS} from "../support/texts-rx.ts";
import {DOSINGS} from "../support/texts-ux.ts";
import {DrugTreeUi} from "../support/tree.ts";

test.describe("Every page and dialog of the catalog and prescription @area:ux", () => {
    test("in the project's language: dir/lang, no horizontal scroll, no serious axe violation, no console error, no cut text or overlapping buttons @UX-036 @I18N-006",
        async ({page, data}) => {
            // Many pages and scans: three times the usual time
            test.slow();
            const tour = await tourClinic(data);
            await signIn(page, tour.clinic.owner.phone);

            await tourPages(page, tour, async what => {
                await pageChecks(page, what);
                const open = dialog(page);
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what);
            });
        });

    test("the drug tree (prescription, protocol editor; categories, then a subcategory open) and a shared drug's read-only details: dir/lang, no horizontal scroll, no serious axe violation, no console error, no cut text @UX-036 @I18N-006",
        async ({page, t, lang, data}) => {
            test.slow();
            const tour = await tourClinic(data);
            await signIn(page, tour.clinic.owner.phone, "asIs", "/drugs?view=list");
            const check = async (what: string) => {
                await pageChecks(page, what);
                const open = dialog(page);
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what);
            };

            await page.getByPlaceholder(t.searchDrugs).fill(IMPORTED.vigamox);
            await page.getByRole("row").filter({has: page.getByText(IMPORTED.vigamox, {exact: true})}).getByRole("cell").first().click();
            await expect(page.getByRole("dialog", {name: t.drugDetails})).toBeVisible();
            await check("read-only details");
            await page.getByRole("dialog", {name: t.drugDetails}).getByRole("button", {name: t.close}).click();
            await expect(page.getByRole("dialog")).toHaveCount(0);

            const tree = new DrugTreeUi(page, page.locator("main"), TREE_TEXTS[lang]);
            await open(page, "/");
            await rxTab(page, t, "drugs");
            await expect(tree.rows(1).first()).toBeVisible();
            await tree.settle();
            await check("prescription drug tree");
            await tree.show(tour.latin.name);
            await check("prescription drug tree with a subcategory open");

            await open(page, `/protocols/${tour.protocol.id}`);
            await expect(tree.rows(1).first()).toBeVisible();
            await tree.show(tour.taper.name);
            await check("protocol editor's drug tree with a subcategory open");
        });

    test("the admin drugs and categories pages and their dialogs: dir/lang, no horizontal scroll, no serious axe violation, no console error, no cut text @UX-036 @I18N-006",
        async ({page, t, lang}) => {
            test.slow();
            await signInSuperAdmin(page, "/admin");
            await visitCatalogAdmin(page, t, lang, async what => {
                await pageChecks(page, what);
                const open = dialog(page);
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what);
            });
        });

    test("the print template designer and its question, or the phone's message: dir/lang, no horizontal scroll, no serious axe violation, no console error, no cut text @UX-036 @I18N-006",
        async ({page, t, lang, data, isMobile}) => {
            test.slow();
            const clinic = await data.clinic();
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));

            if (isMobile) {
                const message = page.getByRole("alert").filter({hasText: pt.desktopOnly});
                await expect(message).toBeVisible();
                await pageChecks(page, "the designer's message on a phone");
                await expectNoCutOrOverlap(message, "the designer's message on a phone");
                return;
            }

            const check = async (what: string) => {
                await pageChecks(page, what);
                const open = dialog(page);
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what);
            };
            await expect(designer.create).toBeVisible();
            await check("the designer's empty state");
            await designer.create.click();
            await designerShown(designer);
            await designer.entry(pt.manualInput).click();
            await check("the designer with an item selected");
            await page.getByRole("tab", {name: t.tabOverview, exact: true}).click();
            await expect(designer.question).toBeVisible();
            await check("the designer's question");
            await designer.question.getByRole("button", {name: pt.leave, exact: true}).click();
            await expect(designer.question).toHaveCount(0);
        });

    test("the page with Print, the editor with Print and the print pop-up, in the project's language and on a phone in both: dir/lang, no horizontal scroll, no serious axe violation, no console error, no cut text @UX-036 @I18N-006 @TPL-348",
        async ({page, data, lang, isMobile}) => {
            test.slow();
            const manual = manualItem({name: "الاسم بالكامل كما في البطاقة"});
            const {rx: first} = await openPrescription(page, data, lang, layoutL({items: [textItem(), manual, manualItem({id: "m2", name: "السن", yMm: 56})]}), [
                {name: `Tobradex ${unique()}`, dosing: DOSINGS.oneDropFour.dosing},
            ]);
            await expect(first.lines).toHaveCount(1);

            for (const language of isMobile ? ["en", "ar"] as Lang[] : [lang]) {
                await test.step(language, async () => {
                    await setLanguage(page, language);
                    const rt = RX_TEXTS[language];
                    const rx = new RxPage(page, rt);
                    const check = async (what: string, scope: Locator) => {
                        await pageChecks(page, `${language} ${what}`);
                        await expectNoCutOrOverlap(scope, `${language} ${what}`);
                    };

                    await expect(printButton(rx.panel, rt)).toBeEnabled();
                    await check("the page with Print", page.locator("main"));

                    const popup = printPopup(page, rt);
                    await printButton(rx.panel, rt).click();
                    await expect(popup.getByRole("textbox", {name: manual.name, exact: true})).toBeVisible();
                    await check("the pop-up", popup);
                    await fitsTheScreen(page, popup, `${language} the pop-up`);
                    await popup.getByRole("button", {name: rt.cancel, exact: true}).click();
                    await expectNoDialog(page);

                    const editor = await openEditor(page, rt);
                    await expect(printButton(editor, rt)).toBeEnabled();
                    await check("the editor with Print", editor);
                    await printButton(editor, rt).click();
                    await expect(popup.getByRole("textbox", {name: manual.name, exact: true})).toBeVisible();
                    await check("the pop-up over the editor", popup);
                    await popup.getByRole("button", {name: rt.cancel, exact: true}).click();
                    await expect(popup).toBeHidden();
                    await closeEditor(editor, rt);
                });
            }
        });

    test("a 375 px phone in Arabic and English: no horizontal page scroll on the prescription, drugs, protocols and protocol editor pages and their dialogs @UX-001 @I18N-006",
        async ({page, data, isMobile}) => {
            test.slow();
            test.skip(!isMobile, "the phone project");
            const tour = await tourClinic(data);
            await signIn(page, tour.clinic.owner.phone);

            for (const lang of ["en", "ar"] as Lang[]) {
                await test.step(lang, async () => {
                    await setLanguage(page, lang);
                    await tourPages(page, tour, async what => {
                        await noHorizontalScroll(page, `${lang} ${what}`);
                        const open = dialog(page);
                        if (await open.count()) {
                            await fitsTheScreen(page, open, `${lang} ${what} dialog`);
                            await expectNoCutOrOverlap(open, `${lang} ${what}`);
                        } else {
                            await expectNoCutOrOverlap(page.locator("main"), `${lang} ${what}`);
                        }
                    });
                    await expect(page.locator("html")).toHaveAttribute("lang", lang);
                });
            }
        });
});
