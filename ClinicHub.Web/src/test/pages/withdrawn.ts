import {within} from "@testing-library/react";
import {expect} from "vitest";
import {hoverTooltip, leaveTooltip} from "../mui.ts";

/*
 * The «معطّل من الإدارة» / "Disabled by admin" mark (`WithdrawnChip`, design M1.7 D6; texts: M1.7b contract § 3.5): one
 * chip everywhere, focusable, its tooltip on hover, focus and tap, the tooltip text also its accessible description.
 */

export const WITHDRAWN = {
    ar: {
        chip: "معطّل من الإدارة",
        count: (n: number) => `معطّل من الإدارة: ${n}`,
        tooltip: "عطّل مدير المنصة هذا الدواء في الكتالوج المشترك، فلا يظهر في البحث. يبقى في البروتوكولات التي تستخدمه.",
    },
    en: {
        chip: "Disabled by admin",
        count: (n: number) => `Disabled by admin: ${n}`,
        tooltip: "The platform admin disabled this drug in the shared catalog, so it no longer appears in search. It stays in the protocols that use it.",
    },
};

/** The mark with this exact text inside `scope` (the chip itself: its label's MUI Chip root). */
export const withdrawnMark = (scope: HTMLElement, text: string) => {
    const label = within(scope).getByText(text, {exact: true});
    return (label.closest(".MuiChip-root") ?? label) as HTMLElement;
};

/**
 * The mark is focusable, described by the tooltip text, and hovering it shows that tooltip. `insideControl`: the chip
 * inside a control (`WithdrawnChipInsideControl`, e.g. a picker option): no Tab stop of its own (contract decision D17),
 * hover only. The tooltip is found by its role (its text is also in the DOM as the hidden description).
 */
export const expectWithdrawnTooltip = async (mark: HTMLElement, lang: "ar" | "en" = "ar", insideControl = false) => {
    const {tooltip} = WITHDRAWN[lang];
    if (!insideControl) {
        mark.focus();
        expect(mark, "the mark is focusable").toHaveFocus();
        expect(mark).toHaveAccessibleDescription(tooltip);
    }
    expect(await hoverTooltip(mark)).toBe(tooltip);
    await leaveTooltip(mark);
};
