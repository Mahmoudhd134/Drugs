import {describe, expect, onTestFinished, test, vi} from "vitest";
import {QueryObserver} from "@tanstack/react-query";
import {http, HttpResponse} from "msw";
import {api as apiUrl, createTestQueryClient, networkError, problem, server} from "../test";
import {api} from "./client.ts";
import {loadInScope, refreshScope, showsStaleData, type DataScope} from "./dataScope.ts";

// Rules: docs/features/platform-admin/tech.md "Roles and staff screens" (api/dataScope.ts).

const failWith = async (response: () => Response) => {
    server.use(http.get(apiUrl("/scope-test"), response));
    return api.get("/scope-test").then(() => {
        throw new Error("The request did not fail");
    }, (error: unknown) => error);
};

describe("dataScope @area:admin", () => {
    test("showsStaleData: 404, 409 or one of the given codes", async () => {
        expect(showsStaleData(await failWith(() => problem(404, "notFound")))).toBe(true);
        expect(showsStaleData(await failWith(() => problem(409, "roleInUse")))).toBe(true);
        expect(showsStaleData(await failWith(() => problem(400, "roleNotFound")), ["roleNotFound"])).toBe(true);
        expect(showsStaleData(await failWith(() => problem(400, "roleNotFound")))).toBe(false);
        expect(showsStaleData(await failWith(() => problem(403, "forbidden")))).toBe(false);
        expect(showsStaleData(await failWith(networkError))).toBe(false);
        expect(showsStaleData(await failWith(() => HttpResponse.json({}, {status: 500})))).toBe(false);
    });

    test("refreshScope: the scope and what it affects load again once, also queries not shown", async () => {
        const queryClient = createTestQueryClient();
        const calls: string[] = [];
        const add = (key: readonly unknown[]) =>
            queryClient.fetchQuery({queryKey: key, queryFn: async () => calls.push(JSON.stringify(key))});
        await Promise.all([
            add(["clinics", 1, "roles"]),
            add(["clinics", 1, "staff", "a"]),
            add(["clinics", 1]),
            add(["clinics", 2, "roles"]),
        ]);
        // Mounted nowhere (no observer): they must still load again
        queryClient.getQueryCache().getAll().forEach(q => queryClient.getQueryCache().find({queryKey: q.queryKey})?.setOptions({
            queryKey: q.queryKey,
            queryFn: async () => calls.push(`again ${JSON.stringify(q.queryKey)}`),
        }));
        calls.length = 0;
        const scope: DataScope = {scope: ["clinics", 1, "roles"], affects: [["clinics", 1, "staff"], ["clinics", 1]]};
        refreshScope(queryClient, scope);
        await vi.waitFor(() => expect(calls).toHaveLength(3));
        expect(calls.sort()).toEqual([
            'again ["clinics",1,"roles"]', 'again ["clinics",1,"staff","a"]', 'again ["clinics",1]',
        ].sort());
        expect(queryClient.getQueryState(["clinics", 2, "roles"])?.isInvalidated).toBe(false);
    });

    test("refreshScope without affected data: the scope only", async () => {
        const queryClient = createTestQueryClient();
        await queryClient.fetchQuery({queryKey: ["clinics", 1, "roles"], queryFn: async () => 1});
        await queryClient.fetchQuery({queryKey: ["clinics", 1], queryFn: async () => 1});
        refreshScope(queryClient, {scope: ["clinics", 1, "roles"]});
        expect(queryClient.getQueryState(["clinics", 1])?.isInvalidated).toBe(false);
        await vi.waitFor(() => expect(queryClient.getQueryState(["clinics", 1, "roles"])?.dataUpdateCount).toBe(2));
    });

    /** A clinic page showing its details (the container) and its roles (the scope), plus another page's data. */
    const clinicPage = async () => {
        const queryClient = createTestQueryClient();
        const container = ["clinics", 7];
        const loads = {container: 0};
        let containerLoad: () => Promise<number> = async () => ++loads.container;
        const shown = new QueryObserver(queryClient, {queryKey: container, queryFn: () => containerLoad()});
        const unsubscribe = shown.subscribe(() => undefined);
        await vi.waitFor(() => expect(loads.container).toBe(1));
        await queryClient.fetchQuery({queryKey: [...container, "roles"], queryFn: async () => []});
        await queryClient.fetchQuery({queryKey: ["clinics", 8], queryFn: async () => 8});
        onTestFinished(unsubscribe);
        const invalidated = () => queryClient.getQueryCache().getAll().filter(q => q.state.isInvalidated).map(q => q.queryKey);
        return {
            queryClient, container, loads, shown, invalidated,
            scope: {scope: [...container, "roles"], container} as DataScope,
            setContainerLoad: (load: () => Promise<number>) => (containerLoad = load),
        };
    };

    test("loadInScope: a 404 loads the container again, that key only", async () => {
        const page = await clinicPage();
        const notFound = await failWith(() => problem(404, "notFound"));
        await expect(loadInScope(page.queryClient, page.scope, async () => Promise.reject(notFound))).rejects.toBe(notFound);
        await vi.waitFor(() => expect(page.loads.container).toBe(2));
        // Nothing else is marked for loading (the container, shown, has loaded again already)
        expect(page.invalidated()).toEqual([]);
        await expect(loadInScope(page.queryClient, page.scope, async () => "rows")).resolves.toBe("rows");
    });

    test("loadInScope: another error, or no container, loads nothing again", async () => {
        const page = await clinicPage();
        const forbidden = await failWith(() => problem(403, "forbidden"));
        await expect(loadInScope(page.queryClient, page.scope, async () => Promise.reject(forbidden))).rejects.toBe(forbidden);
        const offline = await failWith(networkError);
        await expect(loadInScope(page.queryClient, page.scope, async () => Promise.reject(offline))).rejects.toBe(offline);
        const notFound = await failWith(() => problem(404, "notFound"));
        await expect(loadInScope(page.queryClient, {scope: ["x"]}, async () => Promise.reject(notFound))).rejects.toBe(notFound);
        // A container never loaded yet: nothing to load again, no error
        await expect(loadInScope(page.queryClient, {scope: ["y"], container: ["clinics", 9]}, async () => Promise.reject(notFound)))
            .rejects.toBe(notFound);
        expect(page.invalidated()).toEqual([]);
        expect(page.queryClient.getQueryState(page.container)?.fetchStatus).toBe("idle");
        expect(page.loads.container).toBe(1);
    });

    test("loadInScope: a container loading already is not asked again (one request)", async () => {
        const page = await clinicPage();
        let finish!: () => void;
        page.setContainerLoad(() => new Promise(resolve => {
            page.loads.container++;
            finish = () => resolve(page.loads.container);
        }));
        void page.shown.refetch();
        await vi.waitFor(() => expect(page.loads.container).toBe(2));
        const notFound = await failWith(() => problem(404, "notFound"));
        await expect(loadInScope(page.queryClient, page.scope, async () => Promise.reject(notFound))).rejects.toBe(notFound);
        finish();
        await vi.waitFor(() => expect(page.queryClient.getQueryState(page.container)?.fetchStatus).toBe("idle"));
        expect(page.loads.container).toBe(2);
    });

    test("loadInScope: a container that answered 404 itself (the clinic is gone) is not loaded again", async () => {
        const page = await clinicPage();
        const notFound = await failWith(() => problem(404, "notFound"));
        page.setContainerLoad(async () => {
            page.loads.container++;
            throw notFound;
        });
        await page.shown.refetch();
        const loadsBefore = page.loads.container;
        await expect(loadInScope(page.queryClient, page.scope, async () => Promise.reject(notFound))).rejects.toBe(notFound);
        expect(page.queryClient.getQueryState(page.container)?.fetchStatus).toBe("idle");
        expect(page.loads.container).toBe(loadsBefore);
    });
});
