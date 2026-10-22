import {describe, expect, test} from "vitest";
import {protocolPathOf} from "./legacyRoutes.ts";

// The old bookmarks of the protocols screens (named groups before M1.7a): M1.7a contract "SPA routes and redirects"
// (`/groups` → `/protocols`, `/groups/new` → `/protocols/new`, `/groups/:id` (any segment) → `/protocols/:id`, the
// whole query string and hash kept). The routes match like react-router's: any case, an optional trailing slash.

const at = (pathname: string, search = "", hash = "") => protocolPathOf({pathname, search, hash});

describe("protocolPathOf: an old /groups address to its /protocols one @area:catalog", () => {
    test.each([
        ["/groups", "/protocols"],
        ["/groups/", "/protocols"],
        ["/GROUPS", "/protocols"],
        ["/groups/new", "/protocols/new"],
        ["/groups/new/", "/protocols/new"],
        ["/groups/5", "/protocols/5"],
        ["/groups/5/", "/protocols/5"],
        ["/GROUPS/5", "/protocols/5"],
        ["/groups/abc", "/protocols/abc"],
    ])("%s → %s @GRP-100", (from, to) => {
        expect(at(from)).toBe(to);
    });

    test("/Groups/New is the new-protocol route (react-router matches any case): /protocols/new @GRP-100", () => {
        expect(at("/Groups/New")).toBe("/protocols/new");
    });

    test("the query string and the hash are kept as they are @GRP-100", () => {
        expect(at("/groups/5", "?x=1", "#h")).toBe("/protocols/5?x=1#h");
        expect(at("/groups", "?search=x&page=2", "")).toBe("/protocols?search=x&page=2");
        expect(at("/groups/new/", "", "#top")).toBe("/protocols/new#top");
    });

    test.each([
        "/groups/5/x",
        "/groups//",
        "/groupsx",
        "/groups5",
        "/x/groups",
        "/x/groups/5",
        "/protocols",
        "/protocols/5",
        "/",
        "",
    ])("%s is not an old protocols address: null @GRP-100", pathname => {
        expect(at(pathname, "?x=1", "#h")).toBeNull();
    });
});
