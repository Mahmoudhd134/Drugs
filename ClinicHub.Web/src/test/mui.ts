import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {expect, vi} from "vitest";

/*
 * MUI in jsdom: selects, field errors and tooltips. Tooltips open and close after delays and transitions: the helpers
 * run them on fake timers, so no test waits for them in real time (and none depends on the machine's speed).
 */

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

/** The element an MUI Tooltip listens on: `element`, or its nearest ancestor the Tooltip wraps (e.g. a disabled button's span). */
const tooltipTarget = (element: HTMLElement) =>
    element.closest<HTMLElement>("[data-mui-internal-clone-element]") ?? element;

/**
 * Runs `fire` with setTimeout faked, then moves the clock past MUI's delays and transitions: in steps, each in its own
 * act(), as a timer set by a re-render (e.g. the exit transition after the leave delay) only exists once React has
 * rendered.
 */
const onFakeClock = (fire: () => void) => {
    const alreadyFake = vi.isFakeTimers();
    if (!alreadyFake) vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
    try {
        fire();
        for (let step = 0; step < 4; step++) {
            act(() => {
                vi.advanceTimersByTime(500);
            });
        }
    } finally {
        if (!alreadyFake) vi.useRealTimers();
    }
};

/**
 * Hovers `element` (or the ancestor its Tooltip wraps) past the tooltip's enter delay, with no real waiting. Then
 * `screen.queryByRole("tooltip")` tells whether a tooltip opened.
 */
export const hoverPastDelay = (element: HTMLElement) => onFakeClock(() => fireEvent.mouseOver(tooltipTarget(element)));

/** Hovers `element` (see {@link hoverPastDelay}) and returns the text of the tooltip that opens. */
export const hoverTooltip = async (element: HTMLElement) => {
    hoverPastDelay(element);
    const tooltip = await screen.findByRole("tooltip");
    return tooltip.textContent ?? "";
};

/** Moves the mouse off `element` and waits until its tooltip has closed (before hovering the next one). */
export const leaveTooltip = async (element: HTMLElement) => {
    onFakeClock(() => fireEvent.mouseLeave(tooltipTarget(element)));
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
};

/** A click on an MUI dialog's backdrop (the container around its paper, where MUI listens for it). */
export const clickOutside = async (user: UserEvent | { click: (element: Element) => Promise<void> }, dialog: HTMLElement) =>
    user.click(dialog.closest(".MuiDialog-container") as HTMLElement);

/**
 * Waits in real time past MUI's dialog exit transition (225 ms at most). A dialog that started closing (Esc, a backdrop
 * click) stays in the document, not hidden, during its fade-out: assert "still open" only after this.
 */
export const pastExitTransition = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 400)));

/**
 * After an Esc or a backdrop click that must not close `dialog`: waits past the exit transition, then expects the same
 * dialog still shown (not fading out, not unmounted).
 */
export const expectStillOpen = async (dialog: HTMLElement) => {
    await pastExitTransition();
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest(".MuiDialog-root")).not.toHaveAttribute("aria-hidden");
    const container = dialog.closest<HTMLElement>(".MuiDialog-container");
    expect(container?.style.opacity ?? "").not.toBe("0");
    expect(screen.getAllByRole("dialog")).toContain(dialog);
};
