import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {expect, vi} from "vitest";

/*
 * Helpers of the catalog component tests (drugs, groups, dosing, tapering). Import from "…/test/fe-catalog".
 */

/** A name as the locale files put it inside a message: wrapped in the bidi isolates U+2068/U+2069. */
export const isolate = (name: string) => `⁨${name}⁩`;

/** True when the MUI field of `control` (an input, or a select's combobox) is shown in error: red. */
export const isRed = (control: HTMLElement) =>
    !!control.closest(".MuiInputBase-root")?.classList.contains("Mui-error");

/** Opens the MUI select `combobox` and returns its listbox (an MUI menu in a portal). */
export const openSelect = async (user: UserEvent, combobox: HTMLElement) => {
    await user.click(combobox);
    return screen.findByRole("listbox");
};

/** The labels a MUI select offers, in order (the select is closed again). */
export const optionsOf = async (user: UserEvent, combobox: HTMLElement) => {
    const listbox = await openSelect(user, combobox);
    const labels = within(listbox).getAllByRole("option").map(o => o.textContent ?? "");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    return labels;
};

/** Picks `option` in the MUI select `combobox`. */
export const choose = async (user: UserEvent, combobox: HTMLElement, option: string) => {
    const listbox = await openSelect(user, combobox);
    await user.click(within(listbox).getByRole("option", {name: option}));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
};

/**
 * Hovers the element an MUI Tooltip wraps (`element` or its nearest wrapped ancestor) and returns the tooltip's text.
 * The tooltip's enter delay runs on fake timers: no real waiting.
 */
export const hoverTooltip = async (element: HTMLElement) => {
    const target = element.closest<HTMLElement>("[data-mui-internal-clone-element]") ?? element;
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
    try {
        fireEvent.mouseOver(target);
        act(() => {
            vi.advanceTimersByTime(1500);
        });
    } finally {
        vi.useRealTimers();
    }
    const tooltip = await screen.findByRole("tooltip");
    return tooltip.textContent ?? "";
};
export * from "./DosingHarness.tsx";
export * from "./dosingQueries.ts";
export * from "./groupEditor.tsx";
