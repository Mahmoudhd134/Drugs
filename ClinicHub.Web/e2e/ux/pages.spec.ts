import {expect, signIn, test} from "../support/fixtures.ts";

/**
 * The groups list's card title is `noWrap` (cut with an ellipsis, `DrugGroupsPage`): whether that is intended is a
 * question to the user (e2e-ux questions), so it is neither asserted nor failed here.
 */
const CARD_TITLE = ".MuiCard-root .MuiTypography-noWrap";
import type {Lang} from "../support/texts.ts";
import {dialog, expectNoCutOrOverlap, fitsTheScreen, noHorizontalScroll, pageChecks, setLanguage, tourClinic, tourPages} from "../support/ux.ts";

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
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what, {ignore: CARD_TITLE});
            });
        });

    test("a 375 px phone in Arabic and English: no horizontal page scroll on the prescription, drugs, groups and group editor pages and their dialogs @UX-001 @I18N-006",
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
                            await expectNoCutOrOverlap(page.locator("main"), `${lang} ${what}`, {ignore: CARD_TITLE});
                        }
                    });
                    await expect(page.locator("html")).toHaveAttribute("lang", lang);
                });
            }
        });
});
