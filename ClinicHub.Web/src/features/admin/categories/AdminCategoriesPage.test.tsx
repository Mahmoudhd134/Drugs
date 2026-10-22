import {describe, expect, test} from "vitest";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import {
    adminCategoriesHandler,
    anAdminCategory,
    anAdminSubCategory,
    api,
    clickOutside,
    expectStillOpen,
    expectToasts,
    fillIn,
    findToast,
    hoverTooltip,
    holdTimers,
    OTHER,
    pastExitTransition,
    problem,
    recordRequests,
    server,
    toastTexts,
    UNCLASSIFIED,
} from "../../../test";
import type {AdminCategory, SaveCategory} from "./types.ts";
import {renderAdmin} from "../../../test/pages/admin.tsx";

// The super admin's categories page `/admin/categories` (design M1.7 D5, D8, D9; M1.7b contract "Admin categories page"):
// each category with its subcategories (sorted, pins last), a «بدون تصنيف فرعي» row when `noSubCategoryDrugCount > 0`,
// counts «الأدوية: N»; delete disabled (still focusable) with the tooltip `errors.<code>InUse_counted` (+ «من عيادات
// محذوفة: N») when `drugCount > 0`; the 409 still handled; add/rename dialogs ask both names. Texts: contract § 3.5.

const openPage = async (categories: AdminCategory[], lang: "ar" | "en" = "ar") => {
    server.use(adminCategoriesHandler(categories));
    const rendered = await renderAdmin("/admin/categories", {lang});
    await screen.findByText(lang === "ar" ? categories[0].nameAr : categories[0].nameEn, {exact: true});
    return rendered;
};

/**
 * The row of a category or subcategory (whatever the markup): the largest element around its name that holds exactly one
 * count «الأدوية: …» (its own; the name+count box alone would miss the row's buttons, the list around it holds more counts).
 */
const rowOf = (name: string, countLabel = "الأدوية:") => {
    const counts = (element: HTMLElement) => (element.textContent ?? "").split(countLabel).length - 1;
    let element: HTMLElement = screen.getByText(name, {exact: true});
    while (counts(element) === 0 && element.parentElement) element = element.parentElement;
    if (counts(element) !== 1) throw new Error(`No row with one count around ${name}`);
    while (element.parentElement && counts(element.parentElement) === 1) element = element.parentElement;
    return element;
};

/** The confirmation's confirm button (the one that is not «إلغاء»). */
const confirmButton = (dialog: HTMLElement) =>
    within(dialog).getAllByRole("button").find(b => b.textContent !== "إلغاء" && b.textContent !== "Cancel") as HTMLElement;

describe("admin categories: counts @area:admin", () => {
    test("«أخرى» with 8 + 56 shared drugs and 3 own drugs without a subcategory: 67, and its rows add up: 8, 56, «بدون تصنيف فرعي» 3 @CAT-211",
        async () => {
            const enzymes = anAdminSubCategory({id: 181, nameEn: "Enzyme and rare disease therapy", nameAr: "علاج الإنزيمات والأمراض النادرة", drugCount: 8});
            const unclassified = anAdminSubCategory({...UNCLASSIFIED, pinnedLast: true, drugCount: 56});
            const other = anAdminCategory({
                ...OTHER, pinnedLast: true, drugCount: 67, noSubCategoryDrugCount: 3, subCategories: [unclassified, enzymes],
            });
            await openPage([other]);
            expect(screen.getByText("الأدوية: 67")).toBeInTheDocument();
            expect(within(rowOf("علاج الإنزيمات والأمراض النادرة")).getByText("الأدوية: 8")).toBeInTheDocument();
            expect(within(rowOf("غير مصنف")).getByText("الأدوية: 56")).toBeInTheDocument();
            expect(within(rowOf("بدون تصنيف فرعي")).getByText("الأدوية: 3")).toBeInTheDocument();
            // Sorted by name, «غير مصنف» (pinned) last among the subcategories
            const names = ["علاج الإنزيمات والأمراض النادرة", "غير مصنف"].map(n => screen.getByText(n, {exact: true}));
            expect(names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

    test("no «بدون تصنيف فرعي» row when every drug of the category has a subcategory @CAT-211", async () => {
        await openPage([anAdminCategory({nameAr: "العيون", nameEn: "Eye", drugCount: 5, subCategories: [anAdminSubCategory({drugCount: 5})]})]);
        expect(screen.queryByText("بدون تصنيف فرعي")).not.toBeInTheDocument();
    });
});

describe("admin categories: delete blocked by drugs @area:admin", () => {
    test("a subcategory blocked only by a deleted clinic's drug: delete disabled, focusable, its tooltip ends with «من عيادات محذوفة: 1» @CAT-213",
        async () => {
            const sub = anAdminSubCategory({nameAr: "تصنيف فرعي قديم", nameEn: "Old subcategory", drugCount: 1, deletedClinicsDrugCount: 1});
            await openPage([anAdminCategory({nameAr: "تصنيف تجريبي", drugCount: 1, subCategories: [sub]})]);
            const button = within(rowOf("تصنيف فرعي قديم")).getByRole("button", {name: "حذف التصنيف الفرعي"});
            expect(button).toHaveAttribute("aria-disabled", "true");
            button.focus();
            expect(button).toHaveFocus();
            const tooltip = await hoverTooltip(button);
            expect(tooltip.startsWith("لا يمكن حذف هذا التصنيف الفرعي: يستخدمه دواء واحد.")).toBe(true);
            expect(tooltip.endsWith("من عيادات محذوفة: 1")).toBe(true);
        });

    test("no deleted clinic's drug: the tooltip is the counted message alone @CAT-213", async () => {
        const sub = anAdminSubCategory({nameAr: "تصنيف فرعي", drugCount: 3});
        await openPage([anAdminCategory({nameAr: "تصنيف تجريبي", drugCount: 3, subCategories: [sub]})]);
        const tooltip = await hoverTooltip(within(rowOf("تصنيف فرعي")).getByRole("button", {name: "حذف التصنيف الفرعي"}));
        expect(tooltip).toBe("لا يمكن حذف هذا التصنيف الفرعي: يستخدمه 3 أدوية.");
    });
});

describe("admin categories: a delete refused meanwhile @area:admin", () => {
    test("409 (a clinic added a drug meanwhile): the toast with the count, and the list reloads with the new count @CAT-215", async () => {
        const sub = anAdminSubCategory({nameAr: "تصنيف فرعي فارغ", nameEn: "Empty subcategory", drugCount: 0});
        const category = anAdminCategory({nameAr: "تصنيف تجريبي", drugCount: 0, subCategories: [sub]});
        const {user} = await openPage([category]);
        const reloaded = [{...category, drugCount: 1, subCategories: [{...sub, drugCount: 1}]}];
        server.use(http.delete(api("/admin/drug-subcategories/:id"), () => {
            server.use(adminCategoriesHandler(reloaded));
            return problem(409, "subCategoryInUse", {drugCount: 1});
        }));
        await user.click(within(rowOf("تصنيف فرعي فارغ")).getByRole("button", {name: "حذف التصنيف الفرعي"}));
        // The destructive confirmation names the subcategory (contract § 3.5 deleteSubCategoryTitle / Message)
        const confirmation = await screen.findByRole("dialog");
        expect(within(confirmation).getByRole("heading")).toHaveTextContent(/^حذف التصنيف الفرعي «\u2068?تصنيف فرعي فارغ\u2069?»؟$/);
        expect(within(confirmation).getByText("لا يمكن التراجع عن ذلك.")).toBeInTheDocument();
        await user.click(confirmButton(confirmation));

        expect(await findToast()).toBe("لا يمكن حذف هذا التصنيف الفرعي: يستخدمه دواء واحد.");
        await waitFor(() => expect(within(rowOf("تصنيف فرعي فارغ")).getByText("الأدوية: 1")).toBeInTheDocument());
        // The confirmation is gone (while it closes, the page behind it is aria-hidden)
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(within(rowOf("تصنيف فرعي فارغ")).getByRole("button", {name: "حذف التصنيف الفرعي"})).toHaveAttribute("aria-disabled", "true");
    });

    test("a category's 409: «لا يمكن حذف هذا التصنيف: يستخدمه 3 أدوية.» @CAT-215", async () => {
        const category = anAdminCategory({nameAr: "تصنيف فارغ", drugCount: 0});
        const {user} = await openPage([category]);
        server.use(http.delete(api("/admin/drug-categories/:id"), () => problem(409, "categoryInUse", {drugCount: 3})));
        await user.click(within(rowOf("تصنيف فارغ")).getByRole("button", {name: "حذف التصنيف"}));
        await user.click(confirmButton(await screen.findByRole("dialog")));
        expect(await findToast()).toBe("لا يمكن حذف هذا التصنيف: يستخدمه 3 أدوية.");
    });
});

/** A dialog (category or subcategory) whose save is held; returns the bodies sent and `answer()`. */
const holdSave = (method: "post" | "put", path: string, saved: object) => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>(resolve => (answer = resolve));
    const bodies: SaveCategory[] = [];
    server.use(http[method](api(path), async ({request}) => {
        bodies.push(await request.json() as SaveCategory);
        await answered;
        return HttpResponse.json(saved, {status: method === "post" ? 201 : 200});
    }));
    return {bodies, answer: () => answer()};
};

/** Esc, a backdrop click and «إلغاء» while the save is held: the dialog stays; a second Save and a submit send nothing. */
const expectLockedWhileSaving = async (user: UserEvent, dialog: HTMLElement) => {
    expect(await within(dialog).findByRole("button", {name: "جارٍ الحفظ…"})).toBeDisabled();
    await user.keyboard("{Escape}");
    await clickOutside(user, dialog);
    await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "إلغاء"})));
    await expectStillOpen(dialog);
    await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "جارٍ الحفظ…"})));
    await act(async () => fireEvent.submit(dialog.querySelector("form")!));
};

describe("admin categories: the dialogs locked while saving, fresh on each opening @area:ux", () => {
    test("new category: Arabic name RTL, English LTR; with the save held nothing closes it and one request is sent; reopened while closing it starts empty @UX-044",
        async () => {
            const {user} = await openPage([anAdminCategory({nameAr: "العيون", nameEn: "Eye"})]);
            const save = holdSave("post", "/admin/drug-categories", {id: 900, nameEn: "Dermatology", nameAr: "الجلدية", pinnedLast: false, subCategories: []});
            await user.click(screen.getByRole("button", {name: "إضافة تصنيف"}));
            const dialog = await screen.findByRole("dialog", {name: "تصنيف جديد"});
            await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"}), "Dermatology");
            await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالعربية"}), "الجلدية");
            await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
            await expectLockedWhileSaving(user, dialog);
            expect(save.bodies).toEqual([{nameEn: "Dermatology", nameAr: "الجلدية"}]);

            const timers = holdTimers();
            save.answer();
            await waitFor(() => expect(toastTexts()).toContain("تمت إضافة التصنيف"));
            await user.click(screen.getByRole("button", {name: "إضافة تصنيف", hidden: true}));
            const reopened = screen.getByRole("dialog", {hidden: true});
            expect(within(reopened).getByRole("textbox", {name: "الاسم بالإنجليزية", hidden: true})).toHaveValue("");
            expect(within(reopened).getByRole("textbox", {name: "الاسم بالعربية", hidden: true})).toHaveValue("");
            await timers.release();
            await pastExitTransition();
            expect(save.bodies).toHaveLength(1);
        });

    test("rename a category: it starts from the given names; held save: one request, the dialog stays @UX-044", async () => {
        const eye = anAdminCategory({nameAr: "العيون", nameEn: "Eye"});
        const {user} = await openPage([eye]);
        const save = holdSave("put", `/admin/drug-categories/${eye.id}`, {...eye, nameEn: "Eyes", subCategories: []});
        await user.click(within(rowOf("العيون")).getAllByRole("button", {name: "تعديل التصنيف"})[0]);
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"})).toHaveValue("Eye");
        expect(within(dialog).getByRole("textbox", {name: "الاسم بالعربية"})).toHaveValue("العيون");
        await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"}), "Eyes");
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        await expectLockedWhileSaving(user, dialog);
        expect(save.bodies).toEqual([{nameEn: "Eyes", nameAr: "العيون"}]);
        save.answer();
        await waitFor(() => expect(toastTexts()).toContain("تم تعديل التصنيف"));
    });

    test("new subcategory: held save: one request to the category's subcategories, the dialog stays; then «تمت إضافة التصنيف الفرعي» @UX-044", async () => {
        const eye = anAdminCategory({nameAr: "العيون", nameEn: "Eye"});
        const {user} = await openPage([eye]);
        const save = holdSave("post", `/admin/drug-categories/${eye.id}/subcategories`, {id: 901, nameEn: "Dry eye", nameAr: "جفاف العين", pinnedLast: false});
        await user.click(within(rowOf("العيون")).getByRole("button", {name: "إضافة تصنيف فرعي"}));
        // Its title is «تصنيف فرعي جديد» with the category's name under it
        const dialog = await screen.findByRole("dialog", {name: /^تصنيف فرعي جديد/});
        await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"}), "Dry eye");
        await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالعربية"}), "جفاف العين");
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        await expectLockedWhileSaving(user, dialog);
        expect(save.bodies).toEqual([{nameEn: "Dry eye", nameAr: "جفاف العين"}]);
        save.answer();
        await waitFor(() => expect(toastTexts()).toContain("تمت إضافة التصنيف الفرعي"));
    });

    test("rename a subcategory: it starts from the given names; held save: one request @UX-044", async () => {
        const glaucoma = anAdminSubCategory();
        const eye = anAdminCategory({nameAr: "العيون", nameEn: "Eye", subCategories: [glaucoma]});
        const {user} = await openPage([eye]);
        const save = holdSave("put", `/admin/drug-subcategories/${glaucoma.id}`, {...glaucoma, nameEn: "Glaucoma drops"});
        await user.click(within(rowOf("المياه الزرقاء")).getByRole("button", {name: "تعديل التصنيف الفرعي"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"})).toHaveValue("Glaucoma");
        expect(within(dialog).getByRole("textbox", {name: "الاسم بالعربية"})).toHaveValue("المياه الزرقاء");
        await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم بالإنجليزية"}), "Glaucoma drops");
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        await expectLockedWhileSaving(user, dialog);
        expect(save.bodies).toEqual([{nameEn: "Glaucoma drops", nameAr: "المياه الزرقاء"}]);
        save.answer();
        await waitFor(() => expect(toastTexts()).toContain("تم تعديل التصنيف الفرعي"));
    });
});

describe("admin categories: the toasts can be dismissed @area:ux", () => {
    test("«تم حذف التصنيف» and «تم حذف التصنيف الفرعي» each have × «إغلاق», which closes that toast at once, the other staying @UX-045",
        async () => {
            const empty = anAdminSubCategory({nameAr: "فرعي فارغ", drugCount: 0});
            const keep = anAdminCategory({nameAr: "العيون", nameEn: "Eye", subCategories: [empty]});
            const gone = anAdminCategory({nameAr: "تصنيف فارغ", nameEn: "Empty"});
            const recorded = recordRequests();
            const {user} = await openPage([keep, gone]);
            server.use(
                http.delete(api("/admin/drug-subcategories/:id"), () => new HttpResponse(null, {status: 204})),
                http.delete(api("/admin/drug-categories/:id"), () => new HttpResponse(null, {status: 204})),
            );
            await user.click(within(rowOf("فرعي فارغ")).getByRole("button", {name: "حذف التصنيف الفرعي"}));
            await user.click(confirmButton(await screen.findByRole("dialog")));
            await waitFor(() => expect(toastTexts()).toContain("تم حذف التصنيف الفرعي"));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            await user.click(within(rowOf("تصنيف فارغ")).getByRole("button", {name: "حذف التصنيف"}));
            await user.click(confirmButton(await screen.findByRole("dialog")));
            await expectToasts("تم حذف التصنيف", "تم حذف التصنيف الفرعي");
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(recorded.writes().map(w => w.path)).toEqual([`/admin/drug-subcategories/${empty.id}`, `/admin/drug-categories/${gone.id}`]);

            const first = screen.getByText("تم حذف التصنيف الفرعي").closest("[role=status]")!.parentElement!;
            await act(async () => within(first).getByRole("button", {name: "إغلاق"}).click());
            await waitFor(() => expect(toastTexts()).toEqual(["تم حذف التصنيف"]), {timeout: 1000});
        });
});
