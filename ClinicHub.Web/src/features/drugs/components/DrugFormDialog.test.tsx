import {describe, expect, test, vi} from "vitest";
import {useState} from "react";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    api,
    choose,
    clickOutside,
    expectStillOpen,
    fillIn,
    findToast,
    holdTimers,
    isRed,
    problem,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import type {Drug, SaveDrug} from "../types.ts";
import type {TaperStep} from "../../dosing/types.ts";
import {DrugFormDialog} from "./DrugFormDialog.tsx";
import {stepRow} from "../../../test/pages/dosing.ts";

// The drug dialog: docs/features/drugs/business.md "إضافة دواء", "الرسائل", tech.md "Frontend" (DrugFormDialog) and
// "API"; error messages: docs/tech/overview.md "Data fetching" (errors.<code>), ar.ts / en.ts.

/** Answers POST/PUT /drugs as the API does: the saved drug (201 for a create). */
const saveHandlers = () => [
    http.post(api("/drugs"), async ({request}) => HttpResponse.json({id: 501, ...(await request.json() as SaveDrug)}, {status: 201})),
    http.put(api("/drugs/:id"), async ({request, params}) => HttpResponse.json({id: Number(params.id), ...(await request.json() as SaveDrug)})),
];

const renderDialog = async (drug: Drug | null = null, lang: "ar" | "en" = "ar") => {
    const onClose = vi.fn();
    const rendered = await renderWithProviders(<DrugFormDialog open drug={drug} onClose={onClose}/>, {lang});
    return {...rendered, onClose};
};

const nameField = (label = "الاسم") => screen.getByRole("textbox", {name: label});
const combo = (name: string) => screen.getByRole("combobox", {name});
const number = (name: string) => screen.getByRole("spinbutton", {name});
// Text is pasted (fillIn): typing re-renders the whole form per key (slow), and the keystrokes are not what these cases test

describe("drug dialog: opening and the name @area:catalog", () => {
    test("new drug: title «دواء جديد», the focus in the name, every field empty @DRUG-062", async () => {
        await renderDialog();
        expect(screen.getByRole("heading", {name: "دواء جديد"})).toBeInTheDocument();
        expect(nameField()).toHaveFocus();
        expect(nameField()).toHaveValue("");
        expect(screen.getByRole("textbox", {name: "الوصف"})).toHaveValue("");
        expect(number("الجرعة")).toHaveValue(null);
        for (const select of ["الوحدة", "عدد المرات", "الفترة"]) expect(combo(select)).toHaveTextContent(/^\u200b?$/);
        for (const eye of ["اليمنى", "اليسرى", "العينين", "بدون عين"])
            expect(screen.getByRole("button", {name: eye})).toHaveAttribute("aria-pressed", "false");
    });

    test("in English the title reads \"New drug\" @DRUG-062", async () => {
        await renderDialog(null, "en");
        expect(screen.getByRole("heading", {name: "New drug"})).toBeInTheDocument();
        expect(nameField("Name")).toHaveFocus();
    });

    test("an empty or spaces-only name: red with «الاسم مطلوب.» under it, no request @DRUG-063 @smoke", async () => {
        const recorded = recordRequests();
        const {user} = await renderDialog();
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(nameField())).toBe(true);
        expect(nameField()).toHaveAccessibleDescription("الاسم مطلوب.");
        await user.type(nameField(), "   ");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(nameField())).toBe(true);
        expect(screen.getByText("الاسم مطلوب.")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("in English the empty name reads \"Name is required.\" @DRUG-063", async () => {
        const {user} = await renderDialog(null, "en");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(nameField("Name")).toHaveAccessibleDescription("Name is required.");
    });

    test("the name stops at 256 characters @DRUG-064", async () => {
        const {user} = await renderDialog();
        await user.click(nameField());
        await user.paste("a".repeat(300));
        expect(nameField()).toHaveValue("a".repeat(256));
        await user.type(nameField(), "b");
        expect(nameField()).toHaveValue("a".repeat(256));
    });
});

describe("drug dialog: API refusals as toasts @area:catalog", () => {
    const refuse = async (code: string, field: string, lang: "ar" | "en" = "ar") => {
        server.use(http.post(api("/drugs"), () => problem(400, code, {errors: [{code, field}]})));
        const {user, onClose} = await renderDialog(null, lang);
        await fillIn(user, nameField(lang === "ar" ? "الاسم" : "Name"), "Tobradex");
        await user.click(screen.getByRole("button", {name: lang === "ar" ? "حفظ" : "Save"}));
        return {toast: await findToast(), onClose};
    };

    test("`nameInvalid`: «الاسم يحتوي على رموز غير مسموح بها.» and the dialog stays open @DRUG-031", async () => {
        const {toast, onClose} = await refuse("nameInvalid", "name");
        expect(toast).toBe("الاسم يحتوي على رموز غير مسموح بها.");
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(nameField()).toHaveValue("Tobradex");
    });

    test("`nameInvalid` in English @DRUG-031", async () => {
        expect((await refuse("nameInvalid", "name", "en")).toast).toBe("The name contains characters that aren't allowed.");
    });

    test("`nameTooLong`: «الاسم طويل جدًا.» / \"Name is too long.\" @DRUG-032", async () => {
        expect((await refuse("nameTooLong", "name")).toast).toBe("الاسم طويل جدًا.");
    });

    test("`nameTooLong` in English @DRUG-032", async () => {
        expect((await refuse("nameTooLong", "name", "en")).toast).toBe("Name is too long.");
    });

    test("`invalidText`: «النص يحتوي على رموز غير مسموح بها.» @DRUG-033", async () => {
        expect((await refuse("invalidText", "description")).toast).toBe("النص يحتوي على رموز غير مسموح بها.");
    });

    test("`invalidText` in English @DRUG-033", async () => {
        expect((await refuse("invalidText", "description", "en")).toast).toBe("The text contains characters that aren't allowed.");
    });

    test("`invalidDosing` from the API: «بعض بيانات الجرعة ناقصة أو غير صحيحة.» @DOSE-060", async () => {
        const {toast, onClose} = await refuse("invalidDosing", "defaultDosing");
        expect(toast).toBe("بعض بيانات الجرعة ناقصة أو غير صحيحة.");
        expect(onClose).not.toHaveBeenCalled();
    });

    test("`invalidDosing` in English: \"Some dosing values are missing or invalid.\" @DOSE-060", async () => {
        expect((await refuse("invalidDosing", "defaultDosing", "en")).toast).toBe("Some dosing values are missing or invalid.");
    });
});

describe("drug dialog: the default dosing @area:catalog", () => {
    test("«مرات في اليوم» without the number: the field turns red and nothing is saved @DRUG-065", async () => {
        const recorded = recordRequests();
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(number("العدد"))).toBe(true);
        expect(recorded.writes()).toEqual([]);
        expect(onClose).not.toHaveBeenCalled();
    });

    test("no field is red before the first save attempt @DOSE-085", async () => {
        const {user} = await renderDialog();
        await user.type(number("الجرعة"), "1500");
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await choose(user, combo("الفترة"), "أيام");
        for (const field of [number("الجرعة"), combo("الوحدة"), number("العدد"), number("المدة")]) expect(isRed(field)).toBe(false);
        await fillIn(user, nameField(), "Tobradex");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(number("الجرعة"))).toBe(true);
    });

    test("after a save attempt exactly the invalid fields are red, and fixing one removes its red @DOSE-084", async () => {
        const recorded = recordRequests();
        const {user} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await user.type(number("الجرعة"), "1500");
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await choose(user, combo("الفترة"), "أيام");
        await user.click(screen.getByRole("button", {name: "حفظ"}));

        // Amount out of range, amount without unit, times missing, duration missing
        expect(isRed(number("الجرعة"))).toBe(true);
        expect(isRed(combo("الوحدة"))).toBe(true);
        expect(isRed(number("العدد"))).toBe(true);
        expect(isRed(number("المدة"))).toBe(true);
        expect(isRed(combo("عدد المرات"))).toBe(false);
        expect(isRed(combo("الفترة"))).toBe(false);
        expect(isRed(nameField())).toBe(false);

        await user.clear(number("الجرعة"));
        await user.type(number("الجرعة"), "2");
        expect(isRed(number("الجرعة"))).toBe(false);
        expect(isRed(combo("الوحدة"))).toBe(true);
        await choose(user, combo("الوحدة"), "نقطة");
        expect(isRed(combo("الوحدة"))).toBe(false);
        await user.type(number("العدد"), "25");
        expect(isRed(number("العدد"))).toBe(true);
        await user.clear(number("العدد"));
        await user.type(number("العدد"), "4");
        expect(isRed(number("العدد"))).toBe(false);
        await user.type(number("المدة"), "5");
        expect(isRed(number("المدة"))).toBe(false);

        // The custom text is the last kind of field that can be red
        await choose(user, combo("عدد المرات"), "نص مخصص");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        const text = screen.getByRole("textbox", {name: "نص عدد المرات"});
        expect(isRed(text)).toBe(true);
        await fillIn(user, text, "صباحًا ومساءً");
        expect(isRed(text)).toBe(false);
        expect(recorded.writes()).toEqual([]);
    });

    test("only empty dosing fields: the request sends `defaultDosing: null` @DRUG-069", async () => {
        server.use(...saveHandlers());
        const recorded = recordRequests();
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        // A unit chosen then cleared again leaves an empty dosing behind
        await choose(user, combo("الوحدة"), "نقطة");
        await choose(user, combo("الوحدة"), "—");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(recorded.writes()).toEqual([
            expect.objectContaining({method: "POST", path: "/drugs", body: {name: "Tobradex", description: null, defaultDosing: null}}),
        ]);
    });

    test("while saving: «جارٍ الحفظ…» and Save / Cancel disabled @DRUG-070", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => (answer = resolve));
        server.use(http.post(api("/drugs"), async ({request}) => {
            const body = await request.json() as SaveDrug;
            await answered;
            return HttpResponse.json({id: 501, ...body}, {status: 201});
        }));
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        const saving = await screen.findByRole("button", {name: "جارٍ الحفظ…"});
        expect(saving).toBeDisabled();
        expect(screen.getByRole("button", {name: "إلغاء"})).toBeDisabled();
        answer();
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    test("while saving in English: \"Saving…\" @DRUG-070", async () => {
        server.use(http.post(api("/drugs"), () => new Promise<never>(() => undefined)));
        const {user} = await renderDialog(null, "en");
        await fillIn(user, nameField("Name"), "Tobradex");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await screen.findByRole("button", {name: "Saving…"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
    });
});

describe("drug dialog: tapering steps on save @area:catalog", () => {
    const week = {durationUnit: "weeks", durationValue: 1} as const;

    test("a step with a missing or out-of-range number: that step's field is red and nothing is saved @TAPER-071", async () => {
        const recorded = recordRequests();
        const steps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 3, ...week}];
        const {user, onClose} = await renderDialog(aDrug({name: "Pred Forte", defaultDosing: {doseUnit: "drop", taperSteps: steps}}));
        const field = (step: number, name: string) => within(stepRow(step)).getByRole("spinbutton", {name});
        await user.clear(field(2, "العدد"));
        await user.type(field(2, "العدد"), "30");
        await user.clear(field(1, "المدة"));
        await user.click(screen.getByRole("button", {name: "حفظ"}));

        expect(isRed(field(2, "العدد"))).toBe(true);
        expect(isRed(field(1, "المدة"))).toBe(true);
        // The other fields stay normal
        expect(isRed(field(1, "العدد"))).toBe(false);
        expect(isRed(field(2, "المدة"))).toBe(false);
        expect(recorded.writes()).toEqual([]);
        expect(onClose).not.toHaveBeenCalled();
    });

    test("an open-ended period on a step that is not last: red, the hint shown, save blocked @TAPER-070", async () => {
        const recorded = recordRequests();
        // As it would come from a stale form: «بصفة مستمرة» on step 1 of 2
        const steps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, durationUnit: "continuous"}, {frequency: "daily", frequencyValue: 3, ...week}];
        const {user, onClose} = await renderDialog(aDrug({name: "Pred Forte", defaultDosing: {doseUnit: "drop", taperSteps: steps}}));
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        const period = within(stepRow(1)).getByRole("combobox", {name: "الفترة"});
        expect(period).toHaveTextContent("بصفة مستمرة");
        expect(isRed(period)).toBe(true);
        expect(screen.getByText("المرحلة الأخيرة فقط يمكن أن تكون «بصفة مستمرة» أو «حتى الزيارة القادمة».")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("drug dialog: locked once saved, fresh on each opening @area:catalog", () => {
    test("a save that succeeded keeps the form locked while the dialog closes: Save disabled, Enter or a submit sends nothing more @UX-040",
        async () => {
            server.use(...saveHandlers());
            const recorded = recordRequests();
            // Still rendered open after onClose: as during the closing animation
            const {user, onClose} = await renderDialog();
            await fillIn(user, nameField(), "Tobradex");
            await user.click(screen.getByRole("button", {name: "حفظ"}));
            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

            const save = screen.getByRole("button", {name: "حفظ"});
            expect(save).toBeDisabled();
            await user.type(nameField(), "{Enter}");
            // Any other submit of the form (a click on a disabled button does nothing in a browser)
            await act(async () => fireEvent.submit(save.closest("form")!));
            expect(recorded.writes()).toHaveLength(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

    test("while the save is in flight Esc and a click outside don't close it (typed name kept); after the answer it closes @UX-040",
        async () => {
            let answer: () => void = () => undefined;
            const answered = new Promise<void>(resolve => (answer = resolve));
            server.use(http.post(api("/drugs"), async ({request}) => {
                const body = await request.json() as SaveDrug;
                await answered;
                return HttpResponse.json({id: 501, ...body}, {status: 201});
            }));
            const {user, onClose} = await renderDialog();
            const dialog = screen.getByRole("dialog");
            await fillIn(user, nameField(), "Tobradex");
            await user.click(screen.getByRole("button", {name: "حفظ"}));
            expect(await screen.findByRole("button", {name: "جارٍ الحفظ…"})).toBeDisabled();
            await user.keyboard("{Escape}");
            await clickOutside(user, dialog);
            await expectStillOpen(dialog);
            expect(onClose).not.toHaveBeenCalled();
            expect(nameField()).toHaveValue("Tobradex");

            answer();
            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        });

    test("Esc closes it again once a save failed (no save in flight) @UX-040", async () => {
        server.use(http.post(api("/drugs"), () => problem(500, "internalError")));
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await findToast();
        await waitFor(() => expect(screen.getByRole("button", {name: "حفظ"})).toBeEnabled());
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("a save that failed unlocks at once: Save enabled, and saving again sends the drug again @UX-040", async () => {
        let posts = 0;
        server.use(http.post(api("/drugs"), async ({request}) => ++posts === 1
            ? problem(500, "internalError")
            : HttpResponse.json({id: 501, ...(await request.json() as SaveDrug)}, {status: 201})));
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await findToast();
        await waitFor(() => expect(screen.getByRole("button", {name: "حفظ"})).toBeEnabled());
        expect(onClose).not.toHaveBeenCalled();

        await user.type(nameField(), "{Enter}");
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(posts).toBe(2);
    });

    test("reopened during its closing animation (after a save, or a Cancel with text typed): it starts empty and unlocked @DRUG-104",
        async () => {
            server.use(...saveHandlers());
            let closed: () => void = () => undefined;
            const Page = () => {
                const [open, setOpen] = useState(false);
                return (
                    <>
                        <button onClick={() => setOpen(true)}>إضافة دواء</button>
                        <DrugFormDialog open={open} drug={null} onClose={() => {
                            setOpen(false);
                            closed();
                        }}/>
                    </>
                );
            };
            const {user} = await renderWithProviders(<Page/>, {lang: "ar"});
            // While the dialog fades out, the page behind it is still aria-hidden
            const reopen = () => user.click(screen.getByRole("button", {name: "إضافة دواء", hidden: true}));
            const field = () => within(screen.getByRole("dialog", {hidden: true})).getByRole("textbox", {name: "الاسم", hidden: true});
            const save = () => within(screen.getByRole("dialog", {hidden: true})).getByRole("button", {name: "حفظ", hidden: true});

            // Saved: the closing animation is held (its timers don't run) while the dialog is reopened
            await reopen();
            await fillIn(user, field(), "Tobradex");
            const timers = holdTimers();
            const closing = new Promise<void>(resolve => (closed = resolve));
            await user.click(save());
            await act(async () => closing);
            const dialog = screen.getByRole("dialog", {hidden: true});
            await reopen();
            expect(screen.getByRole("dialog", {hidden: true}), "the same, still closing dialog").toBe(dialog);
            expect(field()).toHaveValue("");
            expect(save()).toBeEnabled();

            // Cancelled with text typed
            await fillIn(user, field(), "Typed then cancelled");
            await user.click(within(dialog).getByRole("button", {name: "إلغاء", hidden: true}));
            await reopen();
            expect(screen.getByRole("dialog", {hidden: true})).toBe(dialog);
            expect(field()).toHaveValue("");
            await timers.release();
        });
});
