import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {
    aClinicContext,
    aDrug,
    aProtocol,
    anItem,
    drugsHandlers,
    meByContext,
    protocolsHandlers,
    recordPaths,
    refreshSequence,
    server,
    sessionIn,
    startApp,
} from "../test";

// Old bookmarks after the rename: design M1.7 D10 ("routes /groups* → /protocols*: redirects keep query and id"), the
// M1.7a contract "SPA routes and redirects" (outside the permission guard, `replace`, the id, the whole query string and
// the hash kept; `/groups/:id` with any segment goes to `/protocols/:id`, whose editor then applies GRP-060).

const clinic = aClinicContext({clinicId: 1, clinicName: "A"});
const tobradex = aDrug({name: "Tobradex"});
const protocol = aProtocol({id: 5, name: "Post cataract", items: [anItem(tobradex)]});

const openAt = async (route: string) => {
    server.use(
        refreshSequence(sessionIn(clinic)).handler,
        meByContext(),
        ...drugsHandlers([tobradex]),
        ...protocolsHandlers([protocol]),
    );
    const historyLength = window.history.length;
    const app = await startApp({route, lang: "ar"});
    return {...app, historyLength};
};

const where = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

describe("old /groups bookmarks @area:catalog", () => {
    test.each([
        ["/groups", "/protocols"],
        ["/groups/new", "/protocols/new"],
        ["/groups/5", "/protocols/5"],
        ["/groups?search=x&page=2", "/protocols?search=x&page=2"],
        ["/groups/5?x=1#notes", "/protocols/5?x=1#notes"],
    ])("%s lands on %s, replacing the old address in the history @GRP-100", async (from, to) => {
        const {historyLength} = await openAt(from);
        await waitFor(() => expect(where()).toBe(to));
        expect(window.location.pathname.startsWith("/groups")).toBe(false);
        expect(window.history.length).toBe(historyLength);
    });

    test("/groups/5 opens the protocol's editor @GRP-100", async () => {
        await openAt("/groups/5");
        expect(await screen.findByRole("textbox", {name: "اسم البروتوكول"})).toHaveValue("Post cataract");
        expect(window.location.pathname).toBe("/protocols/5");
    });

    test("/groups opens the protocols list @GRP-100", async () => {
        await openAt("/groups");
        expect(await screen.findByText("Post cataract")).toBeInTheDocument();
        expect(screen.getByRole("heading", {level: 1, name: "البروتوكولات"})).toBeInTheDocument();
    });

    test("/groups/abc goes to /protocols/abc, whose editor then sends it to /protocols (GRP-060) @GRP-100", async () => {
        const paths = recordPaths();
        await openAt("/groups/abc");
        await waitFor(() => expect(window.location.pathname).toBe("/protocols"));
        expect(paths.indexOf("/protocols/abc")).toBeGreaterThan(paths.indexOf("/groups/abc"));
        expect(paths.indexOf("/protocols")).toBeGreaterThan(paths.indexOf("/protocols/abc"));
        expect(await screen.findByText("Post cataract")).toBeInTheDocument();
    });
});
