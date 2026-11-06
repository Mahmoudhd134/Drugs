import {screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {describe, expect, test} from "vitest";
import {
    aClinicContext, api, aPage, clinicPrintTemplateHandler, contextsHandler, drugCategoriesHandler, drugTreeHandler, expectPath, expectToasts,
    isolate, meByContext, problem, recordRequests, refreshSequence, server, sessionIn, toastTexts,
} from "../../../test";
import {installIntersectionObserver} from "../../../test/intersection.ts";
import {aStoredFile, named, press, startManager, stubDownloads, testFilesHandlers} from "../../../test/pages/attachments.tsx";

// The components on attachmentRequests("/test-files") in the whole app, for what only that shows: design § 12 "Two
// changes outside the feature"; docs/features/auth/tech.md "Frontend" (Lost clinic); docs/features/access/tech.md "403".

const clinicA = aClinicContext({clinicId: 1, clinicName: "A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "B"});
const clinicC = aClinicContext({clinicId: 3, clinicName: "C"});

/** The start page's and the picker's answers, for a user the app moves when the clinic is lost. */
const elsewhereHandlers = (contexts: Parameters<typeof contextsHandler>[0]) => [
    contextsHandler(contexts),
    drugCategoriesHandler(),
    clinicPrintTemplateHandler(),
    drugTreeHandler([]),
    http.get(api("/drugs"), () => HttpResponse.json(aPage([]))),
    http.get(api("/protocols"), () => HttpResponse.json(aPage([]))),
];

/** Answers only this file's download: a route with `:id` would answer `/test-files/rules` too. */
const downloadOf = (id: string, answer: (request: Request) => Response) =>
    http.get(api(`/test-files/${id}`), ({request}) => answer(request));

describe("a download's error on the real client @area:attachments", () => {
    const report = () => aStoredFile({originalFileName: "report.pdf"});

    test("application/problem+json as a blob: the code is read, and its translated message shows @ATT-224", async () => {
        const file = report();
        server.use(refreshSequence(sessionIn(clinicA)).handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, () => problem(400, "attachmentTooLarge")));
        const {user} = await startManager();

        await press(user, named.download("report.pdf"));

        await expectToasts("This file is larger than allowed.");
    });

    test("in Arabic @ATT-224", async () => {
        const file = report();
        server.use(refreshSequence(sessionIn(clinicA)).handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, () => problem(400, "attachmentTooLarge")));
        const {user} = await startManager({lang: "ar"});

        await press(user, `تنزيل «${isolate("report.pdf")}»`);

        await expectToasts("حجم هذا الملف أكبر من المسموح به.");
    });

    test("a body that can't be parsed: the original error, a generic message @ATT-224", async () => {
        const file = report();
        server.use(refreshSequence(sessionIn(clinicA)).handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, () => new HttpResponse("{not json", {status: 400, headers: {"Content-Type": "application/problem+json"}})));
        const {user} = await startManager();

        await press(user, named.download("report.pdf"));

        await expectToasts("Something went wrong. Please try again.");
    });

    test("a 404 as a blob: the list reloads and says the item is gone @ATT-224", async () => {
        const file = report();
        const files = [file];
        server.use(refreshSequence(sessionIn(clinicA)).handler, meByContext(), ...testFilesHandlers(files));
        server.use(downloadOf(file.id, () => problem(404, "notFound")));
        const {user} = await startManager();
        await screen.findByRole("button", {name: named.download("report.pdf")});
        files.splice(0, 1);

        await press(user, named.download("report.pdf"));

        await expectToasts("This item no longer exists.");
        await waitFor(() => expect(screen.queryByRole("button", {name: named.download("report.pdf")})).not.toBeInTheDocument());
    });
});

describe("a download refused with a 403 @area:attachments", () => {
    test("noAccess, one other clinic: the clinic-lost message and that clinic's start page; the download isn't replayed there @ATT-225", async () => {
        const file = aStoredFile({originalFileName: "report.pdf"});
        const tries: Request[] = [];
        installIntersectionObserver();
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB]), sessionIn(clinicB, [clinicB])).handler,
            meByContext(),
            ...elsewhereHandlers([clinicB]),
            ...testFilesHandlers([file]),
        );
        server.use(downloadOf(file.id, request => {
            tries.push(request);
            return problem(403, "noAccess");
        }));
        const {user} = await startManager();

        await press(user, named.download("report.pdf"));

        await expectToasts(`You no longer have access to “${isolate("A")}”. You are now in “${isolate("B")}”.`);
        await expectPath("/");
        expect(tries).toHaveLength(1);
    });

    test("noAccess, several other clinics: the message and the clinic picker @ATT-225", async () => {
        const file = aStoredFile({originalFileName: "report.pdf"});
        installIntersectionObserver();
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB, clinicC]), sessionIn(null, [clinicB, clinicC])).handler,
            meByContext(),
            ...elsewhereHandlers([clinicB, clinicC]),
            ...testFilesHandlers([file]),
        );
        server.use(downloadOf(file.id, () => problem(403, "noAccess")));
        const {user} = await startManager();

        await press(user, named.download("report.pdf"));

        await expectPath("/select-clinic");
        await expectToasts(`You no longer have access to “${isolate("A")}”. Choose where to continue.`);
    });

    test("not clinic-lost: a translated toast shows, /me reloads and the user stays @ATT-257", async () => {
        const file = aStoredFile({originalFileName: "report.pdf"});
        const refresh = refreshSequence(sessionIn(clinicA));
        server.use(refresh.handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, () => problem(403, "forbidden")));
        const recorded = recordRequests();
        const {user, path, session} = await startManager();
        const button = await screen.findByRole("button", {name: named.download("report.pdf")});
        const meLoads = () => recorded.requests.filter(r => r.path === "/me").length;
        await waitFor(() => expect(meLoads()).toBeGreaterThan(0));
        const before = meLoads();

        await user.click(button);

        await expectToasts("You are not allowed to do this.");
        await waitFor(() => expect(meLoads()).toBeGreaterThan(before));
        expect(path()).toBe("/drugs");
        expect(session.getSession().status).toBe("authenticated");
        expect(refresh.calls()).toBe(1);
    });

    test("not clinic-lost in Arabic @ATT-257", async () => {
        const file = aStoredFile({originalFileName: "report.pdf"});
        server.use(refreshSequence(sessionIn(clinicA)).handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, () => problem(403, "forbidden")));
        const {user} = await startManager({lang: "ar"});

        await press(user, `تنزيل «${isolate("report.pdf")}»`);

        await expectToasts("غير مسموح لك بهذا الإجراء.");
    });
});

describe("an expired token on a download @area:attachments", () => {
    test("an empty-body 401 on the blob: refresh and replay return the blob, saved under its name, with no toast @ATT-239", async () => {
        const browser = stubDownloads();
        const file = aStoredFile({originalFileName: "report.pdf"});
        const first = sessionIn(clinicA);
        const fresh = {...first, accessToken: first.accessToken.replace("sig-", "sig2-")};
        const refresh = refreshSequence(first, fresh);
        const tokens: (string | null)[] = [];
        server.use(refresh.handler, meByContext(), ...testFilesHandlers([file]));
        server.use(downloadOf(file.id, request => {
            const token = request.headers.get("Authorization");
            tokens.push(token);
            return token === `Bearer ${fresh.accessToken}`
                ? new HttpResponse("the bytes", {headers: {"Content-Type": "application/pdf"}})
                : new HttpResponse(null, {status: 401});
        }));
        const {user} = await startManager();

        await press(user, named.download("report.pdf"));

        await browser.saved(1);
        expect(browser.saves[0].name).toBe("report.pdf");
        await expect(browser.blobOf(browser.saves[0]).text()).resolves.toBe("the bytes");
        expect(tokens).toEqual([`Bearer ${first.accessToken}`, `Bearer ${fresh.accessToken}`]);
        expect(refresh.calls()).toBe(2);
        expect(toastTexts()).toEqual([]);
    });
});
