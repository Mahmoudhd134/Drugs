import {describe, expect, test} from "vitest";
import {screen, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aDrug, aProtocol, anItem, api, drugsHandlers, findToast, problem, renderWithProviders, server} from "../../../test";
import {ProtocolsPage} from "./ProtocolsPage.tsx";
import {ProtocolEditorPage} from "./ProtocolEditorPage.tsx";

// A tab still running the old bundle after the upgrade: its protocol calls reach routes that no longer exist and the
// API answers 404 `notFound` (GET) or 405 `methodNotAllowed` (POST, PUT, DELETE): design M1.7 D10 ("the SPA's existing
// 404/405 error handling"), M1.7a contract "Old API routes" (GET → errors.notFound, saves → errors.generic since
// `methodNotAllowed` has no key), docs/tech/overview.md "Data fetching" (getErrorMessage).

const tobradex = aDrug({name: "Tobradex"});
const protocol = aProtocol({name: "Post cataract", items: [anItem(tobradex)]});
const gone = () => problem(404, "notFound");
const refused = () => problem(405, "methodNotAllowed");

describe("protocols: the old API routes answering 404 / 405 @area:errors", () => {
    test("the list's GET answers 404 notFound: the page keeps its title and shows the load error with «إعادة المحاولة», not a blank page @GRP-105", async () => {
        server.use(http.get(api("/protocols"), gone));
        await renderWithProviders(<ProtocolsPage/>, {lang: "ar", route: "/protocols"});
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/هذا العنصر لم يعد موجودًا\.|تعذّر تحميل البيانات\./);
        expect(within(alert).getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {level: 1, name: "البروتوكولات"})).toBeInTheDocument();
    });

    test("the editor's GET answers 404 notFound: «هذا العنصر لم يعد موجودًا.» with «إعادة المحاولة» instead of the form @GRP-105", async () => {
        server.use(...drugsHandlers([tobradex]), http.get(api("/protocols/:id"), gone));
        await renderWithProviders(<ProtocolEditorPage/>, {lang: "ar", route: `/protocols/${protocol.id}`, path: "/protocols/:id"});
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("هذا العنصر لم يعد موجودًا.");
        expect(within(alert).getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
        expect(screen.queryByRole("textbox", {name: "اسم البروتوكول"})).not.toBeInTheDocument();
    });

    test("a new protocol's POST answers 405 methodNotAllowed: «حدث خطأ ما. حاول مرة أخرى.» and the form keeps what was typed @GRP-105", async () => {
        server.use(...drugsHandlers([tobradex]), http.post(api("/protocols"), refused));
        const {user, location} = await renderWithProviders(<ProtocolEditorPage/>, {lang: "ar", route: "/protocols/new", path: "/protocols/new"});
        await user.click(await screen.findByText("Tobradex", {selector: "[role=option] *"}));
        await user.type(screen.getByRole("textbox", {name: "اسم البروتوكول"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("حدث خطأ ما. حاول مرة أخرى.");
        expect(screen.getByRole("textbox", {name: "اسم البروتوكول"})).toHaveValue("Post cataract");
        expect(location().pathname).toBe("/protocols/new");
    });

    test("in English an edited protocol's PUT answering 405: \"Something went wrong. Please try again.\", the editor stays @GRP-105", async () => {
        server.use(
            ...drugsHandlers([tobradex]),
            http.get(api("/protocols/:id"), () => HttpResponse.json(protocol)),
            http.put(api("/protocols/:id"), refused),
        );
        const {user, location} = await renderWithProviders(<ProtocolEditorPage/>, {lang: "en", route: `/protocols/${protocol.id}`, path: "/protocols/:id"});
        const name = await screen.findByRole("textbox", {name: "Protocol name"});
        await user.type(name, " 2");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("Something went wrong. Please try again.");
        expect(name).toHaveValue("Post cataract 2");
        expect(location().pathname).toBe(`/protocols/${protocol.id}`);
    });
});
