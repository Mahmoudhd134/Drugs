import {describe, expect, test} from "vitest";
import {act, fireEvent, screen, within} from "@testing-library/react";
import {createAppTheme} from "../../../app/theme.ts";
import {choose, hoverTooltip, openSelect, optionsOf, renderWithProviders} from "../../../test";
import type {Dosing} from "../types.ts";
import {DosingHarness} from "../../../test/pages/DosingHarness.tsx";
import {dosingPreview, harnessValue} from "../../../test/pages/dosing.ts";

// The dosing form (DosingFields): docs/features/dosing/business.md "الحقول", "الرسائل" and tech.md "Frontend" (DosingFields).
// Expected sentences: the wording of rxTextAr.ts (dose → eye → frequency → duration).

const renderFields = (lang: "ar" | "en" = "ar", initial?: Dosing) =>
    renderWithProviders(<DosingHarness initial={initial}/>, {lang});

const preview = dosingPreview;
const value = harnessValue;
const combo = (name: string) => screen.getByRole("combobox", {name});
const number = (name: string) => screen.getByRole("spinbutton", {name});

describe("dosing fields: the choices @area:catalog", () => {
    test("unit, frequency, period and eye offer the documented choices in Arabic @DOSE-076", async () => {
        const {user} = await renderFields("ar");
        expect((await optionsOf(user, combo("الوحدة"))).slice(1)).toEqual(["نقطة", "قرص", "كبسولة", "مل", "دهان (مرهم)"]);
        expect((await optionsOf(user, combo("عدد المرات"))).slice(1))
            .toEqual(["مرات في اليوم", "كل عدد ساعات", "قبل النوم", "عند اللزوم", "نص مخصص"]);
        expect((await optionsOf(user, combo("الفترة"))).slice(1))
            .toEqual(["أيام", "أسابيع", "أشهر", "بصفة مستمرة", "حتى الزيارة القادمة"]);
        const eyes = screen.getByText("العين").nextElementSibling as HTMLElement;
        expect(within(eyes).getAllByRole("button").map(b => b.textContent)).toEqual(["اليمنى", "اليسرى", "العينين", "بدون عين"]);
    });

    test("the same choices carry English labels in the English UI @DOSE-076", async () => {
        const {user} = await renderFields("en");
        expect((await optionsOf(user, combo("Unit"))).slice(1)).toEqual(["Drop", "Tablet", "Capsule", "ml", "Application (ointment)"]);
        expect((await optionsOf(user, combo("Frequency"))).slice(1))
            .toEqual(["Times a day", "Every N hours", "At bedtime", "As needed", "Custom"]);
        expect((await optionsOf(user, combo("Period"))).slice(1))
            .toEqual(["Days", "Weeks", "Months", "Continuous", "Until next visit"]);
        const eyes = screen.getByText("Eye").nextElementSibling as HTMLElement;
        expect(within(eyes).getAllByRole("button").map(b => b.textContent)).toEqual(["Right", "Left", "Both", "No eye"]);
    });

    test("«مرات في اليوم» shows «العدد», «كل عدد ساعات» shows «الساعات», the others no number @DOSE-077", async () => {
        const {user} = await renderFields();
        expect(screen.queryByRole("spinbutton", {name: "العدد"})).not.toBeInTheDocument();
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        expect(number("العدد")).toBeInTheDocument();
        await choose(user, combo("عدد المرات"), "كل عدد ساعات");
        expect(number("الساعات")).toBeInTheDocument();
        expect(screen.queryByRole("spinbutton", {name: "العدد"})).not.toBeInTheDocument();
        for (const other of ["قبل النوم", "عند اللزوم", "نص مخصص"]) {
            await choose(user, combo("عدد المرات"), other);
            expect(screen.queryByRole("spinbutton", {name: "العدد"})).not.toBeInTheDocument();
            expect(screen.queryByRole("spinbutton", {name: "الساعات"})).not.toBeInTheDocument();
        }
    });

    test("«نص مخصص» shows the «نص عدد المرات» text field, typed in any direction @DOSE-078", async () => {
        const {user} = await renderFields();
        expect(screen.queryByRole("textbox", {name: "نص عدد المرات"})).not.toBeInTheDocument();
        await choose(user, combo("عدد المرات"), "نص مخصص");
        expect(screen.getByRole("textbox", {name: "نص عدد المرات"})).toHaveAttribute("dir", "auto");
    });

    test("days / weeks / months show «المدة»; continuous and until next visit don't @DOSE-079", async () => {
        const {user} = await renderFields();
        expect(screen.queryByRole("spinbutton", {name: "المدة"})).not.toBeInTheDocument();
        for (const unit of ["أيام", "أسابيع", "أشهر"]) {
            await choose(user, combo("الفترة"), unit);
            expect(number("المدة")).toBeInTheDocument();
        }
        for (const unit of ["بصفة مستمرة", "حتى الزيارة القادمة"]) {
            await choose(user, combo("الفترة"), unit);
            expect(screen.queryByRole("spinbutton", {name: "المدة"})).not.toBeInTheDocument();
        }
    });

    test("the custom text stops at 200 characters, typed or pasted @DOSE-053", async () => {
        const {user} = await renderFields();
        await choose(user, combo("عدد المرات"), "نص مخصص");
        const text = screen.getByRole("textbox", {name: "نص عدد المرات"});
        await user.click(text);
        await user.paste("ب".repeat(250));
        expect(text).toHaveValue("ب".repeat(200));
        await user.type(text, "x");
        expect(text).toHaveValue("ب".repeat(200));
    });
});

describe("dosing fields: the eye toggle and the preview @area:catalog", () => {
    test("clicking the selected «اليمنى» again clears the eye @DOSE-080", async () => {
        const {user} = await renderFields("ar", {doseUnit: "drop"});
        const right = screen.getByRole("button", {name: "اليمنى"});
        await user.click(right);
        expect(right).toHaveAttribute("aria-pressed", "true");
        expect(preview()).toHaveTextContent(/^نقطة واحدة في العين اليمنى$/);
        await user.click(right);
        expect(right).toHaveAttribute("aria-pressed", "false");
        expect(value().eye).toBeNull();
        expect(preview()).toHaveTextContent(/^نقطة واحدة$/);
    });

    test("every change updates the «نص الروشتة» preview at once @DOSE-081 @smoke", async () => {
        const {user} = await renderFields();
        await choose(user, combo("الوحدة"), "نقطة");
        expect(preview()).toHaveTextContent(/^نقطة واحدة$/);
        await user.type(number("الجرعة"), "2");
        expect(preview()).toHaveTextContent(/^نقطتين$/);
        await choose(user, combo("عدد المرات"), "مرات في اليوم");
        await user.type(number("العدد"), "4");
        expect(preview()).toHaveTextContent(/^نقطتين 4 مرات يوميًا$/);
        await choose(user, combo("الفترة"), "أسابيع");
        await user.type(number("المدة"), "2");
        expect(preview()).toHaveTextContent(/^نقطتين 4 مرات يوميًا لمدة أسبوعين$/);
        await user.click(screen.getByRole("button", {name: "اليسرى"}));
        expect(preview()).toHaveTextContent(/^نقطتين في العين اليسرى 4 مرات يوميًا لمدة أسبوعين$/);
    });

    test("no dosing: the preview says «لا توجد جرعة محددة» / \"No dosing set\" in a muted color @DOSE-082", async () => {
        // "Muted" as the doc means it: not the sentence's colour, one of the theme's muted text tones (the page checks'
        // axe scan holds its contrast, UX-036)
        const theme = createAppTheme("rtl");
        const hasColor = (element: Element, color: string) => {
            try {
                expect(element).toHaveStyle({color});
                return true;
            } catch {
                return false;
            }
        };
        const expectMuted = (element: Element) => {
            expect(hasColor(element, theme.palette.text.primary), "not the sentence's colour").toBe(false);
            expect([theme.palette.text.secondary, theme.palette.text.disabled].some(color => hasColor(element, color)),
                "a muted text tone").toBe(true);
        };
        const {unmount} = await renderFields("ar");
        expect(preview()).toHaveTextContent(/^لا توجد جرعة محددة$/);
        expectMuted(preview());
        unmount();
        await renderFields("en");
        expect(preview("Prescription text")).toHaveTextContent(/^No dosing set$/);
        expectMuted(preview("Prescription text"));
        // A sentence is not muted
        await renderFields("en", {doseUnit: "drop"});
        const sentence = screen.getAllByText("Prescription text")[1].nextElementSibling!;
        expect(sentence).toHaveTextContent(/^نقطة واحدة$/);
        expect([theme.palette.text.secondary, theme.palette.text.disabled].some(color => hasColor(sentence, color))).toBe(false);
    });

    test("hovering the dose field shows «اكتب 0.5 لنصف قرص أو نصف نقطة.» @DOSE-083", async () => {
        await renderFields();
        expect(await hoverTooltip(number("الجرعة"))).toBe("اكتب 0.5 لنصف قرص أو نصف نقطة.");
    });

    test("in English the dose tooltip reads \"Use 0.5 for half a tablet or half a drop.\" @DOSE-083", async () => {
        await renderFields("en");
        expect(await hoverTooltip(number("Dose"))).toBe("Use 0.5 for half a tablet or half a drop.");
    });

    test("typing the amount and picking the unit in one go keeps both @DOSE-086", async () => {
        const {user} = await renderFields();
        // Taken first: the open menu hides the rest of the page from queries
        const amount = number("الجرعة");
        const listbox = await openSelect(user, combo("الوحدة"));
        const drop = within(listbox).getByRole("option", {name: "نقطة"});
        // Both events before React re-renders: a setter that doesn't merge would lose the amount
        act(() => {
            fireEvent.change(amount, {target: {value: "2"}});
            fireEvent.click(drop);
        });
        expect(value()).toMatchObject({doseAmount: 2, doseUnit: "drop"});
        expect(preview()).toHaveTextContent(/^نقطتين$/);
    });
});
