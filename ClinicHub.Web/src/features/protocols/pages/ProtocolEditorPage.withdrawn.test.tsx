import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {http} from "msw";
import {aDrug, aProtocol, anItem, api, aSharedDrug, findToast, isolate, problem, server} from "../../../test";
import {lineSummary, openEditor} from "../../../test/pages/protocolEditor.tsx";

// A withdrawn shared drug in the protocol editor's save (design M1.7 D6: a line beyond the stored ones → 400
// `drugWithdrawn` on `items[i].drugId`; M1.7b contract "Protocol editor": the toast `protocols.drugWithdrawnNamed`
// names the drug of line `items[i]` the editor sent).

const nameField = () => screen.getByRole("textbox", {name: "اسم البروتوكول"});

describe("protocol editor: saving a line of a disabled drug @area:catalog", () => {
    test("400 `drugWithdrawn` on items[1]: the toast names that line's drug and the editor keeps its changes @CAT-155", async () => {
        const first = aDrug({name: "Tobradex"});
        const withdrawn = aSharedDrug({name: "TOBRADEX EYE OINT. 3.5 GM", withdrawn: true});
        const last = aDrug({name: "Vigamox own"});
        const protocol = aProtocol({name: "Post cataract", items: [anItem(first), anItem(withdrawn), anItem(last)]});
        const {user} = await openEditor({protocol});
        // Tab 1 removed the line and saved meanwhile: this tab's save sends one line more than stored
        server.use(http.put(api("/protocols/:id"), () =>
            problem(400, "drugWithdrawn", {errors: [{code: "drugWithdrawn", field: "items[1].drugId"}]})));
        await user.type(nameField(), " 2");
        await user.click(screen.getByRole("button", {name: "حفظ"}));

        expect(await findToast()).toBe(`«${isolate(withdrawn.name)}» معطّل من الإدارة ولا يمكن إضافته.`);
        expect(nameField()).toHaveValue("Post cataract 2");
        expect(lineSummary()).toEqual([["1", first.name], ["2", withdrawn.name], ["3", last.name]]);
        await waitFor(() => expect(screen.getByRole("button", {name: "حفظ"})).toBeEnabled());
    });

    test("in English: \"“…” was disabled by the admin and can't be added.\" @CAT-155", async () => {
        const withdrawn = aSharedDrug({name: "XALATAN 50MCG/ML EYE DROPS 2.5 ML", withdrawn: true});
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"})), anItem(withdrawn)]});
        const {user} = await openEditor({protocol, lang: "en"});
        server.use(http.put(api("/protocols/:id"), () =>
            problem(400, "drugWithdrawn", {errors: [{code: "drugWithdrawn", field: "items[1].drugId"}]})));
        await user.type(screen.getByRole("textbox", {name: "Protocol name"}), " 2");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe(`“${isolate(withdrawn.name)}” was disabled by the admin and can't be added.`);
    });
});
