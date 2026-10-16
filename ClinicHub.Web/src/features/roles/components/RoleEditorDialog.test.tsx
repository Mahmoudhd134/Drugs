import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    api,
    aRole,
    clickOutside,
    expectStillOpen,
    fillIn,
    findToast,
    PERMISSION_CATALOG,
    permissionsHandler,
    problem,
    recordRequests,
    renderWithProviders,
    rolesHandler,
    server,
    setViewportWidth,
} from "../../../test";
import type {Role} from "../types.ts";
import {RoleEditorHarness} from "../../../test/pages/EditorHarness.tsx";
import {defaultRoles} from "../../../test/pages/rolesTab.ts";

// The role editor: docs/features/platform-admin/business.md "الشاشات" (دور جديد / تعديل دور), "الأدوار" and "الرسائل
// التي تظهر للمستخدم"; tech.md "Roles and staff screens" (RoleEditorDialog, PermissionPicker: a ticked permission's
// requirements are locked, with "Needed by:" naming the ticked permissions that directly require it; permissionChoice).

const AR = {
    drugsList: "عرض قائمة الأدوية والبحث فيها", drugsDetails: "فتح دواء", drugsCreate: "إضافة أدوية", drugsUpdate: "تعديل الأدوية",
    drugsDelete: "حذف الأدوية", groupsList: "عرض قائمة المجموعات والبحث فيها", groupsDetails: "فتح مجموعة",
    groupsCreate: "إضافة مجموعات", groupsUpdate: "تعديل المجموعات", groupsDelete: "حذف المجموعات", prescriptions: "كتابة الروشتات",
};

const box = (name: string) => screen.getByRole("checkbox", {name});
const picked = (selected: number, lang: "ar" | "en" = "ar") =>
    screen.getByText(lang === "ar" ? new RegExp(`المختار: ${selected} من 11\\.`) : new RegExp(`Selected: ${selected} of 11\\.`));

const expectLocked = (name: string, neededBy: string) => {
    expect(box(name)).toBeChecked();
    expect(box(name)).toHaveAttribute("aria-disabled", "true");
    expect(box(name)).toHaveAccessibleDescription(neededBy);
};
const expectFree = (name: string, checked: boolean) => {
    expect(box(name)).not.toHaveAttribute("aria-disabled");
    if (checked) expect(box(name)).toBeChecked();
    else expect(box(name)).not.toBeChecked();
};

/** The editor of a new role (or of `role`) of a clinic, as the Roles tab opens it (the catalog loaded). */
const openEditor = async (options: { lang?: "ar" | "en"; role?: Role } = {}) => {
    const lang = options.lang ?? "ar";
    const clinic = aClinicDetails();
    server.use(permissionsHandler(), rolesHandler(clinic.id, defaultRoles()));
    const rendered = await renderWithProviders(<RoleEditorHarness clinicId={clinic.id} role={options.role ?? null}/>,
        {lang, user: {context: "platform"}});
    const dialog = await screen.findByRole("dialog");
    const name = await within(dialog).findByRole("textbox", {name: lang === "ar" ? /^اسم الدور/ : /^Role name/});
    const save = () => rendered.user.click(within(dialog).getByRole("button", {name: lang === "ar" ? "حفظ" : "Save"}));
    return {...rendered, clinic, dialog, name, save};
};


describe("role editor: the picker @area:admin", () => {
    test("\"New role\": the name (max 100), «الأدوية والمجموعات» and «الروشتة», 11 labelled boxes, «المختار: 0 من 11.» @ADM-179", async () => {
        const {dialog, name} = await openEditor();
        expect(within(dialog).getByRole("heading", {name: "دور جديد"})).toBeInTheDocument();
        expect(name).toHaveAttribute("maxlength", "100");
        const catalog = within(dialog).getByRole("region", {name: "الأدوية والمجموعات"});
        expect(within(catalog).getByRole("group", {name: "الأدوية"})).toBeInTheDocument();
        expect(within(catalog).getByRole("group", {name: "المجموعات"})).toBeInTheDocument();
        const prescription = within(dialog).getByRole("region", {name: "الروشتة"});
        expect(within(prescription).getAllByRole("checkbox")).toHaveLength(1);
        const boxes = within(dialog).getAllByRole("checkbox");
        expect(boxes).toHaveLength(11);
        expect(boxes.map(b => b.closest("label")?.textContent)).toEqual(Object.values(AR));
        expect(boxes.every(b => !(b as HTMLInputElement).checked)).toBe(true);
        expect(picked(0)).toBeInTheDocument();
    });

    test("in English: \"Drugs and groups\", \"Prescription\", \"Selected: 0 of 11.\" @ADM-179", async () => {
        const {dialog} = await openEditor({lang: "en"});
        expect(within(dialog).getByRole("region", {name: "Drugs and groups"})).toBeInTheDocument();
        expect(within(dialog).getByRole("region", {name: "Prescription"})).toBeInTheDocument();
        expect(within(dialog).getByRole("checkbox", {name: "Edit groups"})).toBeInTheDocument();
        expect(picked(0, "en")).toBeInTheDocument();
    });

    test("ticking «تعديل المجموعات»: its requirements ticked and locked with «مطلوبة لـ: …», 4 of 11 @ADM-180 @smoke", async () => {
        const {user} = await openEditor();
        await user.click(box(AR.groupsUpdate));
        expect(box(AR.groupsUpdate)).toBeChecked();
        expectLocked(AR.groupsDetails, "مطلوبة لـ: تعديل المجموعات");
        expectLocked(AR.drugsList, "مطلوبة لـ: تعديل المجموعات");
        // The group list is required by «فتح مجموعة» (directly), which «تعديل المجموعات» requires (tech.md: requiredBy)
        expectLocked(AR.groupsList, "مطلوبة لـ: فتح مجموعة");
        expect(picked(4)).toBeInTheDocument();
    });

    test("a locked box stays ticked when clicked or when Space is pressed on it @ADM-181", async () => {
        const {user} = await openEditor();
        await user.click(box(AR.groupsUpdate));
        await user.click(box(AR.groupsDetails));
        expectLocked(AR.groupsDetails, "مطلوبة لـ: تعديل المجموعات");
        box(AR.drugsList).focus();
        await user.keyboard(" ");
        expectLocked(AR.drugsList, "مطلوبة لـ: تعديل المجموعات");
        expect(picked(4)).toBeInTheDocument();
    });

    test("unticking «تعديل المجموعات»: its requirements stay ticked, no longer locked by it, 3 of 11 @ADM-182", async () => {
        const {user} = await openEditor();
        await user.click(box(AR.groupsUpdate));
        await user.click(box(AR.groupsUpdate));
        expectFree(AR.groupsUpdate, false);
        expectFree(AR.groupsDetails, true);
        expectFree(AR.drugsList, true);
        // Still needed by «فتح مجموعة», which stays ticked
        expectLocked(AR.groupsList, "مطلوبة لـ: فتح مجموعة");
        expect(picked(3)).toBeInTheDocument();
    });

    test("\"Edit drugs\" and \"Delete drugs\": \"Open a drug\" reads \"Needed by: Edit drugs, Delete drugs\"; unticking both unlocks it @ADM-183", async () => {
        const {user} = await openEditor({lang: "en"});
        await user.click(box("Edit drugs"));
        await user.click(box("Delete drugs"));
        expectLocked("Open a drug", "Needed by: Edit drugs, Delete drugs");
        await user.click(box("Edit drugs"));
        expectLocked("Open a drug", "Needed by: Delete drugs");
        await user.click(box("Delete drugs"));
        expectFree("Open a drug", true);
        await user.click(box("Open a drug"));
        expectFree("Open a drug", false);
    });
});

describe("role editor: saving @area:admin", () => {
    test("a blank name: «الاسم مطلوب.» on the name and no request @ADM-186", async () => {
        const recorded = recordRequests();
        const {user, name, save} = await openEditor();
        await user.type(name, "   ");
        await save();
        expect(name).toHaveAccessibleDescription("الاسم مطلوب.");
        expect(name).toHaveFocus();
        expect(recorded.writes()).toEqual([]);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("a blank name in English: \"Name is required.\" @ADM-186", async () => {
        const {name, save} = await openEditor({lang: "en"});
        await save();
        expect(name).toHaveAccessibleDescription("Name is required.");
    });

    test("the API answers roleNameTaken (\" doctor \"): the message on the name input, the focus there @ADM-187", async () => {
        const {user, name, save, clinic} = await openEditor();
        const recorded = recordRequests();
        server.use(http.post(api(`/admin/clinics/${clinic.id}/roles`), () => problem(409, "roleNameTaken")));
        await fillIn(user, name, " doctor ");
        await user.click(box(AR.drugsList));
        await save();

        await waitFor(() => expect(name).toHaveAccessibleDescription("يوجد دور آخر في هذه العيادة بنفس الاسم."));
        await waitFor(() => expect(name).toHaveFocus());
        expect(recorded.writes()).toEqual([expect.objectContaining({body: {name: "doctor", permissions: ["drugs.list"]}})]);
    });

    test("roleNameTaken in English: \"Another role in this clinic already has this name.\" @ADM-187", async () => {
        const {user, name, save, clinic} = await openEditor({lang: "en"});
        server.use(http.post(api(`/admin/clinics/${clinic.id}/roles`), () => problem(409, "roleNameTaken")));
        await fillIn(user, name, "Doctor");
        await save();
        await waitFor(() => expect(name).toHaveAccessibleDescription("Another role in this clinic already has this name."));
    });

    test("saving «المالك»: «يوجد دور آخر في هذه العيادة بنفس الاسم.» on the name input @ADM-264", async () => {
        const {user, name, save, clinic} = await openEditor();
        server.use(http.post(api(`/admin/clinics/${clinic.id}/roles`), () => problem(409, "roleNameTaken")));
        await fillIn(user, name, "المالك");
        await save();
        await waitFor(() => expect(name).toHaveAccessibleDescription("يوجد دور آخر في هذه العيادة بنفس الاسم."));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test.each([
        ["unknownPermission", 400, "إحدى الصلاحيات غير موجودة.", "permissions"],
        ["roleLocked", 409, "لا يمكن تعديل دور «المالك» أو حذفه.", undefined],
    ] as const)("the API answers %s: a toast with its message, the dialog stays open @ADM-188", async (code, status, message, field) => {
        const options = field ? {errors: [{code, field}]} : undefined;
        const doctor = aRole({name: "Doctor"});
        const {user, save, clinic} = await openEditor({role: doctor});
        server.use(http.put(api(`/admin/clinics/${clinic.id}/roles/${doctor.id}`), () => problem(status, code, options)));
        await save();
        expect(await findToast()).toBe(message);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(within(screen.getByRole("dialog")).getByRole("button", {name: "حفظ"})).toBeEnabled();
        await user.keyboard("{Escape}");
    });

    test("unknownPermission in English: \"One of the permissions doesn't exist.\" @ADM-188", async () => {
        const {user, name, save, clinic} = await openEditor({lang: "en"});
        server.use(http.post(api(`/admin/clinics/${clinic.id}/roles`), () =>
            problem(400, "unknownPermission", {errors: [{code: "unknownPermission", field: "permissions"}]})));
        await fillIn(user, name, "Editors");
        await save();
        expect(await findToast()).toBe("One of the permissions doesn't exist.");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("a key the loaded catalog doesn't know is still sent when the role is saved unchanged @ADM-192", async () => {
        const printer = aRole({name: "Printer", permissions: ["drugs.list", "prescriptions.print"]});
        const {save, clinic} = await openEditor({role: printer});
        const recorded = recordRequests();
        server.use(http.put(api(`/admin/clinics/${clinic.id}/roles/${printer.id}`), () => HttpResponse.json(printer)));
        await save();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(recorded.writes()).toEqual([expect.objectContaining({
            method: "PUT",
            body: {name: "Printer", permissions: ["drugs.list", "prescriptions.print"]},
        })]);
    });

    test("while saving, the editor can't be closed until the answer @ADM-193", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        const {user, name, save, clinic, dialog} = await openEditor();
        server.use(http.post(api(`/admin/clinics/${clinic.id}/roles`), async () => {
            await answered;
            return HttpResponse.json(aRole({name: "Editors"}), {status: 201});
        }));
        await fillIn(user, name, "Editors");
        await save();
        expect(await within(dialog).findByRole("button", {name: "جارٍ الحفظ…"})).toBeDisabled();
        expect(within(dialog).getByRole("button", {name: "إلغاء"})).toBeDisabled();
        // Neither Esc nor a backdrop click starts closing it (checked once a closing animation would be over)
        await user.keyboard("{Escape}");
        await expectStillOpen(dialog);
        await clickOutside(user, dialog);
        await expectStillOpen(dialog);
        expect(name).toHaveValue("Editors");

        answer();
        expect(await findToast()).toBe("تم إنشاء الدور «⁨Editors⁩»");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});

describe("role editor on a phone @area:admin", () => {
    test("at 375 px: full screen, only the content scrolls, Save and Cancel outside it @ADM-194", async () => {
        setViewportWidth(375);
        const {dialog} = await openEditor();
        expect(dialog).toHaveClass("MuiDialog-paperFullScreen");
        const content = dialog.querySelector<HTMLElement>(".MuiDialogContent-root")!;
        expect(content).toContainElement(within(dialog).getByRole("checkbox", {name: AR.drugsList}));
        for (const button of ["حفظ", "إلغاء"]) {
            const control = within(dialog).getByRole("button", {name: button});
            expect(content).not.toContainElement(control);
            expect(control.closest(".MuiDialogActions-root")).not.toBeNull();
        }
        // The content is the part that scrolls (MUI DialogContent: overflow-y auto) inside the flex-column form
        expect(getComputedStyle(content).overflowY).toBe("auto");
    });
});

describe("role editor: the permission catalog @area:admin", () => {
    const openWithCatalog = async (catalogHandler: Parameters<typeof server.use>[0]) => {
        const clinic = aClinicDetails();
        server.use(rolesHandler(clinic.id, defaultRoles()), catalogHandler);
        const rendered = await renderWithProviders(<RoleEditorHarness clinicId={clinic.id} role={null}/>, {user: {context: "platform"}});
        return {...rendered, dialog: await screen.findByRole("dialog")};
    };

    test("loading: a spinner in the editor; then the form @ADM-191", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        const {dialog} = await openWithCatalog(http.get(api("/permissions"), async () => {
            await answered;
            return HttpResponse.json(PERMISSION_CATALOG);
        }));
        expect(within(dialog).getByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
        answer();
        expect(await within(dialog).findAllByRole("checkbox")).toHaveLength(11);
    });

    test("failed: \"Couldn't load data.\" with Retry, which loads it @ADM-191", async () => {
        let calls = 0;
        const {user, dialog} = await openWithCatalog(http.get(api("/permissions"), () =>
            // The first load and its one retry (a 5xx is retried once, as in the app) fail
            (++calls <= 2 ? problem(500, "unexpected") : HttpResponse.json(PERMISSION_CATALOG))));
        expect(await within(dialog).findByText("Couldn't load data.")).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", {name: "Retry"}));
        expect(await within(dialog).findAllByRole("checkbox")).toHaveLength(11);
    });
});
