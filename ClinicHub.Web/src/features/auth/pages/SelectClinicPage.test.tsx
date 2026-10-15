import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {delay, http, HttpResponse} from "msw";
import {aClinicContext, api, contextsHandler, PLATFORM_CONTEXT, problem, recordRequests, renderWithProviders, server} from "../../../test";
import type {Context} from "../types.ts";
import {SelectClinicPage} from "./SelectClinicPage.tsx";
import {patientWaits} from "../../../test/fe-access/patience.ts";

// The clinic picker: docs/features/auth/tech.md "Frontend" (SelectClinicPage), business.md «المستخدمون» and
// «الرسائل التي تظهر للمستخدم».

patientWaits();

const clinicA = aClinicContext({clinicId: 1, clinicName: "Clinic A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "Clinic B"});
const template = aClinicContext({clinicId: 9, clinicName: "Template", isTemplate: true, roles: []});

/** The picker of a user in `current` (null: none chosen yet), whose session lists `sessionContexts`. */
const openPicker = async (current: Context | null, sessionContexts: Context[], lang: "ar" | "en" = "ar") =>
    renderWithProviders(<SelectClinicPage/>, {lang, route: "/select-clinic", user: {context: current, contexts: sessionContexts}});

/** The names of the listed contexts, in order. */
const listed = () => within(screen.getByRole("list")).getAllByRole("button").map(item => item.textContent);

describe("clinic picker @area:auth", () => {
    test("platform admin first, then the clinics and the template in the API's order; the current one marked «الحالي» @AUTH-118 @smoke", async () => {
        server.use(contextsHandler([clinicB, template, PLATFORM_CONTEXT, clinicA]));
        await openPicker(clinicA, [clinicA, clinicB, template, PLATFORM_CONTEXT]);
        await screen.findByText("Clinic B");
        expect(listed().map(text => text?.replace(/(العيادات وإعدادات المنصة كلها|الأدوية والمجموعات الافتراضية للعيادات الجديدة|الحالي)/g, "|$1")))
            .toEqual([
                "إدارة المنصة|العيادات وإعدادات المنصة كلها",
                "Clinic B",
                "العيادة النموذجية|الأدوية والمجموعات الافتراضية للعيادات الجديدة",
                "Clinic A|الحالي",
            ]);
        const current = screen.getByRole("button", {name: /Clinic A/});
        expect(within(current).getByText("الحالي")).toBeInTheDocument();
        expect(current).toHaveClass("Mui-selected");
    });

    test("the template and the platform labels and hints (ar, en) @AUTH-119", async () => {
        server.use(contextsHandler([PLATFORM_CONTEXT, template]));
        await openPicker(null, [PLATFORM_CONTEXT, template]);
        expect(await screen.findByText("العيادة النموذجية")).toBeInTheDocument();
        expect(screen.getByText("الأدوية والمجموعات الافتراضية للعيادات الجديدة")).toBeInTheDocument();
        expect(screen.getByText("إدارة المنصة")).toBeInTheDocument();
        expect(screen.getByText("العيادات وإعدادات المنصة كلها")).toBeInTheDocument();
        // The template's stored (English) name is never shown
        expect(screen.queryByText("Template")).not.toBeInTheDocument();
    });

    test("the template and the platform labels in English @AUTH-119", async () => {
        server.use(contextsHandler([PLATFORM_CONTEXT, template]));
        await openPicker(null, [PLATFORM_CONTEXT, template], "en");
        expect(await screen.findByText("Template clinic")).toBeInTheDocument();
        expect(screen.getByText("Default drugs and groups for new clinics")).toBeInTheDocument();
        expect(screen.getByText("Platform admin")).toBeInTheDocument();
        expect(screen.getByText("Clinics and settings of the whole platform")).toBeInTheDocument();
    });

    test("title «اختر العيادة» and subtitle «اختر المكان الذي تريد العمل فيه الآن.» @AUTH-120", async () => {
        server.use(contextsHandler([clinicA, clinicB]));
        await openPicker(null, [clinicA, clinicB]);
        expect(screen.getByRole("heading", {name: "اختر العيادة"})).toBeInTheDocument();
        expect(screen.getByText("اختر المكان الذي تريد العمل فيه الآن.")).toBeInTheDocument();
    });

    test("picking the current context opens its home without calling /auth/context @AUTH-124", async () => {
        server.use(contextsHandler([clinicA, clinicB]));
        const {user, auth, location} = await openPicker(clinicA, [clinicA, clinicB]);
        const requests = recordRequests();
        await user.click(await screen.findByRole("button", {name: /Clinic A/}));
        await waitFor(() => expect(location().pathname).toBe("/"));
        expect(auth.switchContext).not.toHaveBeenCalled();
        expect(requests.requests.filter(r => r.path === "/auth/context")).toEqual([]);
    });

    test("with a context set: «رجوع» and «تسجيل الخروج»; without one: only «تسجيل الخروج» @AUTH-125", async () => {
        server.use(contextsHandler([clinicA, clinicB]));
        const {user, location, unmount} = await openPicker(clinicA, [clinicA, clinicB]);
        expect(screen.getByRole("button", {name: "تسجيل الخروج"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "رجوع"}));
        expect(location().pathname).toBe("/");
        unmount();

        await openPicker(null, [clinicA, clinicB]);
        expect(screen.getByRole("button", {name: "تسجيل الخروج"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "رجوع"})).not.toBeInTheDocument();
    });

    test("no context available: «لا توجد عيادة متاحة لرقمك.» (ar, en) @AUTH-126", async () => {
        server.use(contextsHandler([]));
        const {unmount} = await openPicker(null, []);
        expect(await screen.findByText("لا توجد عيادة متاحة لرقمك.")).toBeInTheDocument();
        unmount();
        await openPicker(null, [], "en");
        expect(await screen.findByText("No clinic is available for your number.")).toBeInTheDocument();
    });

    test("on opening: a spinner, then GET /auth/contexts lists the current state (a clinic lost and one given since the refresh) @AUTH-127", async () => {
        let answer!: () => void;
        const answered = new Promise<void>(resolve => (answer = resolve));
        server.use(http.get(api("/auth/contexts"), async () => {
            await answered;
            return HttpResponse.json([clinicA, clinicB]);
        }));
        // The session still lists the template (lost since) and not B (given since)
        await openPicker(null, [clinicA, template]);
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
        answer();
        expect(await screen.findByText("Clinic B")).toBeInTheDocument();
        expect(listed()).toEqual(["Clinic A", "Clinic B"]);
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    test("GET /auth/contexts fails: the session's contexts are listed @AUTH-128", async () => {
        server.use(http.get(api("/auth/contexts"), async () => {
            await delay(10);
            return problem(500, "unexpected");
        }));
        await openPicker(null, [clinicA, clinicB]);
        expect(await screen.findByText("Clinic B")).toBeInTheDocument();
        expect(listed()).toEqual(["Clinic A", "Clinic B"]);
    });
});
