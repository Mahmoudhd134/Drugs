import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aDrug, aProtocol, anItem, api, findToast, protocolsHandlers, renderWithProviders, server} from "../../../test";
import {openEditor, treeDrug} from "../../../test/pages/protocolEditor.tsx";
import {ProtocolsPage} from "./ProtocolsPage.tsx";

// The Arabic wording of protocols: design M1.7 D10 (masculine «بروتوكول»: «تم إنشاء البروتوكول», «بروتوكول جديد»…),
// the M1.7a contract "Every changed locale text" (protocols.new, created, updated, deleted, deleteTitle).

describe("protocols: the masculine «بروتوكول» in titles and toasts @area:catalog", () => {
    test("a new protocol: the title «بروتوكول جديد», and its save «تم إنشاء البروتوكول» @GRP-103", async () => {
        const tobradex = aDrug({name: "Tobradex"});
        const {user} = await openEditor({drugs: [tobradex]});
        expect(screen.getByRole("heading", {level: 1, name: "بروتوكول جديد"})).toBeInTheDocument();
        await user.click(await treeDrug("Tobradex"));
        await user.type(screen.getByRole("textbox", {name: "اسم البروتوكول"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("تم إنشاء البروتوكول");
    });

    test("an existing protocol saved: «تم تحديث البروتوكول» @GRP-103", async () => {
        const protocol = aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"}))]});
        const {user} = await openEditor({protocol});
        expect(screen.getByRole("heading", {level: 1, name: "تعديل البروتوكول"})).toBeInTheDocument();
        await user.type(screen.getByRole("textbox", {name: "اسم البروتوكول"}), " 2");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("تم تحديث البروتوكول");
    });

    test("a card's delete: the question «حذف البروتوكول؟», then «تم حذف البروتوكول» @GRP-103", async () => {
        const protocol = aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"}))]});
        server.use(
            ...protocolsHandlers([protocol]),
            http.delete(api("/protocols/:id"), () => new HttpResponse(null, {status: 204})),
        );
        const {user} = await renderWithProviders(<ProtocolsPage/>, {lang: "ar", route: "/protocols"});
        await screen.findByText("Post cataract");
        await user.click(screen.getByRole("button", {name: "حذف"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", {name: "حذف البروتوكول؟"})).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", {name: "حذف"}));
        expect(await findToast()).toBe("تم حذف البروتوكول");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});
