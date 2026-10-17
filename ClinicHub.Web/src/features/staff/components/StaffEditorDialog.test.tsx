import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    api,
    aStaffMember,
    clickOutside,
    expectStillOpen,
    fillIn,
    findToast,
    problem,
    recordRequests,
    renderWithProviders,
    rolesHandler,
    server,
    staffHandler,
} from "../../../test";
import type {Role} from "../../roles/types.ts";
import type {StaffMember} from "../types.ts";
import {StaffEditorHarness} from "../../../test/pages/EditorHarness.tsx";
import {adminRolesApi, adminStaffApi} from "../../admin/adapters.ts";
import {StaffEditorDialog} from "./StaffEditorDialog.tsx";
import {asStaffRole, openStaffTab, staffRoles} from "../../../test/pages/staffTab.ts";

// The staff editor: docs/features/platform-admin/business.md "الشاشات" (إضافة موظف / تعديل موظف), "الموظفون" and
// "الرسائل التي تظهر للمستخدم"; tech.md "API" (staff: 400 invalidPhone `phone`, rolesRequired / roleNotFound `roleIds`,
// 409 staffExists, 404) and "Roles and staff screens" (StaffEditorDialog).

const LABELS = {
    ar: {phone: /^رقم الموبايل/, fullName: /^الاسم الكامل/, add: "إضافة موظف", save: "حفظ", submitAdd: "إضافة"},
    en: {phone: /^Mobile number/, fullName: /^Full name/, add: "Add staff member", save: "Save", submitAdd: "Add"},
};

/** The staff editor of a clinic with `roles`, as the Staff tab opens it (to add someone when `member` is null). */
const renderEditor = async (lang: "ar" | "en", member: StaffMember | null, roles: Role[] = Object.values(staffRoles())) => {
    const clinic = aClinicDetails();
    server.use(rolesHandler(clinic.id, roles));
    const rendered = await renderWithProviders(<StaffEditorHarness clinicId={clinic.id} member={member}/>, {lang, user: {context: "platform"}});
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findAllByRole("checkbox");
    return {...rendered, clinic, dialog};
};

const openAdd = async (lang: "ar" | "en" = "ar") => {
    const rendered = await renderEditor(lang, null);
    const {dialog} = rendered;
    const phone = await within(dialog).findByRole("textbox", {name: LABELS[lang].phone});
    const fullName = within(dialog).getByRole("textbox", {name: LABELS[lang].fullName});
    const submit = () => rendered.user.click(within(dialog).getByRole("button", {name: LABELS[lang].submitAdd}));
    return {...rendered, dialog, phone, fullName, submit};
};

/** The roles error is the role boxes' own (tech "StaffEditorDialog": `aria-invalid` and the message as their description). */
const expectRolesError = (dialog: HTMLElement, message: string) => {
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
        expect(box).toHaveAttribute("aria-invalid", "true");
        expect(box).toHaveAccessibleDescription(message);
    }
};

describe("add a staff member @area:admin", () => {
    test("the dialog: the phone (LTR, its hint), the full name, a box per role (the Owner as \"Owner\" with \"Every permission\") @ADM-244", async () => {
        const {dialog, phone, fullName} = await openAdd("en");
        expect(within(dialog).getByRole("heading", {name: "Add staff member"})).toBeInTheDocument();
        expect(phone).toHaveAttribute("dir", "ltr");
        expect(phone).toHaveAttribute("type", "tel");
        expect(phone).toHaveAccessibleDescription("For example 01001234567. If this number already has an account (in another clinic, say), that account is used.");
        expect(fullName).toBeEnabled();
        const boxes = within(dialog).getAllByRole("checkbox");
        expect(boxes.map(b => b.closest("label")?.textContent)).toEqual(["OwnerEvery permission", "Assistant", "Doctor"]);
    });

    test("in Arabic: the Owner as «المالك» with «كل الصلاحيات» @ADM-244", async () => {
        const {dialog, phone} = await openAdd("ar");
        expect(phone).toHaveAccessibleDescription("مثال: 01001234567. إن كان للرقم حساب من قبل (في عيادة أخرى مثلًا) يُستخدم نفس الحساب.");
        expect(within(dialog).getByRole("checkbox", {name: /^المالك/}).closest("label")).toHaveTextContent("المالككل الصلاحيات");
    });

    test("the Owner role choice reads «المالك» in Arabic @ADM-259", async () => {
        const {dialog} = await openAdd("ar");
        expect(within(dialog).getByText("المالك")).toBeInTheDocument();
        expect(within(dialog).queryByText("Owner")).not.toBeInTheDocument();
    });

    test("submitted empty: «رقم الموبايل مطلوب.», «الاسم مطلوب.», «اختر دورًا واحدًا على الأقل.», the focus on the phone, no request @ADM-245", async () => {
        const recorded = recordRequests();
        const {user, dialog, phone, fullName, submit} = await openAdd("ar");
        await user.click(fullName);
        await submit();

        expect(phone).toHaveAccessibleDescription("رقم الموبايل مطلوب.");
        expect(fullName).toHaveAccessibleDescription("الاسم مطلوب.");
        expect(within(dialog).getByText("اختر دورًا واحدًا على الأقل.")).toBeInTheDocument();
        expectRolesError(dialog, "اختر دورًا واحدًا على الأقل.");
        await waitFor(() => expect(phone).toHaveFocus());
        expect(recorded.writes()).toEqual([]);
    });

    test("submitted empty, in English @ADM-245", async () => {
        const {dialog, phone, fullName, submit} = await openAdd("en");
        await submit();
        expect(phone).toHaveAccessibleDescription("Mobile number is required.");
        expect(fullName).toHaveAccessibleDescription("Name is required.");
        expect(within(dialog).getByText("Choose at least one role.")).toBeInTheDocument();
        expectRolesError(dialog, "Choose at least one role.");
    });

    const fillAndSubmit = async (form: Awaited<ReturnType<typeof openAdd>>, roleName: RegExp = /Assistant/) => {
        await fillIn(form.user, form.phone, "01001234567");
        await form.user.type(form.fullName, "نور");
        await form.user.click(within(form.dialog).getByRole("checkbox", {name: roleName}));
        await form.submit();
    };

    test("the API answers staffExists: «هذا الرقم مسجّل بالفعل كموظف في هذه العيادة.» under the phone, the focus there @ADM-246", async () => {
        const form = await openAdd("ar");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), () => problem(409, "staffExists")));
        await fillAndSubmit(form);
        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("هذا الرقم مسجّل بالفعل كموظف في هذه العيادة."));
        await waitFor(() => expect(form.phone).toHaveFocus());
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("staffExists in English: \"This number already belongs to a staff member of this clinic.\" @ADM-246", async () => {
        const form = await openAdd("en");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), () => problem(409, "staffExists")));
        await fillAndSubmit(form);
        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("This number already belongs to a staff member of this clinic."));
    });

    test("the API answers invalidPhone: «أدخل رقم موبايل صحيحًا.» under the phone @ADM-247", async () => {
        const form = await openAdd("ar");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), () =>
            problem(400, "invalidPhone", {errors: [{code: "invalidPhone", field: "phone"}]})));
        await fillAndSubmit(form);
        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("أدخل رقم موبايل صحيحًا."));
    });

    test("invalidPhone in English: \"Enter a valid mobile number.\" @ADM-247", async () => {
        const form = await openAdd("en");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), () =>
            problem(400, "invalidPhone", {errors: [{code: "invalidPhone", field: "phone"}]})));
        await fillAndSubmit(form);
        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("Enter a valid mobile number."));
    });

    test.each([
        ["rolesRequired", "اختر دورًا واحدًا على الأقل."],
        ["roleNotFound", "أحد الأدوار لم يعد موجودًا."],
    ] as const)("the API answers %s: the message under the roles, the boxes aria-invalid, the first box focused @ADM-248", async (code, message) => {
        const form = await openAdd("ar");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), () =>
            problem(400, code, {errors: [{code, field: "roleIds"}]})));
        await fillAndSubmit(form);

        await waitFor(() => expect(within(form.dialog).getByText(message)).toBeInTheDocument());
        expectRolesError(form.dialog, message);
        await waitFor(() => expect(within(form.dialog).getAllByRole("checkbox")[0]).toHaveFocus());
    });
});

describe("staff editor while saving @area:admin", () => {
    // The same guard as the role editor's ADM-193
    test("while adding, the editor can't be closed (Esc, backdrop, Cancel) until the answer @ADM-292", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        const form = await openAdd("ar");
        server.use(http.post(api(`/admin/clinics/${form.clinic.id}/staff`), async () => {
            await answered;
            return HttpResponse.json(aStaffMember({fullName: "نور"}), {status: 201});
        }));
        await fillIn(form.user, form.phone, "01001234567");
        await form.user.type(form.fullName, "نور");
        await form.user.click(within(form.dialog).getByRole("checkbox", {name: /Assistant/}));
        await form.submit();
        await waitFor(() => expect(within(form.dialog).getByRole("button", {name: "إلغاء"})).toBeDisabled());

        await form.user.keyboard("{Escape}");
        await expectStillOpen(form.dialog);
        await clickOutside(form.user, form.dialog);
        await expectStillOpen(form.dialog);
        expect(form.fullName).toHaveValue("نور");

        answer();
        expect(await findToast()).toBe("تمت إضافة «⁨نور⁩»");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});

describe("edit a staff member @area:admin", () => {
    /**
     * The editor of `member` (built from the clinic's default roles); `inList`: opened from the Staff tab (to see the
     * list reload), else alone.
     */
    const openEdit = async (lang: "ar" | "en", build: (roles: ReturnType<typeof staffRoles>) => StaffMember, inList = false) => {
        const roles = staffRoles();
        const member = build(roles);
        if (!inList) return {...await renderEditor(lang, member, Object.values(roles)), member};
        const rendered = await openStaffTab([member], {lang, roles: Object.values(roles)});
        await rendered.user.click(screen.getByRole("button", {name: lang === "ar" ? `تعديل «⁨${member.fullName}⁩»` : `Edit “⁨${member.fullName}⁩”`}));
        const dialog = await screen.findByRole("dialog");
        await within(dialog).findAllByRole("checkbox");
        return {...rendered, dialog, member};
    };

    test("the title «تعديل «الاسم»», the phone disabled with its hint, the name hint, the Active switch and what it means @ADM-250", async () => {
        const {user, dialog} = await openEdit("ar", () => aStaffMember({fullName: "نور", phone: "+201001234567", isActive: true}));
        expect(within(dialog).getByRole("heading")).toHaveTextContent("تعديل «⁨نور⁩»");
        const phone = within(dialog).getByRole("textbox", {name: /^رقم الموبايل/});
        expect(phone).toBeDisabled();
        expect(phone).toHaveValue("+201001234567");
        expect(phone).toHaveAccessibleDescription("لا يمكن تغيير الرقم. لاستخدام رقم آخر، أزل هذا الموظف ثم أضفه من جديد.");
        expect(within(dialog).getByRole("textbox", {name: /^الاسم الكامل/})).toHaveAccessibleDescription("الاسم المستخدم في هذه العيادة فقط.");
        const active = within(dialog).getByRole("switch", {name: "نشط"});
        expect(active).toBeChecked();
        expect(active).toHaveAccessibleDescription("يستطيع دخول العيادة.");
        await user.click(active);
        expect(active).not.toBeChecked();
        expect(active).toHaveAccessibleDescription("لا يستطيع دخول العيادة حتى يُفعَّل من جديد. تبقى أدواره محفوظة.");
    });

    test("in English @ADM-250", async () => {
        const {dialog} = await openEdit("en", () => aStaffMember({fullName: "Nour", isActive: false}));
        expect(within(dialog).getByRole("heading")).toHaveTextContent("Edit “⁨Nour⁩”");
        expect(within(dialog).getByRole("textbox", {name: /^Mobile number/})).toHaveAccessibleDescription(
            "The number can't be changed. To use another one, remove this staff member and add them again.");
        expect(within(dialog).getByRole("textbox", {name: /^Full name/})).toHaveAccessibleDescription("The name used in this clinic only.");
        expect(within(dialog).getByRole("switch", {name: "Active"})).toHaveAccessibleDescription(
            "Can't enter the clinic until switched back on. Their roles are kept.");
    });

    test("the person was removed in another window: Save → the notFound toast, the dialog closes, the list reloads @ADM-276", async () => {
        const {user, dialog, clinic, member} = await openEdit("ar", ({assistant}) => aStaffMember({fullName: "نور", roles: [asStaffRole(assistant)]}), true);
        server.use(
            http.put(api(`/admin/clinics/${clinic.id}/staff/${member.id}`), () => problem(404, "notFound")),
            staffHandler(clinic.id, []),
        );
        const recorded = recordRequests();
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        expect(await findToast()).toBe("هذا العنصر لم يعد موجودًا.");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(await screen.findByText("لا يوجد موظفون بعد")).toBeInTheDocument();
        expect(recorded.requests.some(r => r.method === "GET" && r.path === `/admin/clinics/${clinic.id}/staff`)).toBe(true);
    });

    test("the notFound toast in English: \"This item no longer exists.\" @ADM-276", async () => {
        const {user, dialog, clinic, member} = await openEdit("en", ({assistant}) => aStaffMember({fullName: "Nour", roles: [asStaffRole(assistant)]}));
        server.use(http.put(api(`/admin/clinics/${clinic.id}/staff/${member.id}`), () => problem(404, "notFound")));
        await user.click(within(dialog).getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("This item no longer exists.");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    test("a ticked role deleted in another window: Save → roleNotFound on the roles, the roles reload without it @ADM-278", async () => {
        const {owner, assistant} = staffRoles();
        const editors = {...assistant, name: "Editors"};
        const member = aStaffMember({fullName: "نور", roles: [asStaffRole(owner), asStaffRole(editors)]});
        const rendered = await renderEditor("ar", member, [owner, editors]);
        const {dialog} = rendered;
        expect(within(dialog).getByRole("checkbox", {name: "Editors"})).toBeChecked();
        // Meanwhile, "Editors" is deleted in another window
        server.use(
            rolesHandler(rendered.clinic.id, [owner]),
            http.put(api(`/admin/clinics/${rendered.clinic.id}/staff/${member.id}`), () =>
                problem(400, "roleNotFound", {errors: [{code: "roleNotFound", field: "roleIds"}]})),
        );
        await rendered.user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        await waitFor(() => expect(within(dialog).getByText("أحد الأدوار لم يعد موجودًا.")).toBeInTheDocument());
        await waitFor(() => expect(within(dialog).queryByRole("checkbox", {name: "Editors"})).not.toBeInTheDocument());
        expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("roleNotFound in English: \"One of the roles no longer exists.\" @ADM-278", async () => {
        const {user, dialog, clinic, member} = await openEdit("en", ({assistant}) => aStaffMember({fullName: "Nour", roles: [asStaffRole(assistant)]}));
        server.use(http.put(api(`/admin/clinics/${clinic.id}/staff/${member.id}`), () =>
            problem(400, "roleNotFound", {errors: [{code: "roleNotFound", field: "roleIds"}]})));
        await user.click(within(dialog).getByRole("button", {name: "Save"}));
        await waitFor(() => expect(within(dialog).getByText("One of the roles no longer exists.")).toBeInTheDocument());
    });

    test("a save that succeeds closes with the saved toast (the control of the notFound case)", async () => {
        const {user, dialog, clinic, member} = await openEdit("en", ({assistant}) => aStaffMember({fullName: "Nour", roles: [asStaffRole(assistant)]}));
        server.use(http.put(api(`/admin/clinics/${clinic.id}/staff/${member.id}`), () => HttpResponse.json(member)));
        await user.click(within(dialog).getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("“⁨Nour⁩” saved");
    });
});

describe("staff editor: locked once saved @area:admin", () => {
    test.each([
        ["added", () => HttpResponse.json(aStaffMember({fullName: "نور"}), {status: 201})],
        ["the clinic gone meanwhile (404: the dialog closes)", () => problem(404, "notFound")],
    ] as const)("%s: «إضافة» stays disabled and Enter sends nothing more while it closes @UX-040", async (_, answer) => {
        const clinic = aClinicDetails();
        server.use(rolesHandler(clinic.id, Object.values(staffRoles())),
            http.post(api(`/admin/clinics/${clinic.id}/staff`), answer));
        const onClose = vi.fn();
        // Kept rendered open after onClose: as during its closing animation
        const {user} = await renderWithProviders(
            <StaffEditorDialog open member={null} adapter={adminStaffApi(clinic.id)} rolesAdapter={adminRolesApi(clinic.id)} onClose={onClose}/>,
            {lang: "ar", user: {context: "platform"}});
        const dialog = await screen.findByRole("dialog");
        const [, firstRole] = await within(dialog).findAllByRole("checkbox");
        const fullName = within(dialog).getByRole("textbox", {name: LABELS.ar.fullName});
        await fillIn(user, within(dialog).getByRole("textbox", {name: LABELS.ar.phone}), "01001234567");
        await fillIn(user, fullName, "نور");
        await user.click(firstRole);
        const recorded = recordRequests();
        await user.click(within(dialog).getByRole("button", {name: LABELS.ar.submitAdd}));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

        await waitFor(() => expect(within(dialog).getByRole("button", {name: LABELS.ar.submitAdd})).toBeDisabled());
        await user.type(fullName, "{Enter}");
        expect(recorded.writes()).toHaveLength(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
