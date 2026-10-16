import {describe, test} from "vitest";
import {screen} from "@testing-library/react";
import {
    aClinicDetails,
    adminClinicsHandlers,
    aMe,
    anAuthResult,
    expectPath,
    meHandler,
    PLATFORM_CONTEXT,
    refreshHandler,
    server,
    startApp,
} from "../test";

// The admin area's routes: docs/features/platform-admin/tech.md "Frontend" (route table: `/admin/*` → `/admin`,
// `/platform` → `/admin`). The whole app (its router and AuthProvider), the session restored by the refresh cookie.

const openApp = async (path: string) => {
    server.use(
        refreshHandler(anAuthResult({context: PLATFORM_CONTEXT, contexts: [PLATFORM_CONTEXT]})),
        meHandler(aMe({context: PLATFORM_CONTEXT, user: {isSuperAdmin: true}})),
        ...adminClinicsHandlers([aClinicDetails({name: "Clinic A"})]),
    );
    await startApp({route: path});
    await screen.findByRole("link", {name: "Clinic A"});
};

describe("admin routes @area:admin", () => {
    test("the super admin in the platform context: /platform opens /admin @ADM-011", async () => {
        await openApp("/platform");
        await expectPath("/admin");
    });

    test("/admin/anything opens the clinics list (/admin) @ADM-011", async () => {
        await openApp("/admin/anything");
        await expectPath("/admin");
    });
});
