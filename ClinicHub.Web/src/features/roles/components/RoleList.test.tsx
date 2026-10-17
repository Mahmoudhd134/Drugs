import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    adminClinicsHandlers,
    ALL_PERMISSIONS,
    anOwnerRole,
    api,
    aRole,
    findToast,
    hoverTooltip,
    tapTooltip,
    isolate,
    leaveTooltip,
    PERMISSION_CATALOG,
    permissionsHandler,
    problem,
    server,
} from "../../../test";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {defaultRoles, openRolesTab, ROLE_KEYS, roleRow, roleRows} from "../../../test/pages/rolesTab.ts";

// The Roles tab: docs/features/platform-admin/business.md "الشاشات" (تبويب «الأدوار»), "الأدوار" and "الرسائل التي تظهر
// للمستخدم"; tech.md "Roles and staff screens" (RoleList) and the Owner label (M1.6.0, roleLabel.ts).

const summaryOf = (row: HTMLElement) => row.querySelector("td p")?.textContent;
const deleteButton = (row: HTMLElement) => within(row).getByRole("button", {name: /^(Delete|حذف) /});

describe("roles list @area:admin", () => {
    test("the Owner role first, «المالك» with «مقفل», no actions, «كل الصلاحيات دائمًا…» @ADM-173", async () => {
        await openRolesTab(defaultRoles(), {lang: "ar"});
        const [owner] = roleRows();
        expect(within(owner).getByText("المالك")).toBeInTheDocument();
        expect(within(owner).getByText("مقفل")).toBeInTheDocument();
        expect(summaryOf(owner)).toBe("كل الصلاحيات دائمًا. لا يمكن تعديل هذا الدور أو حذفه.");
        expect(within(owner).queryByRole("button")).not.toBeInTheDocument();
        expect(within(roleRows()[1]).getAllByRole("button")).toHaveLength(2);
    });

    test("in English: \"Owner\" with \"Locked\" and \"Every permission, always…\" @ADM-173", async () => {
        await openRolesTab(defaultRoles());
        const [owner] = roleRows();
        expect(within(owner).getByText("Owner")).toBeInTheDocument();
        expect(within(owner).getByText("Locked")).toBeInTheDocument();
        expect(summaryOf(owner)).toBe("Every permission, always. This role can't be changed or deleted.");
        expect(within(owner).queryByRole("button")).not.toBeInTheDocument();
    });

    test("the summaries: all, 9 on three resources, 6 on two, none, one, two @ADM-174", async () => {
        await openRolesTab([
            anOwnerRole(),
            aRole({name: "Doctor", permissions: [...ALL_PERMISSIONS]}),
            aRole({name: "Assistant", permissions: [...ROLE_KEYS.assistant]}),
            aRole({name: "Group editors", permissions: [...ROLE_KEYS.groupEditors]}),
            aRole({name: "Nothing", permissions: []}),
            aRole({name: "One", permissions: ["drugs.list"]}),
            aRole({name: "Two", permissions: ["drugs.list", "groups.list"]}),
        ], {lang: "ar"});
        await waitFor(() => expect(summaryOf(roleRow("Doctor"))).toBe("كل الصلاحيات"));
        expect(summaryOf(roleRow("Assistant"))).toBe("9 صلاحيات: الأدوية، المجموعات، الروشتة");
        expect(summaryOf(roleRow("Group editors"))).toBe("6 صلاحيات: الأدوية، المجموعات");
        expect(summaryOf(roleRow("Nothing"))).toBe("بلا صلاحيات");
        expect(summaryOf(roleRow("One"))).toBe("صلاحية واحدة: الأدوية");
        expect(summaryOf(roleRow("Two"))).toBe("صلاحيتان: الأدوية، المجموعات");
    });

    test("the summaries in English @ADM-174", async () => {
        await openRolesTab([
            anOwnerRole(),
            aRole({name: "Doctor", permissions: [...ALL_PERMISSIONS]}),
            aRole({name: "Assistant", permissions: [...ROLE_KEYS.assistant]}),
            aRole({name: "Nothing", permissions: []}),
        ]);
        await waitFor(() => expect(summaryOf(roleRow("Doctor"))).toBe("All permissions"));
        expect(summaryOf(roleRow("Assistant"))).toBe("9 permissions: Drugs, Groups, Prescription");
        expect(summaryOf(roleRow("Nothing"))).toBe("No permissions");
    });

    test("11 of a longer catalog: «11 صلاحية: …» @ADM-174", async () => {
        // A deployment that added a twelfth permission: 11 keys are no longer all of them
        const catalog = [...PERMISSION_CATALOG,
            {key: "prescriptions.print", module: "prescription", resource: "prescriptions", action: "print", requires: []}];
        await openRolesTab([anOwnerRole(), aRole({name: "Doctor", permissions: [...ALL_PERMISSIONS]})], {lang: "ar", catalog});
        await waitFor(() => expect(summaryOf(roleRow("Doctor"))).toBe("11 صلاحية: الأدوية، المجموعات، الروشتة"));
    });

    test("the staff column shows every holder the API counts (active or not) @ADM-175", async () => {
        await openRolesTab([anOwnerRole({staffCount: 2}), aRole({name: "Assistant", staffCount: 3}), aRole({name: "Doctor", staffCount: 0})]);
        expect(within(roleRow("Owner")).getByRole("cell", {name: "2"})).toBeInTheDocument();
        expect(within(roleRow("Assistant")).getByRole("cell", {name: "3"})).toBeInTheDocument();
        expect(within(roleRow("Doctor")).getByRole("cell", {name: "0"})).toBeInTheDocument();
    });

    test("a role held by 3: Delete disabled but focusable, the tooltip «ممنوح لـ 3 موظفين…»; held by 1: «ممنوح لموظف واحد…» @ADM-176", async () => {
        const {user} = await openRolesTab([anOwnerRole(), aRole({name: "Assistant", staffCount: 3}), aRole({name: "Viewer", staffCount: 1})], {lang: "ar"});
        const held = deleteButton(roleRow("Assistant"));
        expect(held).toHaveAttribute("aria-disabled", "true");
        expect(held).not.toBeDisabled();
        held.focus();
        expect(held).toHaveFocus();
        expect(await hoverTooltip(held)).toBe("ممنوح لـ 3 موظفين. أزِل هذا الدور من موظفيه أولًا.");
        await user.click(held);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await leaveTooltip(held);

        expect(await hoverTooltip(deleteButton(roleRow("Viewer")))).toBe("ممنوح لموظف واحد. أزِل هذا الدور من موظفيه أولًا.");
    });

    test("a quick tap on a held role's Delete (phone) shows «ممنوح لـ 3 موظفين…» at once @ADM-176", async () => {
        await openRolesTab([anOwnerRole(), aRole({name: "Assistant", staffCount: 3})], {lang: "ar"});
        expect(await tapTooltip(deleteButton(roleRow("Assistant")))).toBe("ممنوح لـ 3 موظفين. أزِل هذا الدور من موظفيه أولًا.");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("the held tooltip in English: \"Held by 3 staff members. Take it away from them first.\" @ADM-176", async () => {
        await openRolesTab([anOwnerRole(), aRole({name: "Assistant", staffCount: 3})]);
        expect(await hoverTooltip(deleteButton(roleRow("Assistant")))).toBe("Held by 3 staff members. Take it away from them first.");
    });

    test("deleting an unused role: the confirm «حذف الدور «X»؟ …» opens with the focus on Cancel @ADM-177", async () => {
        const {user} = await openRolesTab(defaultRoles(), {lang: "ar"});
        await user.click(deleteButton(roleRow("Doctor")));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading")).toHaveTextContent(`حذف الدور «${isolate("Doctor")}»؟`);
        expect(within(dialog).getByText("لا يمكن التراجع عن ذلك. لا يمكن حذف دور ممنوح لموظفين: أزِل هذا الدور من موظفيه أولًا.")).toBeInTheDocument();
        await waitFor(() => expect(within(dialog).getByRole("button", {name: "إلغاء"})).toHaveFocus());
    });

    test("the delete confirm in English @ADM-177", async () => {
        const {user} = await openRolesTab(defaultRoles());
        await user.click(deleteButton(roleRow("Doctor")));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading")).toHaveTextContent(`Delete the role “${isolate("Doctor")}”?`);
        expect(within(dialog).getByText("This can't be undone. A role held by staff members can't be deleted: take it away from them first.")).toBeInTheDocument();
        await waitFor(() => expect(within(dialog).getByRole("button", {name: "Cancel"})).toHaveFocus());
    });

    test("the roles request fails: «تعذّر تحميل البيانات.» with Retry @ADM-195", async () => {
        const clinic = aClinicDetails();
        let calls = 0;
        server.use(
            ...adminClinicsHandlers([clinic]), permissionsHandler(),
            // The first load and its one retry (a 5xx is retried once, as in the app) fail
            http.get(api(`/admin/clinics/${clinic.id}/roles`), () => (++calls <= 2 ? problem(500, "unexpected") : HttpResponse.json(defaultRoles()))),
        );
        const {user} = await renderAdmin(`/admin/clinics/${clinic.id}/roles`, {lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "إعادة المحاولة"}));
        await waitFor(() => expect(roleRows()).toHaveLength(3));
    });
});

describe("the Owner label and stored role names @area:admin", () => {
    test("the Owner role (isOwner, stored as \"Owner\" as the API returns it) reads «المالك» in Arabic and \"Owner\" in English @ADM-257", async () => {
        // The stored name the API returns (proven at api level) is the input here, not a check
        const roles = () => [anOwnerRole({name: "Owner"}), aRole({name: "Doctor"})];
        const arabic = await openRolesTab(roles(), {lang: "ar"});
        expect(within(roleRows()[0]).getByText("المالك")).toBeInTheDocument();
        expect(within(roleRows()[0]).queryByText("Owner")).not.toBeInTheDocument();
        arabic.unmount();

        await openRolesTab(roles());
        expect(within(roleRows()[0]).getByText("Owner")).toBeInTheDocument();
        expect(within(roleRows()[0]).queryByText("المالك")).not.toBeInTheDocument();
    });

    test("Doctor, Assistant and «قراءة فقط» show as stored, in both languages @ADM-260", async () => {
        const roles = () => [anOwnerRole(), aRole({name: "Doctor"}), aRole({name: "Assistant"}), aRole({name: "قراءة فقط"})];
        const first = await openRolesTab(roles(), {lang: "ar"});
        for (const name of ["Doctor", "Assistant", "قراءة فقط"]) expect(roleRow(name)).toBeInTheDocument();
        first.unmount();
        await openRolesTab(roles());
        for (const name of ["Doctor", "Assistant", "قراءة فقط"]) expect(roleRow(name)).toBeInTheDocument();
    });

    test("a role named \"Owner\" without isOwner keeps its name; only the isOwner role gets «المالك» @ADM-261", async () => {
        await openRolesTab([anOwnerRole(), aRole({name: "Owner", isOwner: false, staffCount: 0})], {lang: "ar"});
        const [real, other] = roleRows();
        expect(within(real).getByText("المالك")).toBeInTheDocument();
        expect(within(real).getByText("مقفل")).toBeInTheDocument();
        expect(within(other).getByText("Owner")).toBeInTheDocument();
        expect(within(other).queryByText("المالك")).not.toBeInTheDocument();
        expect(within(other).queryByText("مقفل")).not.toBeInTheDocument();
    });
});

describe("a role given to someone in another window @area:admin", () => {
    test("Delete of a role shown unused answers roleInUse: the toast and the list reloads with the new count @ADM-277", async () => {
        const doctor = aRole({name: "Doctor", staffCount: 0});
        const {user, clinic} = await openRolesTab([anOwnerRole(), doctor], {lang: "ar"});
        // Meanwhile, in another window, Doctor was given to someone
        server.use(
            http.get(api(`/admin/clinics/${clinic.id}/roles`), () => HttpResponse.json([anOwnerRole(), {...doctor, staffCount: 1}])),
            http.delete(api(`/admin/clinics/${clinic.id}/roles/${doctor.id}`), () => problem(409, "roleInUse")),
        );
        await user.click(deleteButton(roleRow("Doctor")));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: "حذف"}));

        expect(await findToast()).toBe("هذا الدور ممنوح لموظفين. أزِل هذا الدور من موظفيه أولًا.");
        await waitFor(() => expect(within(roleRow("Doctor")).getByRole("cell", {name: "1"})).toBeInTheDocument());
        expect(deleteButton(roleRow("Doctor"))).toHaveAttribute("aria-disabled", "true");
    });

    test("the roleInUse toast in English @ADM-277", async () => {
        const doctor = aRole({name: "Doctor", staffCount: 0});
        const {user, clinic} = await openRolesTab([anOwnerRole(), doctor]);
        server.use(http.delete(api(`/admin/clinics/${clinic.id}/roles/${doctor.id}`), () => problem(409, "roleInUse")));
        await user.click(deleteButton(roleRow("Doctor")));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: "Delete"}));
        expect(await findToast()).toBe("This role is assigned to staff members. Take it away from them first.");
    });
});
