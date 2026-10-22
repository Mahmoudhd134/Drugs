import {describe, expect, test, vi} from "vitest";
import {useState} from "react";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    api,
    choose,
    clickOutside,
    drugCategoriesHandler,
    expectStillOpen,
    fillIn,
    findToast,
    holdTimers,
    isRed,
    optionsOf,
    pastExitTransition,
    problem,
    recordRequests,
    renderWithProviders,
    server,
    toastTexts,
} from "../../../test";
import type {Drug, SaveDrug} from "../types.ts";
import {EYE} from "../../../test/data.ts";
import type {TaperStep} from "../../dosing/types.ts";
import {DrugFormDialog} from "./DrugFormDialog.tsx";
import {stepRow} from "../../../test/pages/dosing.ts";
import {
    categoryField,
    DIALOG_CATEGORIES,
    ingredientsField,
    pickCategory,
    subCategoryField,
} from "../../../test/pages/drugDialog.ts";

// The drug dialog: docs/features/drugs/business.md "إضافة دواء", "الرسائل", tech.md "Frontend" (DrugFormDialog) and
// "API"; error messages: docs/tech/overview.md "Data fetching" (errors.<code>), ar.ts / en.ts.

/** Answers POST/PUT /drugs as the API does: the saved drug (201 for a create). */
const saveHandlers = () => [
    http.post(api("/drugs"), async ({request}) => HttpResponse.json({id: 501, ...(await request.json() as SaveDrug)}, {status: 201})),
    http.put(api("/drugs/:id"), async ({request, params}) => HttpResponse.json({id: Number(params.id), ...(await request.json() as SaveDrug)})),
];

const renderDialog = async (drug: Drug | null = null, lang: "ar" | "en" = "ar") => {
    // The dialog reads the categories on open (M1.7b contract "Own-drug dialog")
    server.use(drugCategoriesHandler(DIALOG_CATEGORIES));
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

// Decision D22 (design M1.7 D9, drugs tech "API errors show on their inputs"): the API's refusals show under their
// field (name, description) or under the dosing, never as a toast; the dialog stays open with the typed values
describe("drug dialog: API refusals on their fields @area:catalog", () => {
    const refuse = async (code: string, field: string, lang: "ar" | "en" = "ar") => {
        server.use(http.post(api("/drugs"), () => problem(400, code, {errors: [{code, field}]})));
        const {user, onClose} = await renderDialog(null, lang);
        await fillIn(user, nameField(lang === "ar" ? "الاسم" : "Name"), "Tobradex");
        await pickCategory(user, {lang});
        await user.click(screen.getByRole("button", {name: lang === "ar" ? "حفظ" : "Save"}));
        return {onClose};
    };
    /** The field's message (its accessible description), red, no toast, the dialog open. */
    const expectOnField = async (field: () => HTMLElement, message: string) => {
        await waitFor(() => expect(field()).toHaveAccessibleDescription(message));
        expect(isRed(field())).toBe(true);
        expect(toastTexts()).toEqual([]);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    };
    const descriptionField = (lang: "ar" | "en" = "ar") => screen.getByRole("textbox", {name: lang === "ar" ? "الوصف" : "Description"});

    test("`nameInvalid`: «الاسم يحتوي على رموز غير مسموح بها.» under the name and the dialog stays open @DRUG-031", async () => {
        const {onClose} = await refuse("nameInvalid", "name");
        await expectOnField(() => nameField(), "الاسم يحتوي على رموز غير مسموح بها.");
        expect(onClose).not.toHaveBeenCalled();
        expect(nameField()).toHaveValue("Tobradex");
    });

    test("`nameInvalid` in English @DRUG-031", async () => {
        await refuse("nameInvalid", "name", "en");
        await expectOnField(() => nameField("Name"), "The name contains characters that aren't allowed.");
    });

    test("`nameTooLong`: «الاسم طويل جدًا.» under the name @DRUG-032", async () => {
        const {onClose} = await refuse("nameTooLong", "name");
        await expectOnField(() => nameField(), "الاسم طويل جدًا.");
        expect(onClose).not.toHaveBeenCalled();
    });

    test("`nameTooLong` in English @DRUG-032", async () => {
        await refuse("nameTooLong", "name", "en");
        await expectOnField(() => nameField("Name"), "Name is too long.");
    });

    test("`invalidText`: «النص يحتوي على رموز غير مسموح بها.» under the description @DRUG-033", async () => {
        const {onClose} = await refuse("invalidText", "description");
        await expectOnField(() => descriptionField(), "النص يحتوي على رموز غير مسموح بها.");
        expect(isRed(nameField())).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });

    test("`invalidText` in English @DRUG-033", async () => {
        await refuse("invalidText", "description", "en");
        await expectOnField(() => descriptionField("en"), "The text contains characters that aren't allowed.");
    });

    test("`invalidDosing` from the API: «بعض بيانات الجرعة ناقصة أو غير صحيحة.» under the dosing, no toast @DOSE-060", async () => {
        const {onClose} = await refuse("invalidDosing", "defaultDosing");
        expect(await screen.findByRole("alert")).toHaveTextContent(/^بعض بيانات الجرعة ناقصة أو غير صحيحة\.$/);
        expect(toastTexts()).toEqual([]);
        expect(isRed(nameField())).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("`invalidDosing` in English: \"Some dosing values are missing or invalid.\" @DOSE-060", async () => {
        await refuse("invalidDosing", "defaultDosing", "en");
        expect(await screen.findByRole("alert")).toHaveTextContent(/^Some dosing values are missing or invalid\.$/);
        expect(toastTexts()).toEqual([]);
    });
});

describe("drug dialog: the default dosing @area:catalog", () => {
    test("«مرات في اليوم» without the number: the field turns red and nothing is saved @DRUG-065", async () => {
        const recorded = recordRequests();
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        // The category is required too (M1.7b): picked, so the dosing rule is the one that stops the save
        await pickCategory(user);
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
        await pickCategory(user);
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
        await pickCategory(user);
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
        await pickCategory(user);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(recorded.writes()).toEqual([
            expect.objectContaining({
                method: "POST", path: "/drugs",
                body: {name: "Tobradex", activeIngredients: null, description: null, defaultDosing: null, categoryId: EYE.id, subCategoryId: null},
            }),
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
        await pickCategory(user);
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
        await pickCategory(user, {lang: "en"});
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
            await pickCategory(user);
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
            await pickCategory(user);
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
        await pickCategory(user);
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
        await pickCategory(user);
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
            // The dialog reads the categories on open (M1.7b contract "Own-drug dialog")
            server.use(drugCategoriesHandler(DIALOG_CATEGORIES), ...saveHandlers());
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
            await pickCategory(user, {scope: screen.getByRole("dialog", {hidden: true}), hidden: true});
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

// The category fields (design M1.7 D3, D9; M1.7b contract "Own-drug dialog"; texts: contract § 3.5)
describe("drug dialog: active ingredients, category and subcategory @area:catalog", () => {
    test("saved without a category: the category field turns red with «التصنيف مطلوب.» and no request is sent @CAT-049", async () => {
        const recorded = recordRequests();
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(isRed(categoryField())).toBe(true));
        expect(screen.getByText("التصنيف مطلوب.")).toBeInTheDocument();
        expect(isRed(nameField())).toBe(false);
        expect(recorded.writes()).toEqual([]);
        expect(onClose).not.toHaveBeenCalled();

        // Picking one lets the save through
        server.use(...saveHandlers());
        await pickCategory(user);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(recorded.writes()).toEqual([expect.objectContaining({method: "POST", path: "/drugs", body: expect.objectContaining({categoryId: EYE.id})})]);
    });

    test("in English the missing category reads \"Category is required.\" @CAT-049", async () => {
        const recorded = recordRequests();
        const {user} = await renderDialog(null, "en");
        await fillIn(user, nameField("Name"), "Tobradex");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await screen.findByText("Category is required.")).toBeInTheDocument();
        expect(isRed(categoryField(document.body, "en"))).toBe(true);
        expect(recorded.writes()).toEqual([]);
    });

    test("a category picked: the subcategory list holds only its subcategories, in Arabic, after «بدون تصنيف فرعي»; another category clears the subcategory @CAT-050",
        async () => {
            server.use(...saveHandlers());
            const recorded = recordRequests();
            const {user, onClose} = await renderDialog();
            expect(await optionsOf(user, categoryField())).toEqual(["العيون", "مضادات العدوى", "أخرى"]);
            await pickCategory(user, {category: "العيون"});
            expect(await optionsOf(user, subCategoryField())).toEqual(["بدون تصنيف فرعي", "المياه الزرقاء", "مضادات العدوى للعين"]);
            await choose(user, subCategoryField(), "المياه الزرقاء");
            expect(subCategoryField()).toHaveTextContent("المياه الزرقاء");

            await choose(user, categoryField(), "مضادات العدوى");
            expect(subCategoryField()).not.toHaveTextContent("المياه الزرقاء");
            expect(await optionsOf(user, subCategoryField())).toEqual(["بدون تصنيف فرعي", "البنسلينات", "الكينولونات"]);

            // Saved now: the subcategory cleared by the change is sent as none
            await fillIn(user, nameField(), "Tobradex");
            await user.click(screen.getByRole("button", {name: "حفظ"}));
            await waitFor(() => expect(onClose).toHaveBeenCalled());
            expect(recorded.writes()[0].body).toEqual(expect.objectContaining({categoryId: 2, subCategoryId: null}));
        });

    test("in English the categories and subcategories show their English names @CAT-050", async () => {
        const {user} = await renderDialog(null, "en");
        expect(await optionsOf(user, categoryField(document.body, "en"))).toEqual(["Anti-infectives", "Eye", "Other"]);
        await pickCategory(user, {lang: "en", category: "Eye"});
        expect(await optionsOf(user, subCategoryField(document.body, "en"))).toEqual(["No subcategory", "Eye anti-infectives", "Glaucoma"]);
    });

    test("a subcategory picked is sent with its category @CAT-050", async () => {
        server.use(...saveHandlers());
        const recorded = recordRequests();
        const {user, onClose} = await renderDialog();
        await fillIn(user, nameField(), "Tobradex");
        await pickCategory(user, {category: "مضادات العدوى", subCategory: "البنسلينات"});
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(recorded.writes()[0].body).toEqual(expect.objectContaining({categoryId: 2, subCategoryId: 21}));
    });

    test("`subCategoryNotFound` (deleted meanwhile): the message on the subcategory field, and the categories are read again @CAT-052",
        async () => {
            const recorded = recordRequests();
            server.use(http.post(api("/drugs"), () =>
                problem(400, "subCategoryNotFound", {errors: [{code: "subCategoryNotFound", field: "subCategoryId"}]})));
            const {user, onClose} = await renderDialog();
            await fillIn(user, nameField(), "Tobradex");
            await pickCategory(user, {category: "مضادات العدوى", subCategory: "الكينولونات"});
            const reads = () => recorded.requests.filter(r => r.method === "GET" && r.path === "/drug-categories").length;
            const before = reads();
            // The subcategory is gone from the next answer
            server.use(drugCategoriesHandler(DIALOG_CATEGORIES.map(c => c.id === 2 ? {...c, subCategories: c.subCategories.slice(0, 1)} : c)));
            await user.click(screen.getByRole("button", {name: "حفظ"}));

            expect(await screen.findByText("هذا التصنيف الفرعي غير موجود في التصنيف المختار.")).toBeInTheDocument();
            expect(isRed(subCategoryField())).toBe(true);
            await waitFor(() => expect(reads()).toBeGreaterThan(before));
            expect(onClose).not.toHaveBeenCalled();
            await waitFor(async () => expect(await optionsOf(user, subCategoryField())).toEqual(["بدون تصنيف فرعي", "البنسلينات"]));
        });

    // T3 W2 (design M1.7 D9 "the form reloads the categories"; contract § Own-drug dialog): once the reloaded list no
    // longer holds the subcategory, the form drops it: the field shows «بدون تصنيف فرعي» and the next save sends none
    // (the form never resends the deleted id, so the user is not stuck)
    test("`subCategoryNotFound`: after the reload the deleted subcategory is cleared and saving again sends no subcategory @CAT-052",
        async () => {
            let posts = 0;
            server.use(http.post(api("/drugs"), async ({request}) => ++posts === 1
                ? problem(400, "subCategoryNotFound", {errors: [{code: "subCategoryNotFound", field: "subCategoryId"}]})
                : HttpResponse.json({id: 501, ...(await request.json() as SaveDrug)}, {status: 201})));
            const recorded = recordRequests();
            const {user, onClose} = await renderDialog();
            await fillIn(user, nameField(), "Tobradex");
            await pickCategory(user, {category: "مضادات العدوى", subCategory: "الكينولونات"});
            // «الكينولونات» is deleted meanwhile: gone from the next answer
            server.use(drugCategoriesHandler(DIALOG_CATEGORIES.map(c => c.id === 2 ? {...c, subCategories: c.subCategories.slice(0, 1)} : c)));
            await user.click(screen.getByRole("button", {name: "حفظ"}));
            expect(await screen.findByText("هذا التصنيف الفرعي غير موجود في التصنيف المختار.")).toBeInTheDocument();
            await waitFor(async () => expect(await optionsOf(user, subCategoryField())).toEqual(["بدون تصنيف فرعي", "البنسلينات"]));
            expect(subCategoryField()).toHaveTextContent("بدون تصنيف فرعي");
            expect(categoryField()).toHaveTextContent("مضادات العدوى");

            await user.click(screen.getByRole("button", {name: "حفظ"}));
            await waitFor(() => expect(recorded.writes()).toHaveLength(2));
            expect(recorded.writes()[1].body).toEqual(expect.objectContaining({categoryId: 2, subCategoryId: null}));
            await waitFor(() => expect(onClose).toHaveBeenCalled());
        });

    test("the active ingredients input is `dir=\"auto\"` (English or Arabic text) @CAT-053", async () => {
        const {user} = await renderDialog();
        const field = ingredientsField();
        expect(field).toHaveAttribute("dir", "auto");
        await fillIn(user, field, "أموكسيسيلين");
        expect(field).toHaveAttribute("dir", "auto");
    });

    test("a category created a few seconds before is listed when the dialog opens: it reads /drug-categories again @CAT-054", async () => {
        server.use(drugCategoriesHandler(DIALOG_CATEGORIES));
        const recorded = recordRequests();
        const Page = () => {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>إضافة دواء</button>
                    <DrugFormDialog open={open} drug={null} onClose={() => setOpen(false)}/>
                </>
            );
        };
        const {user} = await renderWithProviders(<Page/>, {lang: "ar"});
        await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
        expect(await optionsOf(user, categoryField())).toEqual(["العيون", "مضادات العدوى", "أخرى"]);
        await user.click(screen.getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        // The super admin adds «الجلدية» (the list would otherwise stay fresh for 30 s)
        const dermatology = {id: 50, nameEn: "Dermatology", nameAr: "الجلدية", pinnedLast: false, subCategories: []};
        server.use(drugCategoriesHandler([...DIALOG_CATEGORIES.slice(0, 2), dermatology, DIALOG_CATEGORIES[2]]));
        await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
        await waitFor(async () => expect(await optionsOf(user, categoryField())).toContain("الجلدية"));
        expect(recorded.requests.filter(r => r.method === "GET" && r.path === "/drug-categories").length).toBeGreaterThanOrEqual(2);
    });
});

// UX-044 (ADM-292's rule, UX-040; BUG-586/588, UX-041) on the own-drug dialog with its category fields
describe("drug dialog with the category fields: locked while saving, fresh on each opening @area:ux", () => {
    test("with the save held: Esc, a backdrop click and «إلغاء» do nothing, a second Save sends nothing; reopened while closing it starts empty @UX-044",
        async () => {
            let answer: () => void = () => undefined;
            const answered = new Promise<void>(resolve => (answer = resolve));
            server.use(drugCategoriesHandler(DIALOG_CATEGORIES), http.post(api("/drugs"), async () => {
                await answered;
                return HttpResponse.json(aDrug({name: "Tobradex"}), {status: 201});
            }));
            const recorded = recordRequests();
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
            await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
            const dialog = await screen.findByRole("dialog");
            await fillIn(user, within(dialog).getByRole("textbox", {name: "الاسم"}), "Tobradex");
            await fillIn(user, ingredientsField(dialog), "TOBRAMYCIN");
            await pickCategory(user, {scope: dialog, category: "مضادات العدوى", subCategory: "البنسلينات"});
            await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
            expect(await within(dialog).findByRole("button", {name: "جارٍ الحفظ…"})).toBeDisabled();

            await user.keyboard("{Escape}");
            await clickOutside(user, dialog);
            // «إلغاء» is disabled while saving: a click on it does nothing
            await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "إلغاء"})));
            await expectStillOpen(dialog);
            await act(async () => fireEvent.click(within(dialog).getByRole("button", {name: "جارٍ الحفظ…"})));
            await act(async () => fireEvent.submit(dialog.querySelector("form")!));
            expect(recorded.writes()).toHaveLength(1);

            // Answered: closing; reopened during the closing animation, it starts empty (no category, no ingredients)
            const timers = holdTimers();
            const closing = new Promise<void>(resolve => (closed = resolve));
            answer();
            await act(async () => closing);
            await user.click(screen.getByRole("button", {name: "إضافة دواء", hidden: true}));
            const reopened = screen.getByRole("dialog", {hidden: true});
            expect(within(reopened).getByRole("textbox", {name: "الاسم", hidden: true})).toHaveValue("");
            expect(ingredientsField(reopened, "ar", true)).toHaveValue("");
            expect(categoryField(reopened, "ar", true)).not.toHaveTextContent(/العيون|مضادات العدوى|أخرى/);
            expect(within(reopened).getByRole("button", {name: "حفظ", hidden: true})).toBeEnabled();
            await timers.release();
            await pastExitTransition();
            expect(recorded.writes()).toHaveLength(1);
        });

    test("opened on an own drug: it starts from that drug's ingredients, category and subcategory @UX-044", async () => {
        await renderDialog(aDrug({name: "Tobradex", activeIngredients: "TOBRAMYCIN + DEXAMETHASONE"}));
        expect(nameField()).toHaveValue("Tobradex");
        expect(ingredientsField()).toHaveValue("TOBRAMYCIN + DEXAMETHASONE");
        await waitFor(() => expect(categoryField()).toHaveTextContent("العيون"));
        expect(subCategoryField()).toHaveTextContent("المياه الزرقاء");
    });
});
