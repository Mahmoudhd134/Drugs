import {expect, signIn, test} from "../support/fixtures.ts";
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
                await expectNoCutOrOverlap((await open.count()) ? open : page.locator("main"), what);
            });
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
