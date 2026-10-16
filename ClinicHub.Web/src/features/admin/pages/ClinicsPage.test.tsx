import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aClinicDetails, adminClinicsHandlers, api, holdTimers, problem, recordRequests, server} from "../../../test";
import type {ClinicDetails} from "../types.ts";
import {renderAdmin} from "../../../test/pages/admin.tsx";

// The clinics list: docs/features/platform-admin/business.md "الشاشات" (قائمة العيادات) and "الرسائل التي تظهر
// للمستخدم", tech.md "Frontend" (/admin: ClinicsPage) and useFormatDate (UI language, Latin digits, browser time zone).

const clinics = (count: number, fields: (i: number) => Partial<ClinicDetails> = () => ({})) =>
    Array.from({length: count}, (_, i) => aClinicDetails({name: `Clinic ${i + 1}`, ...fields(i)}));

const rows = () => screen.getAllByRole("row").slice(1);
const listRequests = (requests: { path: string; search: string }[]) =>
    requests.filter(r => r.path === "/admin/clinics").map(r => new URLSearchParams(r.search));

describe("clinics list @area:admin", () => {
    test("each row: the name as a link, the status chip, the active staff and the created date @ADM-031 @smoke", async () => {
        const a = aClinicDetails({name: "Clinic A", status: "active", staffCount: 3, createdAt: "2026-10-01T09:00:00Z"});
        const b = aClinicDetails({name: "Clinic B", status: "suspended", staffCount: 0, createdAt: "2026-10-01T09:00:00Z"});
        server.use(...adminClinicsHandlers([a, b]));
        await renderAdmin("/admin");

        const link = await screen.findByRole("link", {name: "Clinic A"});
        expect(link).toHaveAttribute("href", `/admin/clinics/${a.id}`);
        const [first, second] = rows();
        expect(within(first).getByText("Active")).toBeInTheDocument();
        expect(within(first).getByRole("cell", {name: "3"})).toBeInTheDocument();
        expect(within(first).getByText("Oct 1, 2026")).toBeInTheDocument();
        expect(within(second).getByRole("link", {name: "Clinic B"})).toBeInTheDocument();
        expect(within(second).getByText("Disabled")).toBeInTheDocument();
    });

    test("in Arabic: «نشطة» / «موقوفة», the date with Latin digits @ADM-031", async () => {
        server.use(...adminClinicsHandlers([
            aClinicDetails({name: "عيادة النور", status: "active", createdAt: "2026-10-01T09:00:00Z"}),
            aClinicDetails({name: "Clinic B", status: "suspended", createdAt: "2026-10-01T09:00:00Z"}),
        ]));
        await renderAdmin("/admin", {lang: "ar"});

        await screen.findByRole("link", {name: "عيادة النور"});
        const [first, second] = rows();
        expect(within(first).getByText("نشطة")).toBeInTheDocument();
        expect(within(second).getByText("موقوفة")).toBeInTheDocument();
        const date = within(first).getAllByRole("cell")[3].textContent ?? "";
        expect(date).toContain("2026");
        expect(date).not.toMatch(/[٠-٩]/);
    });

    test("no clinic at all: «لا توجد عيادات بعد» with the first-clinic hint @ADM-032", async () => {
        server.use(...adminClinicsHandlers([]));
        await renderAdmin("/admin", {lang: "ar"});
        expect(await screen.findByText("لا توجد عيادات بعد")).toBeInTheDocument();
        expect(screen.getByText("أنشئ أول عيادة. يستطيع مالكها الدخول فورًا ويجد فيها الأدوية والمجموعات الافتراضية.")).toBeInTheDocument();
    });

    test("no clinic at all, in English: \"No clinics yet\" @ADM-032", async () => {
        server.use(...adminClinicsHandlers([]));
        await renderAdmin("/admin");
        expect(await screen.findByText("No clinics yet")).toBeInTheDocument();
        expect(screen.getByText("Create the first clinic. Its owner can log in right away and finds the default drugs and groups.")).toBeInTheDocument();
    });

    test("a search with no match: «لا توجد عيادات مطابقة للبحث أو الفلتر.» @ADM-033", async () => {
        server.use(...adminClinicsHandlers(clinics(3)));
        await renderAdmin("/admin?search=zzz", {lang: "ar"});
        expect(await screen.findByText("لا توجد عيادات مطابقة للبحث أو الفلتر.")).toBeInTheDocument();
    });

    test("a filter with no match, in English: \"No clinics match your search or filter.\" @ADM-033", async () => {
        server.use(...adminClinicsHandlers(clinics(3)));
        await renderAdmin("/admin?status=suspended");
        expect(await screen.findByText("No clinics match your search or filter.")).toBeInTheDocument();
    });

    test.each([
        ["en", 0, "0 clinics"], ["en", 1, "1 clinic"], ["en", 28, "28 clinics"],
        ["ar", 0, "0 عيادة"], ["ar", 1, "عيادة واحدة"], ["ar", 2, "عيادتان"], ["ar", 3, "3 عيادات"], ["ar", 11, "11 عيادة"],
    ] as const)("the subtitle counts the filtered list (%s, %i): %s @ADM-034", async (lang, count, subtitle) => {
        // The others are filtered out by the search: the count is of the filtered list
        server.use(...adminClinicsHandlers([...clinics(count, () => ({name: "Match"})), ...clinics(4, () => ({name: "Other"}))]));
        await renderAdmin("/admin?search=match", {lang});
        expect(await screen.findByText(subtitle)).toBeInTheDocument();
    });

    test("typing \"clin\" fast: one request once typing pauses, the progress bar meanwhile @ADM-035", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        const all = clinics(3);
        server.use(
            http.get(api("/admin/clinics"), async ({request}) => {
                const search = new URL(request.url).searchParams.get("search");
                if (search) await answered;
                return HttpResponse.json({items: all, totalCount: all.length, page: 1, pageSize: 20});
            }),
        );
        const {user} = await renderAdmin("/admin");
        await screen.findByRole("link", {name: "Clinic 1"});
        await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
        const recorded = recordRequests();

        // Typed fast: no pause between the keys (the 300 ms wait is held while typing)
        const timers = holdTimers();
        await user.type(screen.getByRole("searchbox", {name: "Search clinics by name…"}), "clin");
        // Waiting for the pause: the rows shown are not the search's results yet
        expect(screen.getByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        expect(listRequests(recorded.requests)).toEqual([]);
        await timers.advance(299);
        expect(listRequests(recorded.requests)).toEqual([]);
        await timers.advance(1);
        await timers.release();
        await waitFor(() => expect(listRequests(recorded.requests)).toHaveLength(1));
        expect(listRequests(recorded.requests)[0].get("search")).toBe("clin");
        // Loading
        expect(screen.getByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        answer();
        await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
        expect(listRequests(recorded.requests).map(p => p.get("search"))).toEqual(["clin"]);
    });

    test("?search=clinic+2, then the sidebar's \"Clinics\": the search is cleared and the full list shows @ADM-040", async () => {
        server.use(...adminClinicsHandlers(clinics(3, i => ({name: i === 1 ? "clinic 2" : `Other ${i}`}))));
        const {user, location} = await renderAdmin("/admin?search=clinic+2", {layout: true});
        await screen.findByRole("link", {name: "clinic 2"});
        expect(rows()).toHaveLength(1);
        expect(screen.getByRole("searchbox", {name: "Search clinics by name…"})).toHaveValue("clinic 2");

        await user.click(within(screen.getByRole("navigation")).getByRole("link", {name: "Clinics"}));
        await waitFor(() => expect(rows()).toHaveLength(3));
        expect(screen.getByRole("searchbox", {name: "Search clinics by name…"})).toHaveValue("");
        expect(location().pathname).toBe("/admin");
        expect(location().search).toBe("");
    });

    test("?page=99999999999: the request asks page 1,000,000 and the last page is shown @ADM-041", async () => {
        server.use(...adminClinicsHandlers(clinics(25)));
        const recorded = recordRequests();
        const {location} = await renderAdmin("/admin?page=99999999999");

        await screen.findByRole("link", {name: "Clinic 21"});
        const pages = listRequests(recorded.requests).map(p => Number(p.get("page")));
        expect(pages[0]).toBe(1_000_000);
        expect(pages.every(page => page <= 1_000_000)).toBe(true);
        expect(rows()).toHaveLength(5);
        expect(screen.getByText("21–25 of 25")).toBeInTheDocument();
        expect(new URLSearchParams(location().search).get("page")).toBe("2");
    });

    test("a long Arabic + Latin name: cut after 2 lines, the full name in its title @ADM-043", async () => {
        const name = `${"عيادة Clinic ".repeat(12)}النور`.slice(0, 157);
        expect(name).toHaveLength(157);
        server.use(...adminClinicsHandlers([aClinicDetails({name})]));
        await renderAdmin("/admin", {lang: "ar"});

        const link = await screen.findByRole("link", {name});
        expect(link).toHaveAttribute("title", name);
        expect(link).toHaveStyle({display: "-webkit-box", overflow: "hidden"});
        expect(getComputedStyle(link).getPropertyValue("-webkit-line-clamp")).toBe("2");
    });

    test("the list request fails: «تعذّر تحميل البيانات.» with «إعادة المحاولة», which loads it @ADM-044", async () => {
        let calls = 0;
        server.use(http.get(api("/admin/clinics"), () => (++calls === 1
            ? problem(500, "unexpected")
            : HttpResponse.json({items: [aClinicDetails({name: "Clinic A"})], totalCount: 1, page: 1, pageSize: 20}))));
        const {user} = await renderAdmin("/admin", {lang: "ar"});

        expect(await screen.findByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "إعادة المحاولة"}));
        expect(await screen.findByRole("link", {name: "Clinic A"})).toBeInTheDocument();
        expect(screen.queryByText("تعذّر تحميل البيانات.")).not.toBeInTheDocument();
    });

    test("the list request fails, in English: \"Couldn't load data.\" with \"Retry\" @ADM-044", async () => {
        server.use(http.get(api("/admin/clinics"), () => problem(500, "unexpected")));
        await renderAdmin("/admin");
        expect(await screen.findByText("Couldn't load data.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
    });
});

describe("clinic dates in the browser's time zone @area:admin", () => {
    const inTimeZone = async (zone: string, run: () => Promise<void>) => {
        const previous = process.env.TZ;
        process.env.TZ = zone;
        try {
            await run();
        } finally {
            if (previous === undefined) delete process.env.TZ;
            else process.env.TZ = previous;
        }
    };

    test("created at 23:30 UTC: the list and the Overview show the next day in Cairo @ADM-093", async () => {
        const clinic = aClinicDetails({name: "Late clinic", createdAt: "2026-10-01T23:30:00Z"});
        server.use(...adminClinicsHandlers([clinic]));
        await inTimeZone("Africa/Cairo", async () => {
            const {user} = await renderAdmin("/admin");
            await screen.findByRole("link", {name: "Late clinic"});
            expect(within(rows()[0]).getByText("Oct 2, 2026")).toBeInTheDocument();

            await user.click(screen.getByRole("link", {name: "Late clinic"}));
            expect(await screen.findByText("October 2, 2026")).toBeInTheDocument();
        });
    });

    test("the same clinic in a UTC browser: the same day @ADM-093", async () => {
        server.use(...adminClinicsHandlers([aClinicDetails({name: "Late clinic", createdAt: "2026-10-01T23:30:00Z"})]));
        await inTimeZone("UTC", async () => {
            await renderAdmin("/admin");
            await screen.findByRole("link", {name: "Late clinic"});
            expect(within(rows()[0]).getByText("Oct 1, 2026")).toBeInTheDocument();
        });
    });
});
