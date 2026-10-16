import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    adminClinicsHandlers,
    api,
    aStaffMember,
    fillIn,
    problem,
    rolesHandler,
    server,
} from "../../../test";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {asStaffRole, openStaffTab, staffRoles, staffRows, staffSubtitle} from "../../../test/pages/staffTab.ts";

// The Staff tab: docs/features/platform-admin/business.md "الشاشات" (تبويب «الموظفون»), "الموظفون" and "الرسائل التي
// تظهر للمستخدم"; tech.md "Roles and staff screens" (StaffList: subtitle plural forms, search, paging, remove).

const people = (count: number, name: (i: number) => string = i => `Person ${String(i + 1).padStart(2, "0")}`) =>
    Array.from({length: count}, (_, i) => aStaffMember({fullName: name(i)}));
const search = () => screen.getByRole("searchbox", {name: /^(Search by name or number…|ابحث بالاسم أو الرقم…)$/});

describe("staff list @area:admin", () => {
    test("each row: the name, the phone left to right, the role chips (the Owner filled, «المالك»), «نشط» / «غير نشط» @ADM-236 @smoke", async () => {
        const {owner, assistant} = staffRoles();
        await openStaffTab([
            aStaffMember({fullName: "د. سارة", phone: "+201001234567", isActive: true, roles: [asStaffRole(owner), asStaffRole(assistant)]}),
            aStaffMember({fullName: "نور", phone: "+201001234568", isActive: false, roles: [asStaffRole(assistant)]}),
        ], {lang: "ar"});
        const [sara, nour] = staffRows();
        expect(within(sara).getByText("د. سارة")).toBeInTheDocument();
        for (const phone of within(sara).getAllByText("+201001234567")) expect(phone).toHaveAttribute("dir", "ltr");
        const ownerChip = within(sara).getByText("المالك").closest(".MuiChip-root");
        expect(ownerChip).toHaveClass("MuiChip-filled", "MuiChip-colorPrimary");
        const assistantChip = within(sara).getByText("Assistant").closest(".MuiChip-root");
        expect(assistantChip).toHaveClass("MuiChip-outlined");
        expect(within(sara).getAllByText("نشط").length).toBeGreaterThan(0);
        expect(within(nour).getAllByText("غير نشط").length).toBeGreaterThan(0);
        expect(within(nour).queryByText("نشط")).not.toBeInTheDocument();
    });

    test("in English: \"Owner\", \"Active\" / \"Inactive\" @ADM-236", async () => {
        const {owner} = staffRoles();
        await openStaffTab([
            aStaffMember({fullName: "Dr. Sara", isActive: true, roles: [asStaffRole(owner)]}),
            aStaffMember({fullName: "Nour", isActive: false, roles: []}),
        ]);
        const [sara, nour] = staffRows();
        expect(within(sara).getByText("Owner").closest(".MuiChip-root")).toHaveClass("MuiChip-filled");
        expect(within(sara).getAllByText("Active").length).toBeGreaterThan(0);
        expect(within(nour).getAllByText("Inactive").length).toBeGreaterThan(0);
    });

    test("the Owner chip reads «المالك» in Arabic (stored name \"Owner\") @ADM-258", async () => {
        const {owner} = staffRoles();
        expect(owner.name).toBe("Owner");
        await openStaffTab([aStaffMember({fullName: "د. سارة", roles: [asStaffRole(owner)]})], {lang: "ar"});
        expect(within(staffRows()[0]).getByText("المالك")).toBeInTheDocument();
        expect(within(staffRows()[0]).queryByText("Owner")).not.toBeInTheDocument();
    });

    test.each([
        ["ar", 1, "موظف واحد"], ["ar", 2, "موظفان"], ["ar", 3, "3 موظفين"], ["ar", 11, "11 موظفًا"],
        ["en", 1, "1 staff member"], ["en", 3, "3 staff members"],
    ] as const)("the subtitle with %s and %i staff: %s @ADM-237", async (lang, count, subtitle) => {
        await openStaffTab(people(count), {lang});
        expect(staffSubtitle()).toBe(subtitle);
    });

    test.each([["ar", "3 نتائج"], ["en", "3 results"]] as const)("a search with 3 matches (%s): «%s» instead of the staff count @ADM-238", async (lang, subtitle) => {
        const {user} = await openStaffTab([...people(3, i => `Ahmed ${i}`), ...people(5)], {lang});
        await fillIn(user, search(), "ahmed");
        await waitFor(() => expect(staffSubtitle()).toBe(subtitle));
        expect(staffRows()).toHaveLength(3);
    });

    test.each([["ar", "لا يوجد موظفون مطابقون للبحث."], ["en", "No staff members match your search."]] as const)(
        "a search with no match (%s): %s @ADM-239", async (lang, message) => {
            const {user} = await openStaffTab(people(3), {lang});
            await user.type(search(), "zzz");
            expect(await screen.findByText(message)).toBeInTheDocument();
        });

    test("no staff rows at all: «لا يوجد موظفون بعد» with the hint @ADM-240", async () => {
        await openStaffTab([], {lang: "ar"});
        expect(await screen.findByText("لا يوجد موظفون بعد")).toBeInTheDocument();
        expect(screen.getByText("أضف الأشخاص برقم الموبايل واختر أدوارهم.")).toBeInTheDocument();
    });

    test("no staff rows at all, in English: \"No staff yet\" @ADM-240", async () => {
        await openStaffTab([]);
        expect(await screen.findByText("No staff yet")).toBeInTheDocument();
        expect(screen.getByText("Add people by their mobile number and choose their roles.")).toBeInTheDocument();
    });

    test("Remove: the confirm «إزالة «الاسم» من العيادة؟ …» with the focus on Cancel @ADM-252", async () => {
        const {user} = await openStaffTab([aStaffMember({fullName: "نور"})], {lang: "ar"});
        await user.click(screen.getByRole("button", {name: "إزالة «⁨نور⁩»"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading")).toHaveTextContent("إزالة «⁨نور⁩» من العيادة؟");
        expect(within(dialog).getByText("يفقد الدخول إلى هذه العيادة بمجرد قيامه بأي إجراء تالٍ. يبقى حسابه وعياداته الأخرى كما هي، ويمكنك إضافته من جديد لاحقًا."))
            .toBeInTheDocument();
        await waitFor(() => expect(within(dialog).getByRole("button", {name: "إلغاء"})).toHaveFocus());
    });

    test("the Remove confirm in English @ADM-252", async () => {
        const {user} = await openStaffTab([aStaffMember({fullName: "Nour"})]);
        await user.click(screen.getByRole("button", {name: "Remove “⁨Nour⁩”"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading")).toHaveTextContent("Remove “⁨Nour⁩” from the clinic?");
        expect(within(dialog).getByText("They lose access to this clinic on their next action. Their account and their other clinics are kept, and you can add them again later."))
            .toBeInTheDocument();
        await waitFor(() => expect(within(dialog).getByRole("button", {name: "Cancel"})).toHaveFocus());
    });

    test("the staff request fails: «تعذّر تحميل البيانات.» with Retry @ADM-256", async () => {
        const clinic = aClinicDetails();
        let calls = 0;
        server.use(
            ...adminClinicsHandlers([clinic]),
            // The Staff tab also asks for the clinic's roles (adminRolesApi, for the staff editor)
            rolesHandler(clinic.id, Object.values(staffRoles())),
            http.get(api(`/admin/clinics/${clinic.id}/staff`), () => (++calls === 1
                ? problem(500, "unexpected")
                : HttpResponse.json({items: [aStaffMember({fullName: "نور"})], totalCount: 1, page: 1, pageSize: 20}))),
        );
        const {user} = await renderAdmin(`/admin/clinics/${clinic.id}/staff`, {lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "إعادة المحاولة"}));
        expect(await screen.findByText("نور")).toBeInTheDocument();
    });

    test("the staff request fails, in English: \"Couldn't load data.\" with Retry @ADM-256", async () => {
        const clinic = aClinicDetails();
        server.use(
            ...adminClinicsHandlers([clinic]),
            rolesHandler(clinic.id, Object.values(staffRoles())),
            http.get(api(`/admin/clinics/${clinic.id}/staff`), () => problem(500, "unexpected")),
        );
        await renderAdmin(`/admin/clinics/${clinic.id}/staff`);
        expect(await screen.findByText("Couldn't load data.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
    });
});
