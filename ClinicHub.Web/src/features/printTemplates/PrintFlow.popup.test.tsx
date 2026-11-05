import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {clickOutside, expectStillOpen, fillIn, pastExitTransition, recordRequests} from "../../test";
import {
    cancelButton,
    confirmButton,
    fn,
    findPopup,
    HINT,
    manual,
    openWithTemplate,
    popupFields,
    POPUP_TITLE,
    queryPopup,
    settled,
    staticText,
    templateNowIs,
    templateOf,
    valueOn,
} from "../../test/pages/printFlow.tsx";

// The pop-up: contract § 3.3; design § 4.3; the business file: «الحقول اليدوية لا تُحفظ…».

const NAME_AND_AGE = () => templateOf(manual("m1", "الاسم"), manual("m2", "السن"));

/** The page with these manual inputs and the pop-up open. */
const openPopup = async (template = NAME_AND_AGE()) => {
    const page = await openWithTemplate(template);
    await page.pressPrint();
    return {...page, popup: await findPopup()};
};

describe("the pop-up @area:prescription", () => {
    test("both fields in the template's order, labelled by their names, empty, focus on the first; nothing printed yet @TPL-110 @smoke", async () => {
        const {popup, print} = await openPopup();

        const fields = popupFields(popup);
        expect(fields).toHaveLength(2);
        expect(within(popup).getByRole("textbox", {name: "الاسم"})).toBe(fields[0]);
        expect(within(popup).getByRole("textbox", {name: "السن"})).toBe(fields[1]);
        for (const field of fields) expect(field).toHaveValue("");
        await waitFor(() => expect(fields[0]).toHaveFocus());
        expect(print).not.toHaveBeenCalled();
    });

    test("the order is the template's, not the names' or the sheet's: a later place first @TPL-110", async () => {
        const {popup} = await openPopup(templateOf(
            {...manual("z", "ياء"), xMm: 100, yMm: 150},
            {...manual("a", "ألف"), xMm: 10, yMm: 10},
        ));
        expect(popupFields(popup).map(field => field.labels?.[0]?.textContent)).toEqual(["ياء", "ألف"]);
    });

    test("a static text or a function asks nothing: only manual inputs have fields @TPL-110", async () => {
        const {popup} = await openPopup(templateOf(staticText("s1", "ثابت"), manual("m1", "الاسم"), fn("f1", "fullDate")));
        expect(popupFields(popup)).toHaveLength(1);
    });

    test("no manual input: no pop-up and the print starts @TPL-111 @smoke", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "fullDate")));
        await page.pressPrint();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(queryPopup()).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("the sheet is ready when `window.print` runs @TPL-111", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        let sheetsAtPrint = -1;
        page.print.mockImplementation(() => {
            sheetsAtPrint = page.sheets().length;
        });
        await page.pressPrint();

        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(sheetsAtPrint).toBe(1);
    });

    test("fields left empty: it prints, with those spaces blank @TPL-112 @smoke", async () => {
        const {popup, user, print, sheets} = await openPopup();

        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        const [sheet] = sheets();
        expect(valueOn(sheet, "m1")).toBe("");
        expect(valueOn(sheet, "m2")).toBe("");
    });

    test("one field filled, one left empty: each as it is @TPL-112", async () => {
        const {popup, user, print, sheets} = await openPopup();

        await user.type(popupFields(popup)[1], "30");
        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        const [sheet] = sheets();
        expect(valueOn(sheet, "m1")).toBe("");
        expect(valueOn(sheet, "m2")).toBe("30");
    });

    test("the pop-up is gone from the printed page once it's confirmed @TPL-112", async () => {
        const {popup, user, print} = await openPopup();

        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());
    });

    test.each([
        ["Cancel", async (popup: HTMLElement, user: { click: (element: Element) => Promise<void>; keyboard: (keys: string) => Promise<void> }) => user.click(cancelButton(popup))],
        ["Esc", async (_popup: HTMLElement, user: { click: (element: Element) => Promise<void>; keyboard: (keys: string) => Promise<void> }) => user.keyboard("{Escape}")],
    ])("%s: nothing prints; opening it again shows it empty @TPL-113 @smoke", async (_name, leave) => {
        const {popup, user, print, printRoot, pressPrint} = await openPopup();
        await user.type(popupFields(popup)[0], "أحمد");

        await leave(popup, user);

        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());
        await settled();
        expect(print).not.toHaveBeenCalled();
        expect(printRoot()).toBeNull();

        await pressPrint();
        const again = await findPopup();
        for (const field of popupFields(again)) expect(field).toHaveValue("");
    });

    test("200 characters pass and print; a 201st can't be typed @TPL-114", async () => {
        const {popup, user, print, sheets} = await openPopup(templateOf(manual("m1", "الاسم")));
        const [field] = popupFields(popup);

        await fillIn(user, field, "أ".repeat(200));
        expect(field).toHaveValue("أ".repeat(200));
        await user.type(field, "ب");
        expect(field).toHaveValue("أ".repeat(200));

        await user.click(confirmButton(popup));
        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        expect(valueOn(sheets()[0], "m1")).toBe("أ".repeat(200));
    });

    test("pasting 201 characters keeps 200 @TPL-114", async () => {
        const {popup, user} = await openPopup(templateOf(manual("m1", "الاسم")));
        const [field] = popupFields(popup);

        await user.click(field);
        await user.paste("ب".repeat(201));

        expect(field).toHaveValue("ب".repeat(200));
    });

    test.each([
        ["\\n", "سطر أول\nسطر ثان"],
        ["\\r\\n", "سطر أول\r\nسطر ثان"],
        ["several", "سطر أول\n\n\r\nسطر ثان"],
    ])("a pasted line break (%s) becomes one space @TPL-114 @smoke", async (_name, pasted) => {
        const {popup, user} = await openPopup(templateOf(manual("m1", "الاسم")));
        const [field] = popupFields(popup);

        await user.click(field);
        await user.paste(pasted);

        expect(field).toHaveValue("سطر أول سطر ثان");
    });

    test("a paste goes in at the selection, within the limit @TPL-114", async () => {
        const {popup, user} = await openPopup(templateOf(manual("m1", "الاسم")));
        const [field] = popupFields(popup);
        await user.type(field, "abcd");

        field.setSelectionRange(1, 3);
        await user.paste("x\ny");
        expect(field).toHaveValue("ax yd");

        await fillIn(user, field, "z".repeat(198));
        field.setSelectionRange(198, 198);
        await user.paste("1\n234");
        expect(field).toHaveValue(`${"z".repeat(198)}1 `);
    });

    test("values typed and printed: Print again shows the fields empty, and nothing was stored or sent @TPL-115 @smoke", async () => {
        const setItem = vi.spyOn(Storage.prototype, "setItem");
        const {popup, user, print, finishPrint, pressPrint} = await openPopup();
        const requests = recordRequests();
        await user.type(popupFields(popup)[0], "أحمد");
        await user.click(confirmButton(popup));
        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        finishPrint();

        await pressPrint();
        const again = await findPopup();

        for (const field of popupFields(again)) expect(field).toHaveValue("");
        expect(JSON.stringify(setItem.mock.calls)).not.toContain("أحمد");
        for (const storage of [localStorage, sessionStorage]) {
            for (let i = 0; i < storage.length; i++) expect(storage.getItem(storage.key(i)!)).not.toContain("أحمد");
        }
        expect(requests.writes()).toEqual([]);
        expect(JSON.stringify(requests.requests)).not.toContain("أحمد");
    });

    test("confirm pressed twice quickly: `window.print` is called once @TPL-116", async () => {
        const {popup, user, print} = await openPopup();

        await user.dblClick(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        await settled();
        expect(print).toHaveBeenCalledTimes(1);
    });

    test("Enter pressed twice: `window.print` is called once @TPL-116", async () => {
        const {popup, user, print} = await openPopup();

        await user.click(popupFields(popup)[0]);
        await user.keyboard("{Enter}{Enter}");

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        await settled();
        expect(print).toHaveBeenCalledTimes(1);
    });
});

describe("the pop-up's edges @area:prescription", () => {
    test("the 100% hint shows in the pop-up, before the fields @TPL-306 @smoke", async () => {
        const {popup} = await openPopup();

        const hint = within(popup).getByText(HINT);
        const [first] = popupFields(popup);
        expect(hint.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test("its title is «طباعة الروشتة» and its buttons Cancel, then Print @TPL-306", async () => {
        const {popup} = await openPopup();

        expect(within(popup).getByRole("heading", {name: POPUP_TITLE})).toBeInTheDocument();
        expect(within(popup).getAllByRole("button").map(button => button.textContent)).toEqual(["إلغاء", "طباعة"]);
    });

    test("in English: its title, hint and buttons @TPL-306", async () => {
        const page = await openWithTemplate(NAME_AND_AGE(), {lang: "en"});
        await page.pressPrint();
        const popup = await screen.findByRole("dialog", {name: "Print the prescription"});

        expect(within(popup).getByText("Print at 100%, without \"Fit to page\".")).toBeInTheDocument();
        expect(within(popup).getAllByRole("button").map(button => button.textContent)).toEqual(["Cancel", "Print"]);
    });

    test("a click outside: it stays, with the values @TPL-308", async () => {
        const {popup, user, print} = await openPopup();
        await user.type(popupFields(popup)[0], "أحمد");

        await clickOutside(user, popup);

        await expectStillOpen(popup);
        expect(popupFields(popup)[0]).toHaveValue("أحمد");
        expect(print).not.toHaveBeenCalled();
    });

    test("Enter in a field confirms the print, same as the button @TPL-310 @smoke", async () => {
        const {popup, user, print, sheets} = await openPopup();

        await user.type(popupFields(popup)[1], "30{Enter}");

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        expect(valueOn(sheets()[0], "m2")).toBe("30");
    });

    test("49 manual inputs: all show in order, in a scrolling content, with the buttons outside it @TPL-311", async () => {
        const inputs = Array.from({length: 49}, (_, i) => manual(`m${i + 1}`, `حقل ${i + 1}`));
        const {popup} = await openPopup(templateOf(...inputs));

        const fields = popupFields(popup);
        expect(fields.map(field => field.labels?.[0]?.textContent)).toEqual(inputs.map(input => input.name));
        const content = fields[0].closest(".MuiDialogContent-root");
        expect(content).not.toBeNull();
        for (const field of fields) expect(content).toContainElement(field);
        for (const button of within(popup).getAllByRole("button")) {
            expect(content).not.toContainElement(button);
            expect(button.closest(".MuiDialogActions-root")).not.toBeNull();
        }
        // The same form holds both (`DialogForm`), so Enter still confirms
        expect(fields[0].closest("form")).toBe(confirmButton(popup).closest("form"));
    });

    test.each(["ar", "en"] as const)("in the %s UI a field's text keeps its own direction, and so does its label @TPL-312", async lang => {
        const page = await openWithTemplate(templateOf(manual("m1", "Patient name"), manual("m2", "الاسم")), {lang});
        await page.pressPrint();
        const popup = await screen.findByRole("dialog");

        const fields = popupFields(popup);
        for (const field of fields) expect(field).toHaveAttribute("dir", "auto");
        expect(fields.map(field => field.labels?.[0]?.querySelector("bdi")?.textContent)).toEqual(["Patient name", "الاسم"]);
    });

    test("spaces only print blank; spaces around a value are trimmed @TPL-314", async () => {
        const {popup, user, print, sheets} = await openPopup();
        const [name, age] = popupFields(popup);

        await fillIn(user, name, "   ");
        await fillIn(user, age, "  30  ");
        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        expect(valueOn(sheets()[0], "m1")).toBe("");
        expect(valueOn(sheets()[0], "m2")).toBe("30");
    });

    test("spaces in the middle of a value stay, and the field keeps them until the confirm @TPL-314", async () => {
        const {popup, user, print, sheets} = await openPopup();
        const [name] = popupFields(popup);

        await user.type(name, " أحمد  علي ");
        expect(name).toHaveValue(" أحمد  علي ");
        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        expect(valueOn(sheets()[0], "m1")).toBe("أحمد  علي");
    });

    test("the template changed after the pop-up opened: the copy read at the click prints, and confirming sends no request @TPL-315", async () => {
        const {popup, user, print, sheets} = await openPopup(templateOf(manual("old", "القديم")));
        const requests = recordRequests();
        templateNowIs(templateOf(manual("new", "الجديد")));

        await user.type(popupFields(popup)[0], "قيمة");
        await user.click(confirmButton(popup));

        await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
        await pastExitTransition();
        expect(requests.requests).toEqual([]);
        const [sheet] = sheets();
        expect(valueOn(sheet, "old")).toBe("قيمة");
        expect(sheet.querySelector('[data-item-id="new"]')).toBeNull();
    });
});
