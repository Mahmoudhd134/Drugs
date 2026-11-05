import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http} from "msw";
import {api, expectToasts, findToast, networkError, pastExitTransition, problem, recordRequests, server, stubClipboard, toastTexts} from "../../test";
import {
    actionsOf,
    cancelButton,
    confirmButton,
    editorPrint,
    editorText,
    fn,
    findPopup,
    GONE,
    heldRead,
    manual,
    openEditor,
    openWithTemplate,
    popupFields,
    PRINT,
    queryPopup,
    settled,
    TEMPLATE_PATH,
    templateNowIs,
    templateOf,
    typeInEditor,
    valueOn,
} from "../../test/pages/printFlow.tsx";

// A click re-reads the template: contract §§ 2.1, 3.2; design § 4.2; the business file: «لا يُطبع القالب من نسخة قديمة…».

const NETWORK_MESSAGE = "تعذّر الاتصال بالخادم. تحقّق من الاتصال.";
const GENERIC_MESSAGE = "حدث خطأ ما. حاول مرة أخرى.";

const reads = (requests: ReturnType<typeof recordRequests>) => requests.requests.filter(r => r.path === TEMPLATE_PATH);

describe("staying current @area:prescription", () => {
    test("a template changed after the page loaded: the new one is used @TPL-150 @smoke", async () => {
        const page = await openWithTemplate(templateOf(manual("old", "القديم")));
        templateNowIs(templateOf(fn("new", "dayOfMonth")));

        await page.pressPrint();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(queryPopup()).not.toBeInTheDocument();
        const [sheet] = page.sheets();
        expect(sheet.querySelector('[data-item-id="new"]')).not.toBeNull();
        expect(sheet.querySelector('[data-item-id="old"]')).toBeNull();
    });

    test("the pop-up asks what the new template asks @TPL-150", async () => {
        const page = await openWithTemplate(templateOf(manual("old", "القديم")));
        templateNowIs(templateOf(manual("new", "الجديد")));

        await page.pressPrint();

        const popup = await findPopup();
        expect(within(popup).getByRole("textbox", {name: "الجديد"})).toBeInTheDocument();
        expect(within(popup).queryByRole("textbox", {name: "القديم"})).not.toBeInTheDocument();
    });

    test("every click reads it: one request per click, never from a cached copy @TPL-150", async () => {
        const page = await openWithTemplate(templateOf());
        const requests = recordRequests();

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(reads(requests)).toHaveLength(1);
        page.finishPrint();

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));
        expect(reads(requests)).toHaveLength(2);
    });

    test("a template removed after the page loaded: «لم يعد لهذه العيادة قالب طباعة.», nothing prints and the button disappears @TPL-151 @smoke", async () => {
        const page = await openWithTemplate(templateOf());
        templateNowIs(null);

        await page.pressPrint();

        expect(await findToast()).toBe(GONE);
        await waitFor(() => expect(page.selection().queryByRole("button", {name: PRINT})).not.toBeInTheDocument());
        await settled();
        expect(page.print).not.toHaveBeenCalled();
        expect(page.printRoot()).toBeNull();
    });

    test("in English: \"This clinic no longer has a print template.\" @TPL-151", async () => {
        const page = await openWithTemplate(templateOf(), {lang: "en"});
        templateNowIs(null);

        await page.pressPrint();

        expect(await findToast()).toBe("This clinic no longer has a print template.");
    });

    test.each([
        ["the network failing", () => networkError(), NETWORK_MESSAGE],
        ["a server error", () => problem(500, "unexpected"), GENERIC_MESSAGE],
    ])("%s at the click: the error message, nothing prints, no retry behind the user's back @TPL-152 @smoke", async (_name, answer, message) => {
        const page = await openWithTemplate(templateOf());
        const requests = recordRequests();
        server.use(http.get(api(TEMPLATE_PATH), answer));

        await page.pressPrint();

        await expectToasts(message);
        await settled();
        expect(page.print).not.toHaveBeenCalled();
        expect(page.printRoot()).toBeNull();
        expect(reads(requests)).toHaveLength(1);
    });

    test("a failed read asks nothing: no pop-up @TPL-152", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        server.use(http.get(api(TEMPLATE_PATH), () => networkError()));

        await page.pressPrint();

        await expectToasts(NETWORK_MESSAGE);
        expect(queryPopup()).not.toBeInTheDocument();
    });

    test("a failed read keeps Print, and when the network returns Print works: it never stayed stuck @TPL-344 @smoke", async () => {
        const template = templateOf(fn("f1", "dayOfMonth"));
        const page = await openWithTemplate(template);
        server.use(http.get(api(TEMPLATE_PATH), () => networkError()));
        await page.pressPrint();
        await expectToasts(NETWORK_MESSAGE);
        expect(page.panelPrint()).toBeEnabled();

        templateNowIs(template);
        await page.pressPrint();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(page.sheets()).toHaveLength(1);
    });

    test("two failures in a row, then it works, with one message each time @TPL-344", async () => {
        const page = await openWithTemplate(templateOf());
        server.use(http.get(api(TEMPLATE_PATH), () => problem(500, "unexpected")));
        await page.pressPrint();
        await expectToasts(GENERIC_MESSAGE);
        await page.pressPrint();
        await expectToasts(GENERIC_MESSAGE, GENERIC_MESSAGE);
        await waitFor(() => expect(page.panelPrint()).toBeEnabled());
        await pastExitTransition();
        expect(toastTexts()).toEqual([GENERIC_MESSAGE, GENERIC_MESSAGE]);

        templateNowIs(templateOf());
        await page.pressPrint();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
    });
});

describe("double clicks @area:prescription", () => {
    test("no pop-up: Print double-clicked, one template request and one `window.print` @TPL-307 @smoke", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        const requests = recordRequests();

        await page.user.dblClick(page.panelPrint());

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        await settled();
        expect(page.print).toHaveBeenCalledTimes(1);
        expect(reads(requests)).toHaveLength(1);
    });

    test("a pop-up: Print double-clicked, one pop-up that stays open @TPL-307", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        const requests = recordRequests();

        await page.user.dblClick(page.panelPrint());

        const popup = await findPopup();
        await settled();
        expect(screen.getAllByRole("dialog")).toEqual([popup]);
        expect(reads(requests)).toHaveLength(1);
        expect(page.print).not.toHaveBeenCalled();
    });

    test("a click while the read is pending does nothing @TPL-307", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        const held = heldRead(templateOf(fn("f1", "dayOfMonth")));

        await page.pressPrint();
        await waitFor(() => expect(held.calls()).toBe(1));
        await page.pressPrint();
        await page.pressPrint();
        await pastExitTransition();
        expect(held.calls()).toBe(1);
        expect(page.print).not.toHaveBeenCalled();

        held.release();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        await settled();
        expect(page.print).toHaveBeenCalledTimes(1);
    });

    test("a click reaching Print while the pop-up is open from the same flow does nothing: no second read, the same pop-up with its value @TPL-307", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        await page.pressPrint();
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "أحمد");
        const requests = recordRequests();

        page.panelPrint().click();
        await pastExitTransition();

        expect(reads(requests)).toEqual([]);
        expect(screen.getAllByRole("dialog")).toEqual([popup]);
        expect(popupFields(popup)[0]).toHaveValue("أحمد");
    });

    test("once the flow is over, Print starts a new one @TPL-307", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        await page.pressPrint();
        await page.user.click(cancelButton(await findPopup()));
        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());

        await page.pressPrint();
        await page.user.click(confirmButton(await findPopup()));

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
    });
});

describe("the pop-up over the editor @area:prescription", () => {
    test.each([
        ["Cancel", async (page: Awaited<ReturnType<typeof openWithTemplate>>, popup: HTMLElement) => page.user.click(cancelButton(popup))],
        ["Esc", async (page: Awaited<ReturnType<typeof openWithTemplate>>) => page.user.keyboard("{Escape}")],
    ])("%s closes only the pop-up: the editor stays with its edits and the focus returns to its Print @TPL-309 @smoke", async (_name, leave) => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorText()).toContain("نص معدل"));
        await page.user.click(editorPrint(editor));
        const popup = await findPopup();

        await leave(page, popup);

        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());
        expect(editor).toBeInTheDocument();
        expect(editorText()).toContain("نص معدل");
        await waitFor(() => expect(editorPrint(editor)).toHaveFocus());
        await settled();
        expect(page.print).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBe(editor);
    });

    test("confirmed over the editor: it prints the edited text and the editor stays @TPL-309", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorText()).toContain("نص معدل"));
        await page.user.click(editorPrint(editor));
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "أحمد");

        await page.user.click(confirmButton(popup));

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(valueOn(page.sheets()[0], "m1")).toBe("أحمد");
        expect(page.sheets()[0].textContent).toContain("نص معدل");
        expect(document.querySelector(".ql-editor")).not.toBeNull();
    });

    test("the editor open and the template removed, Print there: the message, Print gone from the editor and the panel, the editor stays with its edits and Copy works @TPL-345 @smoke", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        const clipboard = stubClipboard();
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorText()).toContain("نص معدل"));
        templateNowIs(null);

        await page.user.click(editorPrint(editor));

        expect(await findToast()).toBe(GONE);
        await waitFor(() => expect(actionsOf(editor).map(button => button.textContent)).toEqual(["إغلاق", "نسخ"]));
        expect(page.selection().queryByRole("button", {name: PRINT, hidden: true})).not.toBeInTheDocument();
        expect(editorText()).toContain("نص معدل");
        expect(page.print).not.toHaveBeenCalled();

        await page.user.click(actionsOf(editor)[1]);
        await waitFor(() => expect(clipboard.write).toHaveBeenCalledTimes(1));
        expect((await clipboard.written()).text).toBe("نص معدل");
    });
});
