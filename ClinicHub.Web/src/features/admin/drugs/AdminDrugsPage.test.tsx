import {describe, expect, test} from "vitest";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    adminCategoriesHandler,
    adminDrugsHandlers,
    anAdminCategory,
    anAdminDrug,
    anAdminSubCategory,
    api,
    choose,
    clickOutside,
    EYE,
    expectStillOpen,
    expectToasts,
    fillIn,
    GLAUCOMA,
    holdTimers,
    pastExitTransition,
    recordRequests,
    server,
    toastTexts,
} from "../../../test";
import type {AdminCategory} from "../categories/types.ts";
import type {AdminDrug, SaveSharedDrug} from "./types.ts";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {categoryField, ingredientsField, pickCategory, subCategoryField} from "../../../test/pages/drugDialog.ts";
import {expectWithdrawnTooltip, WITHDRAWN, withdrawnMark} from "../../../test/pages/withdrawn.ts";

// The super admin's shared drugs page `/admin/drugs` (design M1.7 D6, D9; M1.7b contract "Admin drugs page"): search,
// status «مفعّل» / «معطّل» / «الكل» (default «مفعّل»), category filters (all in the URL); «تعطيل الدواء» with a confirm
// (focus on «إلغاء»), «تفعيل الدواء» without; toasts «تم تعطيل الدواء» / «تم تفعيل الدواء»; add/edit dialog = the drug
// dialog without dosing. Texts: contract § 3.5.

/** «العيون» with «المياه الزرقاء», as `GET /admin/drug-categories` answers it (counts don't matter here). */
const CATEGORIES: AdminCategory[] = [
    anAdminCategory({...EYE, subCategories: [anAdminSubCategory({...GLAUCOMA})]}),
    anAdminCategory({id: 2, nameEn: "Anti-infectives", nameAr: "مضادات العدوى", subCategories: [anAdminSubCategory({id: 21, nameEn: "Penicillins", nameAr: "البنسلينات"})]}),
];

const openPage = async (drugs: AdminDrug[], route = "/admin/drugs", lang: "ar" | "en" = "ar") => {
    server.use(...adminDrugsHandlers(drugs), adminCategoriesHandler(CATEGORIES));
    const rendered = await renderAdmin(route, {lang});
    await screen.findByRole("heading", {name: lang === "ar" ? "الأدوية المشتركة" : "Shared drugs"});
    return rendered;
};

const rowOf = async (name: string) => (await screen.findByText(name, {exact: true})).closest("tr") as HTMLElement;
const statusField = () => screen.getByRole("combobox", {name: n => n.startsWith("الحالة")});
const listRequests = (recorded: ReturnType<typeof recordRequests>) =>
    recorded.requests.filter(r => r.method === "GET" && r.path === "/admin/drugs").map(r => new URLSearchParams(r.search));
const lastList = (recorded: ReturnType<typeof recordRequests>) => {
    const lists = listRequests(recorded);
    return lists[lists.length - 1] ?? new URLSearchParams();
};
/** The confirmation's confirm button (the one that is not «إلغاء»). */
const confirmButton = (dialog: HTMLElement) =>
    within(dialog).getAllByRole("button").find(b => b.textContent !== "إلغاء" && b.textContent !== "Cancel") as HTMLElement;

describe("admin drugs: disabling on «الكل» and «مفعّل» @area:admin", () => {
    test("on «الكل» a drug disabled stays with the chip (tooltip on hover and focus) and its button becomes «تفعيل الدواء» @CAT-208",
        async () => {
            const drug = anAdminDrug({name: "TEST DROPS 5 ML"});
            const {user} = await openPage([drug, anAdminDrug({name: "OTHER DROPS 5 ML"})]);
            await choose(user, statusField(), "الكل");
            let row = await rowOf(drug.name);
            await user.click(within(row).getByRole("button", {name: "تعطيل الدواء"}));
            const dialog = await screen.findByRole("dialog");
            await user.click(confirmButton(dialog));
            await waitFor(() => expect(toastTexts()).toContain("تم تعطيل الدواء"));

            row = await rowOf(drug.name);
            await waitFor(() => expect(within(row).getByRole("button", {name: "تفعيل الدواء"})).toBeInTheDocument());
            expect(within(row).queryByRole("button", {name: "تعطيل الدواء"})).not.toBeInTheDocument();
            await expectWithdrawnTooltip(withdrawnMark(row, WITHDRAWN.ar.chip));
            expect(within(await rowOf("OTHER DROPS 5 ML")).queryByText(WITHDRAWN.ar.chip)).not.toBeInTheDocument();
        });

    test("on «مفعّل» the disabled row leaves, and the only row of the last page steps the table back one page @CAT-208", async () => {
        // 101 drugs: whatever the page size (10, 20, 25, 50), the last page holds one row
        const drugs = Array.from({length: 101}, (_, i) => anAdminDrug({name: `DRUG ${String(i + 1).padStart(3, "0")}`}));
        const recorded = recordRequests();
        const {user} = await openPage(drugs);
        await rowOf("DRUG 001");
        const size = Number(listRequests(recorded)[0].get("pageSize"));
        const lastPage = Math.ceil(101 / size);
        for (let page = 2; page <= lastPage; page++) {
            await user.click(screen.getByRole("button", {name: "الذهاب إلى الصفحة التالية"}));
            await waitFor(() => expect(lastList(recorded).get("page")).toBe(String(page)));
        }
        const last = await rowOf("DRUG 101");
        expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);

        await user.click(within(last).getByRole("button", {name: "تعطيل الدواء"}));
        await user.click(confirmButton(await screen.findByRole("dialog")));
        await waitFor(() => expect(screen.queryByText("DRUG 101")).not.toBeInTheDocument());
        // The page shown is the one before (its rows may come from the refreshed cache, without a new request)
        await waitFor(() => expect(screen.getAllByRole("row").slice(1)).toHaveLength(size));
        expect(screen.getByText(`${(lastPage - 2) * size + 1}–${(lastPage - 1) * size} من 100`)).toBeInTheDocument();
        const pad = (n: number) => String(n).padStart(3, "0");
        expect(screen.getAllByRole("row")[1]).toHaveTextContent(`DRUG ${pad((lastPage - 2) * size + 1)}`);
        expect(screen.getAllByRole("row").at(-1)).toHaveTextContent(`DRUG ${pad((lastPage - 1) * size)}`);
    });
});

describe("admin drugs: the empty «معطّل» list @area:admin", () => {
    test("«معطّل» with no disabled drug matching: «لا توجد أدوية معطّلة.» without an «إضافة دواء» button @CAT-209", async () => {
        const {user} = await openPage([anAdminDrug({name: "ACTIVE DROPS"})]);
        await rowOf("ACTIVE DROPS");
        await choose(user, statusField(), "معطّل");
        const empty = await screen.findByText("لا توجد أدوية معطّلة.");
        const container = empty.parentElement as HTMLElement;
        expect(within(container).queryByRole("button", {name: "إضافة دواء"})).not.toBeInTheDocument();
        expect(screen.queryByText("ACTIVE DROPS")).not.toBeInTheDocument();
    });

    test("in English: \"No disabled drugs.\" @CAT-209", async () => {
        await openPage([anAdminDrug({name: "ACTIVE DROPS"})], "/admin/drugs?status=withdrawn", "en");
        expect(await screen.findByText("No disabled drugs.")).toBeInTheDocument();
    });
});

describe("admin drugs: a stale filter in the URL @area:admin", () => {
    test("a deleted subcategory still in the URL: the subcategory filter falls back to «كل التصنيفات الفرعية» @CAT-217", async () => {
        const recorded = recordRequests();
        await openPage([anAdminDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})], `/admin/drugs?categoryId=${EYE.id}&subCategoryId=99999`);
        await rowOf("VIGAMOX 0.5% EYE DROPS 5 ML");
        await waitFor(() => expect(screen.getByRole("combobox", {name: n => n.startsWith("التصنيف الفرعي")}))
            .toHaveTextContent("كل التصنيفات الفرعية"));
        await waitFor(() => expect(lastList(recorded).get("subCategoryId")).toBeNull());
    });
});

describe("admin drugs: the shared drug dialog locked while saving, fresh on each opening @area:ux", () => {
    test("with the save held: Esc, a backdrop click and «إلغاء» do nothing, a second Save sends nothing; reopened while closing it starts empty @UX-044",
        async () => {
            let answer: () => void = () => undefined;
            const answered = new Promise<void>(resolve => (answer = resolve));
            const posts: SaveSharedDrug[] = [];
            const {user} = await openPage([anAdminDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})]);
            server.use(http.post(api("/admin/drugs"), async ({request}) => {
                posts.push(await request.json() as SaveSharedDrug);
                await answered;
                return HttpResponse.json(anAdminDrug({name: "NEW DROPS 5 ML"}), {status: 201});
            }));
            await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
            const dialog = await screen.findByRole("dialog", {name: "دواء مشترك جديد"});
            await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم"}), "NEW DROPS 5 ML");
            await fillIn(user, ingredientsField(dialog), "MOXIFLOXACIN");
            await pickCategory(user, {scope: dialog, subCategory: "المياه الزرقاء"});
            await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
            expect(await within(dialog).findByRole("button", {name: "جارٍ الحفظ…"})).toBeDisabled();

            await user.keyboard("{Escape}");
            await clickOutside(user, dialog);
            await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "إلغاء"})));
            await expectStillOpen(dialog);
            await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "جارٍ الحفظ…"})));
            await act(async () => fireEvent.submit(dialog.querySelector("form")!));
            expect(posts).toEqual([{
                name: "NEW DROPS 5 ML", activeIngredients: "MOXIFLOXACIN", description: null, categoryId: EYE.id, subCategoryId: GLAUCOMA.id,
            }]);

            const timers = holdTimers();
            answer();
            await waitFor(() => expect(toastTexts()).toContain("تمت إضافة الدواء"));
            await user.click(screen.getByRole("button", {name: "إضافة دواء", hidden: true}));
            const reopened = screen.getByRole("dialog", {hidden: true});
            expect(within(reopened).getByRole("textbox", {name: "الاسم", hidden: true})).toHaveValue("");
            expect(ingredientsField(reopened, "ar", true)).toHaveValue("");
            expect(categoryField(reopened, "ar", true)).not.toHaveTextContent("العيون");
            await timers.release();
            await pastExitTransition();
            expect(posts).toHaveLength(1);
        });

    test("✎ on a drug opens «تعديل الدواء المشترك» from that drug: its name, ingredients, category and subcategory, no dosing @UX-044", async () => {
        const drug = anAdminDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", activeIngredients: "MOXIFLOXACIN"});
        const {user} = await openPage([drug]);
        await user.click(within(await rowOf(drug.name)).getByRole("button", {name: /^تعديل/}));
        const dialog = await screen.findByRole("dialog", {name: "تعديل الدواء المشترك"});
        expect(within(dialog).getByRole("textbox", {name: "الاسم"})).toHaveValue(drug.name);
        expect(ingredientsField(dialog)).toHaveValue("MOXIFLOXACIN");
        await waitFor(() => expect(categoryField(dialog)).toHaveTextContent("العيون"));
        expect(subCategoryField(dialog)).toHaveTextContent("المياه الزرقاء");
        expect(within(dialog).queryByText("الجرعة الافتراضية")).not.toBeInTheDocument();
    });
});

describe("admin drugs: the toasts can be dismissed @area:ux", () => {
    test("«تم تعطيل الدواء» and «تم تفعيل الدواء» each have × «إغلاق», which closes that toast at once, the other staying @UX-045", async () => {
        const drug = anAdminDrug({name: "TEST DROPS 5 ML"});
        const {user} = await openPage([drug], "/admin/drugs?status=all");
        const row = await rowOf(drug.name);
        await user.click(within(row).getByRole("button", {name: "تعطيل الدواء"}));
        await user.click(confirmButton(await screen.findByRole("dialog")));
        await waitFor(() => expect(within(row).getByRole("button", {name: "تفعيل الدواء"})).toBeInTheDocument());
        await user.click(within(row).getByRole("button", {name: "تفعيل الدواء"}));
        await expectToasts("تم تفعيل الدواء", "تم تعطيل الدواء");

        const disabled = screen.getByText("تم تعطيل الدواء").closest("[role=status]")!.parentElement!;
        await act(async () => within(disabled).getByRole("button", {name: "إغلاق"}).click());
        await waitFor(() => expect(toastTexts()).toEqual(["تم تفعيل الدواء"]), {timeout: 1000});
        const enabled = screen.getByText("تم تفعيل الدواء").closest("[role=status]")!.parentElement!;
        await act(async () => within(enabled).getByRole("button", {name: "إغلاق"}).click());
        await waitFor(() => expect(toastTexts()).toEqual([]), {timeout: 1000});
    });
});
