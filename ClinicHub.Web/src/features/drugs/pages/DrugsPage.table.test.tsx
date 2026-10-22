import {describe, expect, test} from "vitest";
import {screen, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    adminCategoriesHandler,
    adminDrugsHandlers,
    anAdminCategory,
    anAdminDrug,
    anAdminSubCategory,
    aDrug,
    aPage,
    api,
    aSharedDrug,
    EYE,
    GLAUCOMA,
    manyDrugs,
    server,
    setViewportWidth,
} from "../../../test";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {ACNE, renderDrugsPage, rowOf, SKIN, subtitle} from "../../../test/pages/drugsPage.tsx";

// The drugs table (M1.7c contract § 3.4; design M1.7 D9 "Drugs page", "Numbers"): the category column in the UI
// language («العيون › المياه الزرقاء», the category alone without a subcategory: CAT-138, CAT-139; below `sm` the path
// under the name), own drugs' dosing sentence only (DRUG-105, table half), grouped Latin digits (I18N-026, the
// subtitles, the pagination and the admin counts; the tree's counts are tests-tree-ui's).

const DROPS_4X = {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4} as const;
const DROPS_4X_TEXT = "نقطة واحدة 4 مرات يوميًا";

describe("drugs table: the category column @area:catalog", () => {
    test("an own drug without a subcategory reads «العيون» alone, with no dangling « › » @CAT-139", async () => {
        await renderDrugsPage([aDrug({name: "Eyelid wipes", subCategory: null}), aDrug({name: "Tobradex"})]);
        const row = await rowOf("Eyelid wipes");
        expect(within(row).getByText("العيون", {exact: true})).toBeInTheDocument();
        expect(row.textContent).not.toContain("›");
        // The other row has its subcategory
        expect(within(await rowOf("Tobradex")).getByText("العيون › المياه الزرقاء")).toBeInTheDocument();
    });

    test("in English: \"Eye\" alone, and \"Eye › Glaucoma\" with a subcategory @CAT-139", async () => {
        await renderDrugsPage([aDrug({name: "Eyelid wipes", subCategory: null}), aDrug({name: "Tobradex"})], {lang: "en"});
        const row = await rowOf("Eyelid wipes");
        expect(within(row).getByText("Eye", {exact: true})).toBeInTheDocument();
        expect(row.textContent).not.toContain("›");
        expect(within(await rowOf("Tobradex")).getByText("Eye › Glaucoma")).toBeInTheDocument();
    });

    test("the header «التصنيف» names the column; a shared drug's path shows the same way @CAT-139", async () => {
        await renderDrugsPage([aSharedDrug({name: "NAILNER NAIL FUNGUS PEN 4 ML", category: SKIN, subCategory: null}),
            aSharedDrug({name: "ACNE GEL 30 GM", category: SKIN, subCategory: ACNE})]);
        expect(await screen.findByRole("columnheader", {name: "التصنيف"})).toBeInTheDocument();
        const nailner = await rowOf("NAILNER NAIL FUNGUS PEN 4 ML");
        expect(within(nailner).getByText("الجلدية", {exact: true})).toBeInTheDocument();
        expect(nailner.textContent).not.toContain("›");
        expect(within(await rowOf("ACNE GEL 30 GM")).getByText("الجلدية › حب الشباب")).toBeInTheDocument();
    });

    test("at 375 px the category column is hidden and the path shows under the drug's name, «العيون» alone without a subcategory @CAT-139",
        async () => {
            setViewportWidth(375);
            await renderDrugsPage([aDrug({name: "Eyelid wipes", subCategory: null}), aDrug({name: "Tobradex"})]);
            const row = await rowOf("Eyelid wipes");
            expect(screen.queryByRole("columnheader", {name: "التصنيف"})).not.toBeInTheDocument();
            expect(within(row).getByText("العيون", {exact: true})).toBeInTheDocument();
            expect(row.textContent).not.toContain("›");
            expect(within(await rowOf("Tobradex")).getByText("العيون › المياه الزرقاء")).toBeInTheDocument();
        });
});

describe("drugs table: the dosing sentence @area:catalog", () => {
    test("an own drug with a default dosing shows its sentence; a shared drug's row shows none, and no «لا توجد جرعة محددة» @DRUG-105",
        async () => {
            await renderDrugsPage([aDrug({name: "Tobradex", defaultDosing: DROPS_4X}), aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})]);
            expect(within(await rowOf("Tobradex")).getByText(DROPS_4X_TEXT)).toBeInTheDocument();
            const shared = await rowOf("VIGAMOX 0.5% EYE DROPS 5 ML");
            expect(within(shared).queryByText(DROPS_4X_TEXT)).not.toBeInTheDocument();
            expect(within(shared).queryByText("لا توجد جرعة محددة")).not.toBeInTheDocument();
            expect(screen.queryByText("لا توجد جرعة محددة")).not.toBeInTheDocument();
        });

    test("in English the own drug's sentence is still Arabic; the shared row has no Arabic sentence at all @DRUG-105", async () => {
        await renderDrugsPage([aDrug({name: "Tobradex", defaultDosing: DROPS_4X}), aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})], {lang: "en"});
        expect(within(await rowOf("Tobradex")).getByText(DROPS_4X_TEXT)).toBeInTheDocument();
        const shared = await rowOf("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(shared.querySelector("[lang=ar]")).toBeNull();
        expect(within(shared).queryByText("No dosing set")).not.toBeInTheDocument();
    });

    test("an own drug without a dosing shows no «لا توجد جرعة محددة» either (it is a prescription-line text) @DRUG-105", async () => {
        await renderDrugsPage([aDrug({name: "Tobradex"})]);
        await rowOf("Tobradex");
        expect(screen.queryByText("لا توجد جرعة محددة")).not.toBeInTheDocument();
    });
});

/** `GET /drugs` answering `count` drugs in total (20 on the page asked), for counts too large to build. */
const totalOf = (count: number) => http.get(api("/drugs"), ({request}) => {
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    const first = (page - 1) * pageSize;
    const items = Array.from({length: Math.max(0, Math.min(pageSize, count - first))}, (_, i) => aDrug({name: `Drug ${first + i + 1}`}));
    return HttpResponse.json(aPage(items, {totalCount: count, page, pageSize}));
});

describe("counts with grouped Latin digits @area:i18n", () => {
    test.each([
        ["ar", 1469, "1–20 من 1,469"],
        ["en", 1469, "1–20 of 1,469"],
        ["ar", 3394, "1–20 من 3,394"],
        ["en", 23417, "1–20 of 23,417"],
        ["ar", 23417, "1–20 من 23,417"],
    ] as const)("(%s) the drugs page: the subtitle and the pagination of %i drugs read with a thousands separator (%s) @I18N-026",
        async (lang, count, range) => {
            await renderDrugsPage([], {lang, handlers: [totalOf(count)]});
            expect(await screen.findByText(subtitle(new Intl.NumberFormat("en-US").format(count), lang))).toBeInTheDocument();
            expect(screen.getByText(range)).toBeInTheDocument();
        });

    test("the last page of 1,469 drugs: «1,461–1,469 من 1,469» @I18N-026", async () => {
        await renderDrugsPage(manyDrugs(1469), {route: "/drugs?page=74"});
        expect(await screen.findByText("1,461–1,469 من 1,469")).toBeInTheDocument();
        expect(screen.getByText(subtitle("1,469"))).toBeInTheDocument();
    });

    test.each([
        ["ar", "23,417 دواءً", "1–20 من 23,417"],
        ["en", "23,417 drugs", "1–20 of 23,417"],
    ] as const)("(%s) the admin drugs page: «%s» and «%s» @I18N-026", async (lang, title, range) => {
        server.use(adminCategoriesHandler([anAdminCategory({...EYE, subCategories: [anAdminSubCategory({...GLAUCOMA})]})]));
        server.use(...adminDrugsHandlers([anAdminDrug()]));
        server.use(http.get(api("/admin/drugs"), ({request}) => {
            const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
            return HttpResponse.json(aPage(Array.from({length: 20}, (_, i) => anAdminDrug({name: `SHARED ${i + 1}`})), {totalCount: 23417, page}));
        }));
        await renderAdmin("/admin/drugs", {lang});
        expect(await screen.findByText(title)).toBeInTheDocument();
        expect(screen.getByText(range)).toBeInTheDocument();
    });

    test.each([
        ["ar", "الأدوية: 3,394", "الأدوية: 1,469"],
        ["en", "Drugs: 3,394", "Drugs: 1,469"],
    ] as const)("(%s) the admin categories page: «%s» for the category, «%s» for its subcategory @I18N-026", async (lang, category, sub) => {
        server.use(adminCategoriesHandler([anAdminCategory({
            ...EYE, drugCount: 3394, subCategories: [anAdminSubCategory({...GLAUCOMA, drugCount: 1469}), anAdminSubCategory({drugCount: 1925, nameEn: "Dry eye", nameAr: "جفاف العين"})],
        })]));
        await renderAdmin("/admin/categories", {lang});
        expect(await screen.findByText(category)).toBeInTheDocument();
        expect(screen.getByText(sub)).toBeInTheDocument();
    });
});
