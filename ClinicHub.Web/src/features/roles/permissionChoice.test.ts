import {describe, expect, test} from "vitest";
import {PERMISSION_CATALOG} from "../../test";
import {groupCatalog, requiredBy, toggle, withRequirements} from "./permissionChoice.ts";

// Rules: docs/features/platform-admin/tech.md "Roles and staff screens" (permissionChoice.ts, like the server's
// PermissionCatalog.WithRequirements); the requirements as declared in docs/features/access/tech.md.

const catalog = PERMISSION_CATALOG;

/** The server's closure of each key (transitive requirements), in catalog order. */
const CLOSURES: Record<string, string[]> = {
    "drugs.list": ["drugs.list"],
    "drugs.details": ["drugs.list", "drugs.details"],
    "drugs.create": ["drugs.list", "drugs.create"],
    "drugs.update": ["drugs.list", "drugs.details", "drugs.update"],
    "drugs.delete": ["drugs.list", "drugs.details", "drugs.delete"],
    "groups.list": ["groups.list"],
    "groups.details": ["groups.list", "groups.details"],
    "groups.create": ["drugs.list", "groups.list", "groups.create"],
    "groups.update": ["drugs.list", "groups.list", "groups.details", "groups.update"],
    "groups.delete": ["groups.list", "groups.delete"],
    "prescriptions.create": ["drugs.list", "prescriptions.create"],
};

describe("permission choice rules @area:admin", () => {
    test("withRequirements, toggle and requiredBy give the server's closure for every key @ADM-184", () => {
        expect(Object.keys(CLOSURES).sort()).toEqual(catalog.map(p => p.key).sort());
        for (const [key, closure] of Object.entries(CLOSURES)) {
            expect(withRequirements(catalog, [key]), key).toEqual(closure);
            // Ticking the key on an empty role ticks the same set
            const ticked = toggle(catalog, new Set(), key);
            expect(ticked, key).toEqual(closure);
            // Each requirement is now held by a ticked permission and can't be unticked
            for (const requirement of closure.filter(k => k !== key)) {
                expect(requiredBy(catalog, new Set(ticked), requirement).length, `${key} → ${requirement}`).toBeGreaterThan(0);
                expect(toggle(catalog, new Set(ticked), requirement), `${key} → ${requirement}`).toEqual(ticked);
            }
            // The key itself is required by nothing ticked: unticking it removes only it
            expect(toggle(catalog, new Set(ticked), key)).toEqual(closure.filter(k => k !== key));
        }
    });

    test("several keys: the union of their closures, in catalog order, unknown keys dropped", () => {
        expect(withRequirements(catalog, ["prescriptions.create", "groups.update", "nope.key"]))
            .toEqual(["drugs.list", "groups.list", "groups.details", "groups.update", "prescriptions.create"]);
        expect(withRequirements(catalog, [])).toEqual([]);
        expect(withRequirements(catalog, new Set(["drugs.delete", "drugs.delete"]))).toEqual(["drugs.list", "drugs.details", "drugs.delete"]);
    });

    test("requiredBy lists the ticked permissions that directly need the key, in catalog order", () => {
        const ticked = new Set(withRequirements(catalog, ["drugs.update", "drugs.delete", "groups.create", "prescriptions.create"]));
        expect(requiredBy(catalog, ticked, "drugs.details").map(p => p.key)).toEqual(["drugs.update", "drugs.delete"]);
        expect(requiredBy(catalog, ticked, "drugs.list").map(p => p.key)).toEqual(["drugs.details", "groups.create", "prescriptions.create"]);
        expect(requiredBy(catalog, ticked, "groups.create")).toEqual([]);
        expect(requiredBy(catalog, new Set(), "drugs.list")).toEqual([]);
    });

    test("ticking adds to what is ticked; unticking a free key keeps the others", () => {
        const ticked = new Set(["drugs.list", "groups.list"]);
        expect(toggle(catalog, ticked, "groups.delete")).toEqual(["drugs.list", "groups.list", "groups.delete"]);
        expect(toggle(catalog, new Set(["drugs.list", "groups.list", "groups.delete"]), "groups.list"))
            .toEqual(["drugs.list", "groups.list", "groups.delete"]);
        expect(toggle(catalog, ticked, "groups.list")).toEqual(["drugs.list"]);
    });

    test("groupCatalog: modules, then resources, in catalog order", () => {
        const grouped = groupCatalog(catalog);
        expect(grouped.map(m => [m.module, m.resources.map(r => [r.resource, r.permissions.map(p => p.action)])])).toEqual([
            ["catalog", [
                ["drugs", ["list", "details", "create", "update", "delete"]],
                ["groups", ["list", "details", "create", "update", "delete"]],
            ]],
            ["prescription", [["prescriptions", ["create"]]]],
        ]);
        expect(groupCatalog([])).toEqual([]);
    });
});
