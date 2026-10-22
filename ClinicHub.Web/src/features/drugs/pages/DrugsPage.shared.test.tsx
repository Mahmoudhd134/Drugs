import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    api,
    aSharedDrug,
    drugsHandlers,
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
    const rendered = await renderWithProviders(<DrugsPage/>, {lang: "ar", route: "/drugs", user: permissions ? {permissions} : undefined});
    await screen.findByText(drugs[0].name);
    return rendered;
};

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("drugs page: a shared drug's read-only details @area:catalog", () => {
    test("a shared drug without ingredients or description: those rows are hidden, never an empty label or \"null\" @CAT-035", async () => {
        const nailner = aSharedDrug({name: "NAILNER NAIL FUNGUS PEN 4 ML", activeIngredients: null, description: null, subCategory: null});
        const {user} = await openDrugs([nailner], ["drugs.list", "drugs.details"]);
        await user.click(rowOf(nailner.name));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        expect(within(details).getByText(nailner.name)).toBeInTheDocument();
        // No subcategory: the category alone
        expect(within(details).getByText("التصنيف: العيون")).toBeInTheDocument();
        expect(within(details).queryByText("المادة الفعالة")).not.toBeInTheDocument();
        expect(within(details).queryByText("الوصف")).not.toBeInTheDocument();
        expect(details.textContent).not.toMatch(/null|undefined/);
        expect(within(details).getAllByRole("button").map(b => b.textContent)).toEqual(["إغلاق"]);
    });

    test("with ingredients, a subcategory and a description, each row shows @CAT-035", async () => {
        const vigamox = aSharedDrug({description: "Antibiotic eye drops"});
        const {user} = await openDrugs([vigamox], ["drugs.list", "drugs.details"]);
        await user.click(rowOf(vigamox.name));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        expect(within(details).getByText("المادة الفعالة")).toBeInTheDocument();
        expect(within(details).getByText("MOXIFLOXACIN")).toBeInTheDocument();
        expect(within(details).getByText("التصنيف: العيون › المياه الزرقاء")).toBeInTheDocument();
        expect(within(details).getByText("Antibiotic eye drops")).toBeInTheDocument();
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
