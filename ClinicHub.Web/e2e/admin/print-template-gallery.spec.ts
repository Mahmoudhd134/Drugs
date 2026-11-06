import {expect, settled, signInSuperAdmin, test} from "../support/fixtures.ts";
import type {Lang} from "../support/texts.ts";
import {TEXTS} from "../support/texts.ts";
import {recordRequests} from "../support/ui.ts";
import {
    A5,
    dateItem,
    designerOf,
    designerShown,
    manualItem,
    PT_TEXTS,
    putTemplate,
    staticItem,
    tabPath,
    textItem,
} from "../support/print-template.ts";
import {animationsDone, open, setLanguage} from "../support/ux.ts";

/**
 * The ready report's screenshot gallery of the print template designer: the shots are attachments, which reach the merged
 * report of the `e2e-report` artifact. Each shot's texts are asserted first, so a wrong screen fails instead of being pictured.
 */

/** Every box inside the part of the sheet a 1280 x 1100 window shows. */
const LAYOUT = {
    schemaVersion: 1 as const,
    page: A5,
    items: [
        textItem({xMm: 14, yMm: 30, wMm: 120, hMm: 80}),
        manualItem({xMm: 58, yMm: 14, wMm: 76, hMm: 8}),
        dateItem({xMm: 14, yMm: 14, wMm: 40, hMm: 8}),
        staticItem({xMm: 14, yMm: 118, wMm: 120, hMm: 8}),
    ],
};

/** The rule's message on an empty name (errors.nameRequired). */
const NAME_REQUIRED = "الاسم مطلوب.";

test.describe("Print template: the screenshot gallery @area:admin", () => {
    test("the designer's screens in Arabic, in English and at 375 px, each with its texts on screen @TPL-056",
        async ({page, data, lang, isMobile}, testInfo) => {
            test.skip(isMobile || lang !== "ar", "one run: the test sets the language and the width itself");
            // Tall enough for the selected item's fields below step 4's sections, with no scroll: the shot shows them with the sheet
            await page.setViewportSize({width: 1280, height: 1100});
            const clinic = await data.clinic();

            const shot = async (name: string) => {
                await page.evaluate(() => document.fonts.ready.then(() => undefined));
                await animationsDone(page);
                await testInfo.attach(name, {body: await page.screenshot(), contentType: "image/png"});
            };

            const expectDesigner = async (shown: Lang) => {
                const designer = designerOf(page, shown);
                const {pt} = designer;
                await designerShown(designer);
                await designer.box("m").click();
                await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
                await expect(designer.boxes).toHaveCount(4);
                await expect(designer.box("t")).toContainText(pt.sampleText);
                await expect(designer.box("m")).toHaveText("الاسم");
                await expect(designer.box("f")).toHaveText("التاريخ");
                await expect(designer.box("s")).toHaveText("يُصرف مرة واحدة");
                for (const id of ["t", "m", "f", "s"]) await expect(designer.box(id)).toBeInViewport();
                await expect(designer.entry(pt.manualInput)).toBeInViewport();
                await expect(designer.paperSize).toHaveText("A5");
                await expect(designer.settings.getByText(pt.manualInput, {exact: true})).toBeInViewport();
                await expect(designer.field(pt.name)).toHaveValue("الاسم");
            };

            const expectDesktopOnly = async (shown: Lang) => {
                await setLanguage(page, shown);
                const {pt, sheet} = designerOf(page, shown);
                await expect(page.locator("html")).toHaveAttribute("dir", shown === "ar" ? "rtl" : "ltr");
                await expect(page.getByRole("alert").filter({hasText: pt.desktopOnly})).toBeInViewport();
                await expect(sheet).toHaveCount(0);
                await expect(page.getByRole("tab", {name: pt.tab, exact: true})).toHaveAttribute("aria-selected", "true");
            };

            await signInSuperAdmin(page, tabPath(clinic));
            const designer = designerOf(page, "ar");
            const {pt} = designer;
            await expect(page.getByText(pt.empty, {exact: true})).toBeInViewport();
            await expect(designer.create).toBeInViewport();
            await shot("01-ar-empty");

            await putTemplate(data, clinic, LAYOUT);
            await page.reload();
            await settled(page);
            await expectDesigner("ar");
            await shot("02-ar-designer");

            const puts = recordRequests(page, "PUT", /\/prescription-template$/);
            await designer.field(pt.name).fill("");
            await page.getByRole("button", {name: TEXTS.ar.save, exact: true}).click();
            await expect(designer.settings.getByText(NAME_REQUIRED, {exact: true})).toBeInViewport();
            await expect(designer.field(pt.name)).toHaveAttribute("aria-invalid", "true");
            await shot("03-ar-validation");
            await expect(page.getByText(pt.saved, {exact: true})).toHaveCount(0);
            expect(puts, "the Save was refused on the screen").toHaveLength(0);

            await page.getByRole("tab", {name: TEXTS.ar.tabOverview, exact: true}).click();
            await expect(designer.question).toBeVisible();
            await expect(designer.question.getByRole("button")).toHaveText([TEXTS.ar.cancel, pt.leave]);
            await shot("04-ar-unsaved");
            await designer.question.getByRole("button", {name: pt.leave, exact: true}).click();
            await expect(designer.question).toHaveCount(0);
            await expect(page).toHaveURL(new RegExp(`/admin/clinics/${clinic.id}$`));
            await expect(designer.sheet).toHaveCount(0);
            await settled(page);

            await setLanguage(page, "en");
            await open(page, tabPath(clinic));
            await expectDesigner("en");
            await expect(page.getByRole("button", {name: TEXTS.en.save, exact: true})).toBeDisabled();
            await expect(page.getByRole("tab", {name: PT_TEXTS.en.tab, exact: true})).toHaveAttribute("aria-selected", "true");
            await shot("05-en-designer");

            await page.setViewportSize({width: 375, height: 812});
            await expectDesktopOnly("ar");
            await shot("06-ar-phone");

            await expectDesktopOnly("en");
            await shot("07-en-phone");
        });
});
