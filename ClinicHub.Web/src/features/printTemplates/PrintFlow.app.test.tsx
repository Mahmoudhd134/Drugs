import {beforeEach, describe, expect, test} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicContext,
    anAccessToken,
    api,
    contextOfRequest,
    drugCategoriesHandler,
    drugsHandlers,
    drugTreeHandler,
    expectPath,
    expectToasts,
    meByContext,
    pastExitTransition,
    problem,
    protocolsHandlers,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
    toastTexts,
} from "../../test";
import {installIntersectionObserver} from "../../test/intersection.ts";
import {installPrint} from "../../test/print.ts";
import {LINES_KEY} from "../../test/pages/prescription.tsx";
import {aPrintedLine, findPopup, manual, fn, PRINT, queryPopup, settled, TEMPLATE_PATH, templateOf} from "../../test/pages/printFlow.tsx";
import type {PrintTemplate} from "./types.ts";

// The print flow in the whole app (startApp): the session, the API client's refresh and replay, the query cache's 403 handling,
// a clinic switch and a logout from another tab: contract § 3.2, design § 4.2; docs/features/auth/tech.md "Frontend".

const clinicA = aClinicContext({clinicId: 1, clinicName: "A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "B"});

const FORBIDDEN_MESSAGE = "غير مسموح لك بهذا الإجراء.";
const SUSPENDED_MESSAGE = "هذه العيادة موقوفة.";

const LINES = [aPrintedLine()];

/** The page's other reads, for every test. */
const pageHandlers = () => [
    ...protocolsHandlers([]),
    drugTreeHandler([]),
    ...drugsHandlers([]),
];

/** The prescription page of clinic A, its lines stored, Print shown. */
const openInA = async (read: Parameters<typeof http.get>[1], refresh = refreshSequence(sessionIn(clinicA, [clinicA, clinicB])), route = "/") => {
    localStorage.setItem(LINES_KEY, JSON.stringify(LINES));
    server.use(refresh.handler, meByContext(), ...pageHandlers(), http.get(api(TEMPLATE_PATH), read));
    installIntersectionObserver();
    const printing = installPrint();
    const app = await startApp({route, lang: "ar"});
    const printButton = await screen.findByRole("button", {name: PRINT});
    return {...app, ...printing, printButton, refresh};
};

/** Answers `template` while the page opens; the read at the click waits until `release()`, then answers it too. */
const heldAtTheClick = (template: PrintTemplate) => {
    let calls = 0;
    let release = () => undefined as void;
    const held = new Promise<void>(resolve => {
        release = resolve;
    });
    return {
        read: async () => {
            if (++calls > 1) await held;
            return HttpResponse.json(template);
        },
        release: () => release(),
        clicked: () => calls > 1,
    };
};

beforeEach(() => void server.use(drugCategoriesHandler()));

describe("the page going away during a print @area:prescription", () => {
    test("a read in flight when another tab switches the clinic: nothing prints, and the other clinic shows no pop-up @TPL-341 @smoke", async () => {
        const template = templateOf(manual("m1", "الاسم"));
        const flight = heldAtTheClick(template);
        const app = await openInA(({request}) => (contextOfRequest(request) === "clinic2" ? new HttpResponse(null, {status: 204}) : flight.read()));

        await app.user.click(app.printButton);
        await waitFor(() => expect(flight.clicked()).toBe(true));
        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));
        await waitFor(() => expect(screen.getByTitle("B")).toBeInTheDocument());

        flight.release();
        await settled();

        expect(queryPopup()).not.toBeInTheDocument();
        expect(app.print).not.toHaveBeenCalled();
        expect(app.printRoot()).toBeNull();
        expect(toastTexts()).toEqual([]);
    });

    test("a read in flight with no manual input, the clinic switched: `window.print` never runs @TPL-341", async () => {
        const template = templateOf(fn("f1", "dayOfMonth"));
        const flight = heldAtTheClick(template);
        const app = await openInA(({request}) => (contextOfRequest(request) === "clinic2" ? new HttpResponse(null, {status: 204}) : flight.read()));

        await app.user.click(app.printButton);
        await waitFor(() => expect(flight.clicked()).toBe(true));
        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));
        await waitFor(() => expect(screen.getByTitle("B")).toBeInTheDocument());

        flight.release();
        await settled();

        expect(app.print).not.toHaveBeenCalled();
        expect(app.printRoot()).toBeNull();
    });

    test("the pop-up open when the clinic is switched: it's gone, the other clinic never shows it, and nothing prints @TPL-341", async () => {
        const app = await openInA(({request}) => (contextOfRequest(request) === "clinic2"
            ? new HttpResponse(null, {status: 204})
            : HttpResponse.json(templateOf(manual("m1", "الاسم")))));
        await app.user.click(app.printButton);
        await findPopup();

        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));

        await waitFor(() => expect(screen.getByTitle("B")).toBeInTheDocument());
        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());
        await settled();
        expect(queryPopup()).not.toBeInTheDocument();
        expect(app.print).not.toHaveBeenCalled();
    });

    test("the other clinic has no template: its page has no Print, never A's @TPL-341", async () => {
        const app = await openInA(({request}) => (contextOfRequest(request) === "clinic2"
            ? new HttpResponse(null, {status: 204})
            : HttpResponse.json(templateOf())));

        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));

        await waitFor(() => expect(screen.getByTitle("B")).toBeInTheDocument());
        await waitFor(() => expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument());
    });

    test("a read in flight when another tab logs out: the login page, nothing prints @TPL-341", async () => {
        server.use(http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})));
        const flight = heldAtTheClick(templateOf(manual("m1", "الاسم")));
        const app = await openInA(() => flight.read());

        await app.user.click(app.printButton);
        await waitFor(() => expect(flight.clicked()).toBe(true));
        act(() => app.session.setSession(null));
        await expectPath("/login");

        flight.release();
        await settled();

        expect(queryPopup()).not.toBeInTheDocument();
        expect(app.print).not.toHaveBeenCalled();
    });
});

describe("an expired token at Print @area:prescription", () => {
    /** The session at load, the fresh one the refresh gives, and the read refusing the old token at the click. */
    const expiring = () => {
        const stale = sessionIn(clinicA);
        const fresh = {...stale, accessToken: anAccessToken(1).replace("signature", "fresh")};
        return {stale, fresh};
    };

    test("the refresh and replay run and the flow continues once @TPL-342 @smoke", async () => {
        const {stale, fresh} = expiring();
        const refresh = refreshSequence(stale, fresh);
        let reads = 0;
        const template = templateOf(fn("f1", "dayOfMonth"));
        const app = await openInA(({request}) => {
            reads++;
            // The read when the page opens passes; the one at the click finds the token expired
            return reads === 1 || request.headers.get("Authorization") === `Bearer ${fresh.accessToken}`
                ? HttpResponse.json(template)
                : problem(401, "unauthorized");
        }, refresh);

        await app.user.click(app.printButton);

        await waitFor(() => expect(app.print).toHaveBeenCalledTimes(1));
        await settled();
        expect(app.print).toHaveBeenCalledTimes(1);
        expect(refresh.calls()).toBe(2);
        expect(reads).toBe(3);
        expect(toastTexts()).toEqual([]);
    });

    test("the refresh failing: the login page, nothing prints, and the lines are still there for after logging in @TPL-342", async () => {
        server.use(http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})));
        const refresh = refreshSequence(sessionIn(clinicA), problem(401, "unauthorized"));
        let reads = 0;
        const app = await openInA(() => (++reads === 1 ? HttpResponse.json(templateOf()) : problem(401, "unauthorized")), refresh);

        await app.user.click(app.printButton);

        await expectPath("/login");
        await settled();
        expect(app.print).not.toHaveBeenCalled();
        expect(app.printRoot()).toBeNull();
        expect(JSON.parse(localStorage.getItem(LINES_KEY) ?? "[]")).toEqual(LINES);
    });
});

describe("403 at Print @area:prescription", () => {
    const forbiddenAtTheClick = (code: string) => {
        let reads = 0;
        return () => (++reads === 1 ? HttpResponse.json(templateOf()) : problem(403, code));
    };

    test("`forbidden`: one message only, nothing prints, /me reloads @TPL-343 @smoke", async () => {
        const requests = recordRequests();
        const app = await openInA(forbiddenAtTheClick("forbidden"));
        const meBefore = requests.requests.filter(r => r.path === "/me").length;

        await app.user.click(app.printButton);

        await expectToasts(FORBIDDEN_MESSAGE);
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/me").length).toBeGreaterThan(meBefore));
        await pastExitTransition();
        expect(toastTexts()).toEqual([FORBIDDEN_MESSAGE]);
        expect(app.print).not.toHaveBeenCalled();
        expect(app.printRoot()).toBeNull();
    });

    test("`clinicSuspended` after the replay: one message only, nothing prints, /me reloads @TPL-343", async () => {
        const requests = recordRequests();
        // The refresh stays in the clinic, so the read is replayed and answers the same
        const refresh = refreshSequence(sessionIn(clinicA, [clinicA, clinicB]));
        const app = await openInA(forbiddenAtTheClick("clinicSuspended"), refresh);
        const meBefore = requests.requests.filter(r => r.path === "/me").length;

        await app.user.click(app.printButton);

        await expectToasts(SUSPENDED_MESSAGE);
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/me").length).toBeGreaterThan(meBefore));
        await pastExitTransition();
        expect(toastTexts()).toEqual([SUSPENDED_MESSAGE]);
        expect(app.print).not.toHaveBeenCalled();
    });

    test("after a 403 Print isn't stuck, and it stays on the page while the permissions allow it @TPL-343", async () => {
        const app = await openInA(forbiddenAtTheClick("forbidden"));

        await app.user.click(app.printButton);
        await expectToasts(FORBIDDEN_MESSAGE);

        expect(screen.getByRole("button", {name: PRINT})).toBeEnabled();
    });
});
