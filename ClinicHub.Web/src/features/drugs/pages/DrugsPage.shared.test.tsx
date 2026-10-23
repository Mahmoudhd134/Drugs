import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    alignedSide,
    api,
    ARABIC_DRUG_NAME,
    aSharedDrug,
    DIGITS_FIRST_NAME,
    drugsHandlers,
    blockOf,
    expectOwnDirection,
    lineOf,
    recordRequests,
    renderWithProviders,
    server,
    toastTexts,
} from "../../../test";
import type {Permission} from "../../access/permissions.ts";
import type {Drug} from "../types.ts";
import {DrugsPage} from "./DrugsPage.tsx";

// Shared rows on the drugs page (design M1.7 D6, D9; M1.7b contract "Drugs page (7b part only)"): no ✎/🗑, a click
// opens the read-only details (title «تفاصيل الدواء», rows name / «المادة الفعالة» / «التصنيف: …» / description,
// empty rows hidden, one «إغلاق»), `GET /drugs/{id}/protocols` never called for a shared row.

const openDrugs = async (drugs: Drug[], permissions?: Permission[]) => {
    server.use(...drugsHandlers(drugs));
    const rendered = await renderWithProviders(<DrugsPage/>, {lang: "ar", route: "/drugs?view=list", user: permissions ? {permissions} : undefined});
    await screen.findByText(drugs[0].name);
    return rendered;
};

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

/** The texts of the details' rows (decision D23: «المادة الفعالة: …» and «التصنيف: …» are lines of their own). */
const detailRows = (details: HTMLElement, name: string) =>
    Array.from(within(details).getByText(name).parentElement!.children).map(row => row.textContent);

describe("drugs page: a shared drug's read-only details @area:catalog", () => {
    test("a shared drug without ingredients or description: those rows are hidden, never an empty label or \"null\" @CAT-035", async () => {
        const nailner = aSharedDrug({name: "NAILNER NAIL FUNGUS PEN 4 ML", activeIngredients: null, description: null, subCategory: null});
        const {user} = await openDrugs([nailner], ["drugs.list", "drugs.details"]);
        await user.click(rowOf(nailner.name));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        expect(within(details).getByText(nailner.name)).toBeInTheDocument();
        // No subcategory: the category alone
        expect(within(details).getByText("التصنيف: العيون")).toBeInTheDocument();
        // Exactly the name and the category: no ingredients line (not even an empty «المادة الفعالة: »), no description
        expect(within(details).queryByText(/المادة الفعالة/)).not.toBeInTheDocument();
        expect(detailRows(details, nailner.name)).toEqual([nailner.name, "التصنيف: العيون"]);
        expect(details.textContent).not.toMatch(/null|undefined/);
        expect(within(details).getAllByRole("button").map(b => b.textContent)).toEqual(["إغلاق"]);
    });

    test("with ingredients, a subcategory and a description, each row shows @CAT-035", async () => {
        const vigamox = aSharedDrug({description: "Antibiotic eye drops"});
        const {user} = await openDrugs([vigamox], ["drugs.list", "drugs.details"]);
        await user.click(rowOf(vigamox.name));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        expect(within(details).getByText(/^المادة الفعالة:/)).toHaveTextContent(/^المادة الفعالة: MOXIFLOXACIN$/);
        expect(within(details).getByText("التصنيف: العيون › المياه الزرقاء")).toBeInTheDocument();
        expect(within(details).getByText("Antibiotic eye drops")).toBeInTheDocument();
        expect(detailRows(details, vigamox.name)).toEqual([
            vigamox.name, "المادة الفعالة: MOXIFLOXACIN", "التصنيف: العيون › المياه الزرقاء", "Antibiotic eye drops",
        ]);
    });

    test("details open, the drug disabled meanwhile: closing works, the list drops it at its next load, no error toast @CAT-036", async () => {
        const vigamox = aSharedDrug();
        const own = aDrug({name: "Tobradex"});
        const {user} = await openDrugs([own, vigamox], ["drugs.list", "drugs.details"]);
        await user.click(rowOf(vigamox.name));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        // Disabled by the super admin in another tab: by id it now answers `withdrawn: true`, the list hides it
        vigamox.withdrawn = true;
        await user.click(within(details).getByRole("button", {name: "إغلاق"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.type(screen.getByRole("searchbox"), "VIGAMOX");
        expect(await screen.findByText("لا توجد أدوية مطابقة للبحث.")).toBeInTheDocument();
        expect(screen.queryByText(vigamox.name)).not.toBeInTheDocument();
        expect(toastTexts()).toEqual([]);
    });
});

describe("drugs page: no delete on shared rows @area:access", () => {
    test("with drugs.delete: own rows have «حذف», shared rows have neither «حذف» nor «تعديل», and their protocols are never asked @ACC-091",
        async () => {
            const own = aDrug({name: "Tobradex"});
            const shared = aSharedDrug();
            server.use(http.get(api("/drugs/:id/protocols"), () => HttpResponse.json([])));
            const recorded = recordRequests();
            const {user} = await openDrugs([own, shared], ["drugs.list", "drugs.delete"]);
            expect(within(rowOf(own.name)).getByRole("button", {name: "حذف"})).toBeInTheDocument();
            const sharedRow = rowOf(shared.name);
            await user.hover(sharedRow);
            expect(within(sharedRow).queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
            expect(within(sharedRow).queryByRole("button", {name: "تعديل"})).not.toBeInTheDocument();

            // Its details open (drugs.delete holds drugs.details), still without a delete
            await user.click(sharedRow);
            const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
            expect(within(details).queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
            await user.click(within(details).getByRole("button", {name: "إغلاق"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(recorded.requests.filter(r => r.path === `/drugs/${shared.id}/protocols`)).toEqual([]);
        });
});

describe("drugs page: each name keeps its own direction @area:i18n", () => {
    test("in Arabic, «1 2 3 (ONE TWO THREE) 20 F.C.TABS.» and an own drug typed in Arabic are each isolated with their own direction (<bdi> / dir=\"auto\") in their row @CAT-233",
        async () => {
            const shared = aSharedDrug({name: DIGITS_FIRST_NAME});
            const own = aDrug({name: ARABIC_DRUG_NAME});
            await openDrugs([own, shared]);
            await screen.findByText(DIGITS_FIRST_NAME);
            expectOwnDirection(rowOf(DIGITS_FIRST_NAME), DIGITS_FIRST_NAME);
            expectOwnDirection(rowOf(ARABIC_DRUG_NAME), ARABIC_DRUG_NAME);
        });

    test("in Arabic, the read-only details of «1 2 3 (ONE TWO THREE) 20 F.C.TABS.»: its name is isolated with its own direction and aligned to the right, the interface's start side (decision C37) @CAT-266",
        async () => {
            const shared = aSharedDrug({name: DIGITS_FIRST_NAME});
            const {user} = await openDrugs([shared], ["drugs.list", "drugs.details"]);
            await user.click(rowOf(DIGITS_FIRST_NAME));
            const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
            expectOwnDirection(details, DIGITS_FIRST_NAME);
            expect(alignedSide(blockOf(lineOf(details, DIGITS_FIRST_NAME))), "the name aligned to the right").toBe("right");
        });
});

describe("drugs page: search placeholder @area:catalog", () => {
    test("the drugs page's search says what it matches: «ابحث بالاسم أو المادة الفعالة أو التصنيف…» / \"Search by name, active ingredient or category…\" @CAT-235",
        async () => {
            server.use(...drugsHandlers([aDrug()]));
            const {unmount} = await renderWithProviders(<DrugsPage/>, {lang: "ar", route: "/drugs"});
            expect(await screen.findByRole("searchbox")).toHaveAttribute("placeholder", "ابحث بالاسم أو المادة الفعالة أو التصنيف…");
            unmount();
            await renderWithProviders(<DrugsPage/>, {lang: "en", route: "/drugs"});
            expect(await screen.findByRole("searchbox")).toHaveAttribute("placeholder", "Search by name, active ingredient or category…");
        });
});
