import {describe, expect, test} from "vitest";
import {fireEvent, screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    api,
    clinicPrintTemplateHandler,
    createTestQueryClient,
    findToast,
    hoverPastDelay,
    hoverTooltip,
    leaveTooltip,
    networkError,
    pastExitTransition,
    problem,
    recordRequests,
    stubClipboard,
    toastTexts,
} from "../../test";
import {
    actionsOf,
    aPrintedLine,
    editorPrint,
    fn,
    HINT,
    manual,
    oneEmptyListItem,
    openEditor,
    openWithRead,
    openWithTemplate,
    PRINT,
    TEMPLATE_PATH,
    templateNowIs,
    templateOf,
    typeInEditor,
} from "../../test/pages/printFlow.tsx";

// The Print buttons of the prescription page: contract § 3.5; design § 4.1, § 4.8; the business file's «القواعد».

describe("no template: no Print @area:prescription", () => {
    test("no Print in the panel or the editor; Copy and «تعديل ونسخ» work as before @TPL-103 @smoke", async () => {
        const requests = recordRequests();
        const page = await openWithTemplate(null, {clipboard: {}});
        await waitFor(() => expect(requests.requests.filter(r => r.path === TEMPLATE_PATH)).toHaveLength(1));
        await pastExitTransition();
        expect(page.selection().queryByRole("button", {name: PRINT})).not.toBeInTheDocument();

        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تم النسخ");
        expect((await page.clipboard!.written()).text).toBe("Tobradex\nرج الزجاجة");

        const editor = await openEditor(page);
        expect(actionsOf(editor).map(button => button.textContent)).toEqual(["إغلاق", "نسخ"]);
    });

    test("in English too @TPL-103", async () => {
        const requests = recordRequests();
        const page = await openWithTemplate(null, {lang: "en"});
        await waitFor(() => expect(requests.requests.filter(r => r.path === TEMPLATE_PATH)).toHaveLength(1));
        await pastExitTransition();
        expect(page.selection().queryByRole("button", {name: "Print"})).not.toBeInTheDocument();
    });

    test("while the read is loading, no Print yet: it comes with the answer @TPL-103", async () => {
        let answer = () => undefined as void;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        await openWithRead(http.get(api(TEMPLATE_PATH), async () => {
            await answered;
            return HttpResponse.json(templateOf());
        }));
        await pastExitTransition();
        expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument();

        answer();

        expect(await screen.findByRole("button", {name: PRINT})).toBeEnabled();
    });
});

describe("the buttons with a template @area:prescription", () => {
    test("no lines: Print shows disabled, without a tooltip, like Copy @TPL-104", async () => {
        const page = await openWithTemplate(templateOf(), {lines: []});
        const print = page.panelPrint();

        expect(print).toBeDisabled();
        expect(page.selection().getByRole("button", {name: "نسخ"})).toBeDisabled();
        hoverPastDelay(print.parentElement!);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    test("with lines Print is enabled, and clicking it prints @TPL-104", async () => {
        const page = await openWithTemplate(templateOf());
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
    });
});

describe("the read that fails when the page opens @area:prescription", () => {
    test.each([
        ["a server error", () => problem(500, "unexpected")],
        ["no network", () => networkError()],
    ])("%s: no Print, no message, and the page works @TPL-105", async (_name, answer) => {
        const requests = recordRequests();
        const page = await openWithRead(http.get(api(TEMPLATE_PATH), answer), [aPrintedLine()], {clipboard: {}});
        await waitFor(() => expect(requests.requests.filter(r => r.path === TEMPLATE_PATH).length).toBeGreaterThan(0));
        await pastExitTransition();

        expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
        expect(toastTexts()).toEqual([]);
        await page.user.click(screen.getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تم النسخ");
        await page.user.click(screen.getByRole("button", {name: "تعديل ونسخ"}));
        const editor = await screen.findByRole("dialog");
        await waitFor(() => expect(actionsOf(editor).map(button => button.textContent)).toEqual(["إغلاق", "نسخ"]));
    });

    test("Print shows once the page is opened again @TPL-105", async () => {
        const queryClient = createTestQueryClient();
        const first = await openWithRead(http.get(api(TEMPLATE_PATH), () => problem(500, "unexpected")), [aPrintedLine()], {queryClient});
        await pastExitTransition();
        expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
        first.unmount();

        await openWithRead(clinicPrintTemplateHandler(templateOf()), [aPrintedLine()], {queryClient});
        expect(await screen.findByRole("button", {name: PRINT})).toBeEnabled();
    });

    test("a template read that answers 204 after a failure stays without Print @TPL-105", async () => {
        const queryClient = createTestQueryClient();
        const first = await openWithRead(http.get(api(TEMPLATE_PATH), () => problem(500, "unexpected")), [aPrintedLine()], {queryClient});
        await pastExitTransition();
        first.unmount();

        await openWithRead(clinicPrintTemplateHandler(null), [aPrintedLine()], {queryClient});
        await pastExitTransition();
        expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
    });
});

describe("a template saved while the clinic works @area:prescription", () => {
    test("the page opened once, then a template saved: back on the page within 30 s, Print shows @TPL-302", async () => {
        const queryClient = createTestQueryClient();
        const first = await openWithRead(clinicPrintTemplateHandler(null), [aPrintedLine()], {queryClient});
        await pastExitTransition();
        expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
        first.unmount();

        await openWithRead(clinicPrintTemplateHandler(templateOf()), [aPrintedLine()], {queryClient});

        expect(await screen.findByRole("button", {name: PRINT})).toBeEnabled();
    });

    test("a template removed the same way: back on the page, Print is gone @TPL-302", async () => {
        const queryClient = createTestQueryClient();
        const first = await openWithRead(clinicPrintTemplateHandler(templateOf()), [aPrintedLine()], {queryClient});
        await screen.findByRole("button", {name: PRINT});
        first.unmount();

        await openWithRead(clinicPrintTemplateHandler(null), [aPrintedLine()], {queryClient});

        await waitFor(() => expect(screen.queryByRole("button", {name: PRINT})).not.toBeInTheDocument());
    });

    test("after a reload (a new page load), Print shows @TPL-302", async () => {
        const first = await openWithRead(clinicPrintTemplateHandler(null));
        await pastExitTransition();
        first.unmount();

        await openWithRead(clinicPrintTemplateHandler(templateOf()));

        expect(await screen.findByRole("button", {name: PRINT})).toBeEnabled();
    });

    test("the page left open and a template saved meanwhile: no Print until it's opened again, and nothing breaks @TPL-303", async () => {
        const page = await openWithTemplate(null, {clipboard: {}});
        await pastExitTransition();
        templateNowIs(templateOf());
        const requests = recordRequests();

        // TanStack's focus manager listens for this event on the window
        fireEvent(window, new Event("visibilitychange"));
        await pastExitTransition();

        expect(requests.requests.filter(r => r.path === TEMPLATE_PATH)).toEqual([]);
        expect(page.selection().queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تم النسخ");
    });

    test("the network coming back after the page opened sends no read, so no Print either @TPL-303", async () => {
        const page = await openWithTemplate(null);
        await pastExitTransition();
        templateNowIs(templateOf());
        const requests = recordRequests();

        // TanStack's online manager acts on a change: offline, then online
        fireEvent(window, new Event("offline"));
        fireEvent(window, new Event("online"));
        await pastExitTransition();

        expect(requests.requests.filter(r => r.path === TEMPLATE_PATH)).toEqual([]);
        expect(page.selection().queryByRole("button", {name: PRINT})).not.toBeInTheDocument();
    });
});

describe("Print in the editor @area:prescription", () => {
    test("the actions are Close, Print, Copy, in this order, and Print is enabled with text @TPL-304", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);

        await waitFor(() => expect(actionsOf(editor).map(button => button.textContent)).toEqual(["إغلاق", PRINT, "نسخ"]));
        expect(editorPrint(editor)).toBeEnabled();
    });

    test.each([
        ["everything deleted", () => typeInEditor("")],
        ["only spaces", () => typeInEditor("    ")],
        ["one empty list item", () => oneEmptyListItem()],
    ])("%s: disabled, with no tooltip; typing a letter enables it @TPL-304 @smoke", async (_name, empty) => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);

        empty();

        await waitFor(() => expect(editorPrint(editor)).toBeDisabled());
        hoverPastDelay(editorPrint(editor).parentElement!);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        typeInEditor("ن");

        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());
    });

    test.each([
        ["everything deleted", () => typeInEditor("")],
        ["only spaces", () => typeInEditor("    ")],
        ["one empty list item", () => oneEmptyListItem()],
    ])("%s: the editor's Copy behaves as today: enabled, and it copies @TPL-304", async (_name, empty) => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        const clipboard = stubClipboard();

        empty();
        await waitFor(() => expect(editorPrint(editor)).toBeDisabled());

        const copy = actionsOf(editor).find(button => button.textContent === "نسخ")!;
        expect(copy).toBeEnabled();
        await page.user.click(copy);
        await waitFor(() => expect(clipboard.write).toHaveBeenCalledTimes(1));
        expect(await findToast()).toBe("تم النسخ");
    });

    test("a disabled Print in the editor does nothing @TPL-304", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        typeInEditor("");
        await waitFor(() => expect(editorPrint(editor)).toBeDisabled());

        fireEvent.click(editorPrint(editor));
        await pastExitTransition();

        expect(page.print).not.toHaveBeenCalled();
    });
});

describe("the hint to print at 100% @area:prescription", () => {
    test("with no pop-up, it's the tooltip of Print beside Copy and in the editor @TPL-306 @smoke", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "fullDate")));

        expect(await hoverTooltip(page.panelPrint())).toBe(HINT);
        await leaveTooltip(page.panelPrint());

        const editor = await openEditor(page);
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());
        expect(await hoverTooltip(editorPrint(editor))).toBe(HINT);
    });

    test("in English: \"Print at 100%, without \"Fit to page\".\" @TPL-306", async () => {
        const page = await openWithTemplate(templateOf(), {lang: "en"});
        expect(await hoverTooltip(page.panelPrint())).toBe("Print at 100%, without \"Fit to page\".");
    });

    test("with a pop-up, Print's tooltip says the same before the click @TPL-306", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        expect(await hoverTooltip(page.panelPrint())).toBe(HINT);
    });
});

describe("the read when the page opens @area:prescription", () => {
    test("it asks the clinic's own route, with no clinic id, once @TPL-103", async () => {
        const requests = recordRequests();
        await openWithTemplate(templateOf());

        expect(requests.requests.filter(r => r.path === TEMPLATE_PATH)).toEqual([expect.objectContaining({method: "GET", path: TEMPLATE_PATH, search: ""})]);
    });
});
