import {describe, expect, test, vi} from "vitest";
import {screen, within} from "@testing-library/react";
import {aDrug, choose, hoverTooltip, isRed, renderWithProviders} from "../../../test";
import type {Dosing, TaperStep} from "../../dosing/types.ts";
import type {Drug} from "../../drugs/types.ts";
import {newItemKey} from "../editorItem.ts";
import {GroupItemDialog} from "./GroupItemDialog.tsx";
import {dosingPreview, stepRow} from "../../../test/pages/dosing.ts";

// The group line dosing dialog: docs/features/drug-groups/business.md "جرعة خاصة بالمجموعة", "تُحدد عند الإضافة",
// tech.md "Frontend" (GroupItemDialog, inherit mode), docs/features/tapering/business.md "القواعد" (inherited taper).

const fourTimesTwoWeeks: Dosing = {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 2};

const renderDialog = async (drug: Drug, override: Dosing = {}, lang: "ar" | "en" = "ar") => {
    const onSave = vi.fn(() => true);
    const onClose = vi.fn();
    const item = {key: newItemKey(), drug, dosing: override};
    const rendered = await renderWithProviders(<GroupItemDialog item={item} onClose={onClose} onSave={onSave}/>, {lang});
    return {...rendered, onSave, onClose, item};
};

const combo = (name: string) => screen.getByRole("combobox", {name});
const number = (name: string) => screen.getByRole("spinbutton", {name});
const askEye = () => screen.getByText("تُحدد عند الإضافة").closest("button") as HTMLElement;

describe("group line dialog: inheriting the drug's default @area:catalog", () => {
    test("✎ opens «الجرعة في هذه المجموعة» with the drug, the hint and the ⓘ «افتراضي الدواء» explanation @GRP-066", async () => {
        await renderDialog(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}));
        const title = screen.getByRole("heading", {name: /الجرعة في هذه المجموعة/});
        expect(title).toHaveTextContent("Tobradex");
        expect(screen.getByText("الحقول الفارغة تأخذ الجرعة الافتراضية للدواء.")).toBeInTheDocument();
        expect(screen.getByRole("img", {name: "«افتراضي الدواء» يعني أن القيمة تؤخذ من الجرعة الافتراضية للدواء وتتغير معها."}))
            .toBeInTheDocument();
    });

    test("in English: \"Dosing in this group\" and \"Empty fields use the drug's default dosing.\" @GRP-066", async () => {
        await renderDialog(aDrug({name: "Tobradex"}), {}, "en");
        expect(screen.getByRole("heading", {name: /Dosing in this group/})).toBeInTheDocument();
        expect(screen.getByText("Empty fields use the drug's default dosing.")).toBeInTheDocument();
        expect(screen.getByRole("img", {name: "\"Drug default\" means the value comes from the drug's default dosing and follows it if it changes."}))
            .toBeInTheDocument();
    });

    test("no override: every empty select and the dose placeholder say «افتراضي الدواء»; the preview is the drug's sentence @GRP-067", async () => {
        await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}));
        for (const select of ["الوحدة", "عدد المرات", "الفترة"]) expect(combo(select)).toHaveTextContent("افتراضي الدواء");
        expect(number("الجرعة")).toHaveAttribute("placeholder", "افتراضي الدواء");
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 4 مرات يوميًا لمدة أسبوعين$/);
    });

    test("in English the empty selects read \"Drug default\" @GRP-067", async () => {
        await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}), {}, "en");
        for (const select of ["Unit", "Frequency", "Period"]) expect(combo(select)).toHaveTextContent("Drug default");
        expect(number("Dose")).toHaveAttribute("placeholder", "Drug default");
    });

    test("overriding only the times to 6: «نقطة واحدة 6 مرات يوميًا لمدة أسبوعين», saved as that part only @GRP-068 @smoke", async () => {
        const {user, onSave, item} = await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}));
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await user.type(number("العدد"), "6");
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 6 مرات يوميًا لمدة أسبوعين$/);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(onSave).toHaveBeenCalledWith(item.key, expect.objectContaining({
            doseAmount: null, doseUnit: null, frequency: "daily", frequencyValue: 6, durationUnit: null, eye: null, taperSteps: null,
        }));
    });

    test("no override: «استخدام جرعة الدواء الافتراضية» is disabled @GRP-071", async () => {
        const {user} = await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}));
        const reset = screen.getByRole("button", {name: "استخدام جرعة الدواء الافتراضية"});
        expect(reset).toBeDisabled();
        await user.click(screen.getByRole("button", {name: "اليسرى"}));
        expect(reset).toBeEnabled();
    });

    test("in English the button reads \"Use drug default\", disabled without an override @GRP-071", async () => {
        await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}), {}, "en");
        expect(screen.getByRole("button", {name: "Use drug default"})).toBeDisabled();
    });
});

describe("group line dialog: invalid overrides @area:catalog", () => {
    test("only a dose amount (no unit): the unit turns red and the dialog stays open @GRP-074", async () => {
        const {user, onSave, onClose} = await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}));
        await user.type(number("الجرعة"), "2");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(combo("الوحدة"))).toBe(true);
        expect(isRed(number("الجرعة"))).toBe(false);
        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("times 25: the field turns red and the dialog stays open @GRP-075", async () => {
        const {user, onSave, onClose} = await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}));
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await user.type(number("العدد"), "25");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(isRed(number("العدد"))).toBe(true);
        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("group line dialog: «تُحدد عند الإضافة» @area:catalog", () => {
    test("the eye choices: اليمنى / اليسرى / العينين / بدون عين and «تُحدد عند الإضافة» with its tooltip @GRP-077", async () => {
        await renderDialog(aDrug());
        const eyes = screen.getByText("العين").nextElementSibling as HTMLElement;
        expect(within(eyes).getAllByRole("button").map(b => b.textContent)).toEqual(["اليمنى", "اليسرى", "العينين", "بدون عين", "تُحدد عند الإضافة"]);
        expect(await hoverTooltip(askEye()))
            .toBe("العين غير محددة في المجموعة: تختار اليمنى أو اليسرى أو العينين في كل مرة تضيف فيها المجموعة.");
    });

    test("in English the choice reads \"Ask when adding\" @GRP-077", async () => {
        await renderDialog(aDrug(), {}, "en");
        expect(screen.getByText("Ask when adding").closest("button")).toBeInTheDocument();
    });

    test("«تُحدد عند الإضافة» chosen: the sentence has no eye, with «العين تُحدد عند إضافة المجموعة» under it @GRP-078", async () => {
        const {user} = await renderDialog(aDrug({defaultDosing: {...fourTimesTwoWeeks, eye: "right"}}));
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة في العين اليمنى 4 مرات يوميًا لمدة أسبوعين$/);
        await user.click(askEye());
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 4 مرات يوميًا لمدة أسبوعين$/);
        expect(dosingPreview().nextElementSibling).toHaveTextContent(/^العين تُحدد عند إضافة المجموعة$/);
    });

    test("in English the hint under the preview reads \"Eye is chosen when the group is added\" @GRP-078", async () => {
        const {user} = await renderDialog(aDrug({defaultDosing: fourTimesTwoWeeks}), {}, "en");
        await user.click(screen.getByText("Ask when adding").closest("button")!);
        expect(dosingPreview("Prescription text").nextElementSibling).toHaveTextContent(/^Eye is chosen when the group is added$/);
    });
});

describe("group line dialog: the drug's taper @area:catalog", () => {
    const week = {durationUnit: "weeks", durationValue: 1} as const;
    const steps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 2, ...week}];
    const taperDrug = () => aDrug({name: "Pred Forte", defaultDosing: {doseUnit: "drop", taperSteps: steps}});

    test("a drug default with a taper and no override schedule: the notice, and the preview shows the drug's steps @TAPER-076", async () => {
        await renderDialog(taperDrug());
        expect(screen.getByText("الجرعة الافتراضية للدواء فيها تقليل تدريجي. فعّل هذا الخيار لتغييره في هذه المجموعة.")).toBeInTheDocument();
        expect(screen.getByRole("switch", {name: "تقليل تدريجي"})).not.toBeChecked();
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم مرتين يوميًا لمدة أسبوع، ثم يتوقف$/);
    });

    test("in English the notice reads \"The drug default uses a tapering schedule…\" @TAPER-076", async () => {
        await renderDialog(taperDrug(), {}, "en");
        expect(screen.getByText("The drug default uses a tapering schedule. Turn this on to change it for this group.")).toBeInTheDocument();
    });

    test("switching tapering on copies the drug's steps into the override for editing @TAPER-077", async () => {
        const {user, onSave, item} = await renderDialog(taperDrug());
        await user.click(screen.getByRole("switch", {name: "تقليل تدريجي"}));
        expect(screen.queryByText(/فعّل هذا الخيار لتغييره/)).not.toBeInTheDocument();
        for (const [n, times] of [[1, "4"], [2, "2"]] as const) {
            const row = within(stepRow(n));
            expect(row.getByRole("spinbutton", {name: "العدد"})).toHaveValue(Number(times));
            expect(row.getByRole("combobox", {name: "الفترة"})).toHaveTextContent("أسابيع");
            expect(row.getByRole("spinbutton", {name: "المدة"})).toHaveValue(1);
        }
        const second = within(stepRow(2)).getByRole("spinbutton", {name: "العدد"});
        await user.clear(second);
        await user.type(second, "3");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(onSave).toHaveBeenCalledWith(item.key, expect.objectContaining({
            taperSteps: [expect.objectContaining({frequencyValue: 4}), expect.objectContaining({frequencyValue: 3})],
        }));
    });
});
