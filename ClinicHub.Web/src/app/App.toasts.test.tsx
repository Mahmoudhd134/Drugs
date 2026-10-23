import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {aClinicContext, aDrug, drugsHandlers, meByContext, refreshSequence, server, sessionIn, startApp, toastTexts} from "../test";

// Toasts can be dismissed: docs/business/overview.md and docs/tech/overview.md (the toasts: an × icon closes one at
// once, a swipe on a phone too). The swipe is e2e only (UX-039).

describe("dismissing a toast @area:ux", () => {
    test("the toast's × («إغلاق») closes that toast at once, the other one stays @UX-038", async () => {
        server.use(refreshSequence(sessionIn(aClinicContext())).handler, meByContext(), ...drugsHandlers([aDrug({name: "Tobradex"})]));
        await startApp({route: "/drugs?view=list", lang: "ar"});
        await screen.findByText("Tobradex");
        // The app's own copy of react-hot-toast (startApp loads the app on fresh modules), so its Toaster shows them
        const {default: appToast} = await import("react-hot-toast");
        act(() => {
            appToast.success("الأول");
            appToast.error("الثاني");
        });
        await waitFor(() => expect(toastTexts()).toEqual(["الثاني", "الأول"]));

        const first = screen.getByText("الأول").closest("[role=status]")!.parentElement!;
        await act(async () => within(first).getByRole("button", {name: "إغلاق"}).click());

        // At once: well before the toast would leave by itself (2 s for a success)
        await waitFor(() => expect(toastTexts()).toEqual(["الثاني"]), {timeout: 1000});
    });
});
