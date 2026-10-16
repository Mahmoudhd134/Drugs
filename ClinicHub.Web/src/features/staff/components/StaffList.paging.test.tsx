import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    adminClinicsHandlers,
    api,
    aStaffMember,
    fillIn,
    recordRequests,
    rolesHandler,
    server,
} from "../../../test";
import type {StaffMember} from "../types.ts";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {openStaffTab, staffRoles, staffSubtitle, watchForText} from "../../../test/pages/staffTab.ts";

// The Staff tab's paging: docs/features/platform-admin/tech.md "Roles and staff screens" (StaffList: the page belongs
// to the search it was picked for; a page past the end moves to the last, shown as loading meanwhile; ListPagination).

const people = (count: number, name: (i: number) => string = i => `Person ${String(i + 1).padStart(2, "0")}`) =>
    Array.from({length: count}, (_, i) => aStaffMember({fullName: name(i)}));
const search = () => screen.getByRole("searchbox", {name: /^(Search by name or number…|ابحث بالاسم أو الرقم…)$/});
const staffRequests = (requests: { path: string; search: string }[], clinicId: number) =>
    requests.filter(r => r.path === `/admin/clinics/${clinicId}/staff`).map(r => new URLSearchParams(r.search));

describe("staff list: paging @area:admin", () => {
    test("page 3 of a search, then another search: its first request asks its first page @ADM-242", async () => {
        const {user, clinic} = await openStaffTab([...people(45, i => `Ahmed ${String(i + 1).padStart(2, "0")}`), ...people(3, i => `Ahmad ${i}`)]);
        await fillIn(user, search(), "ahmed");
        await waitFor(() => expect(staffSubtitle()).toBe("45 results"));
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Ahmed 21");
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Ahmed 41");

        const recorded = recordRequests();
        await user.clear(search());
        await fillIn(user, search(), "ahmad");
        await waitFor(() => expect(staffSubtitle()).toBe("3 results"));
        const ahmad = staffRequests(recorded.requests, clinic.id).filter(p => p.get("search") === "ahmad");
        expect(ahmad[0].get("page")).toBe("1");
        expect(ahmad.every(p => p.get("page") === "1")).toBe(true);
    });

    test("a page past the end (its last row removed) moves to the last page, never \"no match\" meanwhile @ADM-242", async () => {
        const staff: StaffMember[] = people(41);
        const clinic = aClinicDetails();
        server.use(
            ...adminClinicsHandlers([clinic]), rolesHandler(clinic.id, Object.values(staffRoles())),
            http.get(api(`/admin/clinics/${clinic.id}/staff`), ({request}) => {
                const params = new URL(request.url).searchParams;
                const page = Number(params.get("page"));
                const size = Number(params.get("pageSize"));
                return HttpResponse.json({items: staff.slice((page - 1) * size, page * size), totalCount: staff.length, page, pageSize: size});
            }),
            http.delete(api(`/admin/clinics/${clinic.id}/staff/:id`), ({params}) => {
                staff.splice(staff.findIndex(s => s.id === Number(params.id)), 1);
                return new HttpResponse(null, {status: 204});
            }),
        );
        const {user} = await renderAdmin(`/admin/clinics/${clinic.id}/staff`);
        await screen.findByText("Person 01");
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Person 21");
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Person 41");

        const noMatch = watchForText("No staff members match your search.");
        const noStaff = watchForText("No staff yet");
        await user.click(screen.getByRole("button", {name: "Remove “⁨Person 41⁩”"}));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: "Remove"}));

        await screen.findByText("Person 40");
        expect(screen.getByText("21–40 of 40")).toBeInTheDocument();
        expect(noMatch.seen()).toBe(false);
        expect(noStaff.seen()).toBe(false);
        noMatch.stop();
        noStaff.stop();
    });

    test("rows per page: 10 / 20 / 50, 20 by default; changing it shows the first page @ADM-243", async () => {
        const {user, clinic} = await openStaffTab(people(45));
        expect(screen.getByText("1–20 of 45")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Go to next page"}));
        await screen.findByText("Person 21");

        const recorded = recordRequests();
        await user.click(screen.getByRole("combobox", {name: /^Rows per page/}));
        const options = within(await screen.findByRole("listbox")).getAllByRole("option");
        expect(options.map(o => o.textContent)).toEqual(["10", "20", "50"]);
        expect(options[1]).toHaveAttribute("aria-selected", "true");
        await user.click(options[2]);

        await screen.findByText("1–45 of 45");
        expect(screen.getByText("Person 01")).toBeInTheDocument();
        const asked = staffRequests(recorded.requests, clinic.id);
        expect(asked.map(p => [p.get("page"), p.get("pageSize")])).toEqual([["1", "50"]]);
    });
});
