import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    adminClinicsHandlers,
    anOwnerRole,
    api,
    aStaffMember,
    fillIn,
    problem,
    recordRequests,
    rolesHandler,
    server,
    staffHandler,
} from "../../../test";
import {navigateInApp, renderAdmin} from "../../../test/pages/admin.tsx";

// The clinic page: docs/features/platform-admin/business.md "الشاشات" (صفحة العيادة) and "الرسائل التي تظهر
// للمستخدم"; tech.md "Frontend" (/admin/clinics/:id: ClinicPage) and "Roles and staff screens" (ClinicPage keys its
// PageBoundary by the clinic id).

const header = () => screen.getByRole("heading", {level: 1});

describe("clinic page @area:admin", () => {
    test.each(["05", "abc", "0", "-1", "99999999999"])("the id %s: \"Clinic not found\", no request sent @ADM-096", async (id) => {
        const recorded = recordRequests();
        await renderAdmin(`/admin/clinics/${id}`);
        expect(await screen.findByText("Clinic not found")).toBeInTheDocument();
        expect(screen.getByText("This clinic doesn't exist or was deleted.")).toBeInTheDocument();
        expect(screen.getByRole("link", {name: "Back to clinics"})).toHaveAttribute("href", "/admin");
        expect(recorded.requests).toEqual([]);
    });

    test("a malformed id in Arabic: «العيادة غير موجودة» @ADM-096", async () => {
        await renderAdmin("/admin/clinics/abc", {lang: "ar"});
        expect(await screen.findByText("العيادة غير موجودة")).toBeInTheDocument();
        expect(screen.getByText("هذه العيادة غير موجودة أو تم حذفها.")).toBeInTheDocument();
    });

    test("the details request fails (500): the header with Back and «تعذّر تحميل البيانات.» with Retry @ADM-097", async () => {
        const clinic = aClinicDetails({name: "Clinic A"});
        let calls = 0;
        // The first load and its one retry (a 5xx is retried once, as in the app) fail
        server.use(http.get(api(`/admin/clinics/${clinic.id}`), () => (++calls <= 2 ? problem(500, "unexpected") : HttpResponse.json(clinic))));
        const {user} = await renderAdmin(`/admin/clinics/${clinic.id}`, {lang: "ar"});

        expect(await screen.findByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "رجوع"})).toBeInTheDocument();
        expect(header()).toHaveTextContent("العيادة");
        await user.click(screen.getByRole("button", {name: "إعادة المحاولة"}));
        await waitFor(() => expect(header()).toHaveTextContent("Clinic A"));
    });

    test("the details request fails, in English: \"Couldn't load data.\" with Retry and Back @ADM-097", async () => {
        const clinic = aClinicDetails();
        server.use(http.get(api(`/admin/clinics/${clinic.id}`), () => problem(500, "unexpected")));
        await renderAdmin(`/admin/clinics/${clinic.id}`);
        expect(await screen.findByText("Couldn't load data.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Back"})).toBeInTheDocument();
    });

    test("a long name: the header cuts it after 3 lines, the full name in its tooltip @ADM-099", async () => {
        const name = "N".repeat(157);
        const clinic = aClinicDetails({name});
        server.use(...adminClinicsHandlers([clinic]));
        await renderAdmin(`/admin/clinics/${clinic.id}`);
        await waitFor(() => expect(header()).toHaveTextContent(name));
        expect(header()).toHaveAttribute("title", name);
        expect(getComputedStyle(header()).getPropertyValue("-webkit-line-clamp")).toBe("3");
        expect(header()).toHaveStyle({overflow: "hidden"});
    });

    test("from A's Staff tab with a search, a page and an open dialog to B's Staff tab: nothing of A follows @ADM-100", async () => {
        const a = aClinicDetails({name: "Clinic A"});
        const b = aClinicDetails({name: "Clinic B"});
        const aStaff = Array.from({length: 25}, (_, i) => aStaffMember({fullName: `Ahmed ${String(i + 1).padStart(2, "0")}`}));
        const bStaff = [aStaffMember({fullName: "Basma"})];
        server.use(
            ...adminClinicsHandlers([a, b]),
            staffHandler(a.id, aStaff), staffHandler(b.id, bStaff),
            rolesHandler(a.id, [anOwnerRole()]), rolesHandler(b.id, [anOwnerRole()]),
        );
        const {user} = await renderAdmin(`/admin/clinics/${a.id}/staff`);
        await screen.findByText("Ahmed 01");
        await fillIn(user, screen.getByRole("searchbox", {name: "Search by name or number…"}), "Ahmed");
        await screen.findByText("25 results");
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Ahmed 21");
        await user.click(screen.getByRole("button", {name: "Add staff member"}));
        await screen.findByRole("dialog");

        const recorded = recordRequests();
        await navigateInApp(`/admin/clinics/${b.id}/staff`);

        await waitFor(() => expect(header()).toHaveTextContent("Clinic B"));
        expect(await screen.findByText("Basma")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByRole("searchbox", {name: "Search by name or number…"})).toHaveValue("");
        expect(screen.queryByText(/^Ahmed/)).not.toBeInTheDocument();
        expect(screen.getByText("1 staff member")).toBeInTheDocument();
        const bLists = recorded.requests.filter(r => r.path === `/admin/clinics/${b.id}/staff`).map(r => new URLSearchParams(r.search));
        expect(bLists[0].get("page")).toBe("1");
        expect(bLists[0].get("search")).toBeNull();
    });

    test("A's Staff tab open, A deleted elsewhere, the list reloads (search change): \"Clinic not found\" @ADM-274", async () => {
        const a = aClinicDetails({name: "Clinic A"});
        let deleted = false;
        server.use(
            http.get(api(`/admin/clinics/${a.id}`), () => (deleted ? problem(404, "notFound") : HttpResponse.json(a))),
            rolesHandler(a.id, [anOwnerRole()]),
            http.get(api(`/admin/clinics/${a.id}/staff`), () => (deleted
                ? problem(404, "notFound")
                : HttpResponse.json({items: [aStaffMember({fullName: "Dr. Sara"})], totalCount: 1, page: 1, pageSize: 20}))),
        );
        const {user} = await renderAdmin(`/admin/clinics/${a.id}/staff`);
        await screen.findByText("Dr. Sara");

        deleted = true;
        await fillIn(user, screen.getByRole("searchbox", {name: "Search by name or number…"}), "sara");
        expect(await screen.findByText("Clinic not found")).toBeInTheDocument();
    });
});
