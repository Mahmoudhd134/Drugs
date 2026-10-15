import {describe, expect, test} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import {aClinicDetails, adminClinicsHandlers, aMe, anAuthResult, meHandler, PLATFORM_CONTEXT, refreshHandler, server} from "../test";
import "../test/fe-admin/patience.ts";
import {App} from "./App.tsx";

// The admin area's routes: docs/features/platform-admin/tech.md "Frontend" (route table: `/admin/*` → `/admin`,
// `/platform` → `/admin`). The whole app (its router and AuthProvider), the session restored by the refresh cookie.

const openApp = async (path: string) => {
    server.use(
        refreshHandler(anAuthResult({context: PLATFORM_CONTEXT, contexts: [PLATFORM_CONTEXT]})),
        meHandler(aMe({context: PLATFORM_CONTEXT, user: {isSuperAdmin: true}})),
        ...adminClinicsHandlers([aClinicDetails({name: "Clinic A"})]),
    );
    window.history.replaceState(null, "", path);
    render(<App/>);
    await screen.findByRole("link", {name: "Clinic A"});
};

describe("admin routes @area:admin", () => {
    test("the super admin in the platform context: /platform opens /admin @ADM-011", async () => {
        await openApp("/platform");
        await waitFor(() => expect(window.location.pathname).toBe("/admin"));
    });

    test("/admin/anything opens the clinics list (/admin) @ADM-011", async () => {
        await openApp("/admin/anything");
        await waitFor(() => expect(window.location.pathname).toBe("/admin"));
    });
});
