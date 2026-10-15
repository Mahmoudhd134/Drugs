import {beforeEach, describe, expect, test, vi} from "vitest";
import {delay, http, HttpResponse} from "msw";
import {aClinicContext, anAuthResult, api, problem, recordRequests, server} from "../../test";

// The session store: docs/features/auth/tech.md "Frontend" (features/auth/session.ts).

/** A fresh copy of the session store (it is module state, as on a page load). */
const loadSession = async () => {
    vi.resetModules();
    return import("./session.ts");
};

beforeEach(() => vi.resetModules());

describe("session store @area:auth", () => {
    test("a logout while a refresh is in flight waits for it, and the user stays logged out @AUTH-158", async () => {
        const session = await loadSession();
        session.setSession(anAuthResult());
        const order: string[] = [];
        let finishRefresh!: () => void;
        const refreshAnswered = new Promise<void>(resolve => (finishRefresh = resolve));
        server.use(
            http.post(api("/auth/refresh"), async () => {
                order.push("refresh started");
                await refreshAnswered;
                order.push("refresh answered");
                return HttpResponse.json(anAuthResult());
            }),
            http.post(api("/auth/logout"), () => {
                order.push("logout");
                return new HttpResponse(null, {status: 204});
            }),
        );

        const refreshing = session.refreshSession();
        await vi.waitFor(() => expect(order).toEqual(["refresh started"]));
        const loggingOut = session.endSession();

        finishRefresh();
        await refreshing;
        await loggingOut;
        expect(order).toEqual(["refresh started", "refresh answered", "logout"]);
        expect(session.getSession()).toEqual({status: "anonymous"});
    });

    test("a refresh answering 409 is retried once @AUTH-165", async () => {
        const session = await loadSession();
        const auth = anAuthResult();
        let calls = 0;
        server.use(http.post(api("/auth/refresh"), () => (++calls === 1 ? problem(409, "conflict") : HttpResponse.json(auth))));
        await expect(session.refreshSession()).resolves.toBe(auth.accessToken);
        expect(calls).toBe(2);
        expect(session.getSession()).toEqual({status: "authenticated", auth});
    });

    test("a second 409 is not retried again: the session is kept", async () => {
        const session = await loadSession();
        const auth = anAuthResult();
        session.setSession(auth);
        let calls = 0;
        server.use(http.post(api("/auth/refresh"), () => {
            calls++;
            return problem(409, "conflict");
        }));
        await expect(session.refreshSession()).resolves.toBeNull();
        expect(calls).toBe(2);
        expect(session.getSession()).toEqual({status: "authenticated", auth});
    });

    test("an auth call that stalls times out after 15 s, and later auth calls still run @AUTH-166", async () => {
        const session = await loadSession();
        // jsdom's XMLHttpRequest under MSW never times out by itself: the fetch transport times out with timers
        const {api: client} = await import("../../api/client.ts");
        client.defaults.adapter = "fetch";
        client.defaults.baseURL = `${window.location.origin}/api/v1`;
        const auth = anAuthResult();
        session.setSession(auth);
        let stall = true;
        server.use(http.post(api("/auth/refresh"), async () => {
            if (stall) await delay("infinite");
            return HttpResponse.json(auth);
        }));
        vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
        const stalled = session.refreshSession();
        await vi.advanceTimersByTimeAsync(14_900);
        let settled = false;
        void stalled.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(200);
        // Timed out: an unreachable API keeps the session
        await expect(stalled).resolves.toBeNull();
        expect(session.getSession()).toEqual({status: "authenticated", auth});
        vi.useRealTimers();

        stall = false;
        server.use(http.post(api("/auth/logout"), () => new HttpResponse(null, {status: 204})));
        await expect(session.refreshSession()).resolves.toBe(auth.accessToken);
        await session.endSession();
        expect(session.getSession()).toEqual({status: "anonymous"});
    });

    test("a switch answered 401 whose refresh brings another user: rejected, told once, not sent again @AUTH-203", async () => {
        const session = await loadSession();
        session.setSession(anAuthResult({userId: 1, context: aClinicContext({clinicId: 1})}));
        const otherUser = anAuthResult({userId: 2, context: aClinicContext({clinicId: 9, clinicName: "Clinic B"})});
        server.use(
            http.post(api("/auth/context"), () => problem(401, "unauthorized")),
            http.post(api("/auth/refresh"), () => HttpResponse.json(otherUser)),
        );
        const onOtherUser = vi.fn();
        session.onOtherUserSignedIn(onOtherUser);
        const recorder = recordRequests();

        await expect(session.switchSessionContext("clinic", 2)).rejects.toBeInstanceOf(session.OtherUserSignedInError);
        await vi.waitFor(() => expect(onOtherUser).toHaveBeenCalledTimes(1));
        expect(onOtherUser).toHaveBeenCalledWith(otherUser);
        expect(recorder.requests.map(r => r.path)).toEqual(["/auth/context", "/auth/refresh"]);
        expect(session.getSession()).toEqual({status: "authenticated", auth: otherUser});
    });

    test("a switch answered 401 whose refresh keeps the same user is sent again once", async () => {
        const session = await loadSession();
        session.setSession(anAuthResult({userId: 1}));
        const switched = anAuthResult({userId: 1, context: aClinicContext({clinicId: 2, clinicName: "Clinic B"})});
        let switches = 0;
        server.use(
            http.post(api("/auth/context"), () => (++switches === 1 ? problem(401, "unauthorized") : HttpResponse.json(switched))),
            http.post(api("/auth/refresh"), () => HttpResponse.json(anAuthResult({userId: 1}))),
        );
        await expect(session.switchSessionContext("clinic", 2)).resolves.toEqual(switched);
        expect(switches).toBe(2);
        expect(session.currentContextKey()).toBe("clinic:2");
    });
});
