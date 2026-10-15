import {describe, expect, test} from "vitest";
import {fireEvent, screen, waitFor} from "@testing-library/react";
import {http} from "msw";
import {aDrug, aGroup, anItem, api, problem, type RecordedRequest, recordRequests, server, toastTexts} from "../../../test";
import {openEditor} from "../../../test/fe-catalog";

// The group size limit: docs/features/drug-groups/tech.md "Backend" (at most 1000 items, beyond it one
// `invalidRequest`) and docs/tech/overview.md "Data fetching" (a code without a message of its own → errors.generic).

// A text query: role queries take seconds on a page of 1001 lines
const saveButton = () => screen.getByText("حفظ").closest("button")!;
const writes = (requests: RecordedRequest[]) => requests.filter(r => r.method !== "GET");

describe("group editor: more than 1000 lines @area:catalog", () => {
    // 1001 sortable rows take seconds to render in jsdom: a file of its own runs beside the others, with more time
    test("saving more than 1000 lines: the API's `invalidRequest` reads «حدث خطأ ما. حاول مرة أخرى.» @GRP-019", {timeout: 60_000}, async () => {
        const items = Array.from({length: 1001}, (_, i) => anItem(aDrug({name: `Drug ${i + 1}`})));
        const recorded = recordRequests();
        await openEditor({group: aGroup({items})});
        // Beyond 1000 items the API answers one `invalidRequest` (field `items`) and no per-item errors
        server.use(http.put(api("/drug-groups/:id"), () => problem(400, "invalidRequest", {errors: [{code: "invalidRequest", field: "items"}]})));
        // A plain click: user-event's visibility checks walk the styles of a huge page
        fireEvent.click(saveButton());
        // The page re-renders 1001 lines before the toast: wait longer than findToast does
        const toast = await waitFor(() => {
            const [newest] = toastTexts();
            if (newest === undefined) throw new Error("No toast is shown");
            return newest;
        }, {timeout: 30_000});
        expect(toast).toBe("حدث خطأ ما. حاول مرة أخرى.");
        const [put] = writes(recorded.requests);
        expect((put.body as { items: unknown[] }).items).toHaveLength(1001);
    });
});
