import {describe, expect, test, vi} from "vitest";
import {screen} from "@testing-library/react";
import {http} from "msw";
import {aDrug, aProtocol, anItem, api, findToast, problem, recordRequests, server} from "../../../test";
import {openEditor} from "../../../test/pages/protocolEditor.tsx";

// The group size limit: docs/features/drug-groups/tech.md "Backend" (at most 1000 items, beyond it one
// `invalidRequest`) and docs/tech/overview.md "Data fetching" (a code without a message of its own → errors.generic).

// The editor holds the 1001 lines and sends them all, but rendering 1001 sortable rows takes tens of seconds in jsdom
// and is not what this case is about (the lines are tested in DrugGroupEditorPage.lines): no rows here, the count chip
// still shows how many lines the editor has
vi.mock("../../dosing/components/DosingLineList.tsx", () => ({DosingLineList: () => null}));

describe("group editor: more than 1000 lines @area:catalog", () => {
    test("saving more than 1000 lines: the API's `invalidRequest` reads «حدث خطأ ما. حاول مرة أخرى.» @GRP-019", async () => {
        const items = Array.from({length: 1001}, (_, i) => anItem(aDrug({name: `Drug ${i + 1}`})));
        const recorded = recordRequests();
        const {user} = await openEditor({protocol: aProtocol({items})});
        expect(screen.getByText("1001")).toBeInTheDocument();
        // Beyond 1000 items the API answers one `invalidRequest` (field `items`) and no per-item errors
        server.use(http.put(api("/drug-groups/:id"), () => problem(400, "invalidRequest", {errors: [{code: "invalidRequest", field: "items"}]})));
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("حدث خطأ ما. حاول مرة أخرى.");
        const [put] = recorded.writes();
        expect(put).toEqual(expect.objectContaining({method: "PUT"}));
        expect((put.body as { items: unknown[] }).items).toHaveLength(1001);
    });
});
