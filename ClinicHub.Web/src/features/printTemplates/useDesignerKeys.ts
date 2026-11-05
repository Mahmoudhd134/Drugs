import {type RefObject, useEffect} from "react";
import type {TemplateItem} from "./types.ts";
import {useLatest} from "./useLatest.ts";

type Options = {
    /** The designer's root (`template-designer`) */
    root: RefObject<HTMLElement | null>;
    selected: TemplateItem | null;
    onUndo: () => void;
    onRedo: () => void;
    onNudge: (item: TemplateItem, dxMm: number, dyMm: number) => void;
    onDelete: (item: TemplateItem) => void;
    onDeselect: () => void;
};

/** What the focus lets the designer handle (contract § 3.5): nothing, only undo and redo, or every key. */
type Reach = "none" | "shortcuts" | "all";

/**
 * A dialog, menu or list of options is open. Not a closed one kept in the page: `AppShell`'s phone drawer is always there, a
 * `role="dialog"` inside a hidden modal.
 */
const hasOpenOverlay = () => Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'))
    .some(overlay => !overlay.closest(".MuiModal-hidden"));

const reachOf = (root: HTMLElement | null, selectedId: string | null): Reach => {
    if (hasOpenOverlay()) return "none";
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return "all";
    if (active.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return "none";
    if (!root?.contains(active)) return "none";
    const box = active.closest("[data-item-id]");
    if (box && box.getAttribute("data-item-id") !== selectedId) return "shortcuts";
    return active.getAttribute("role") === "combobox" ? "shortcuts" : "all";
};

const ARROWS: Record<string, { x: number; y: number }> = {
    ArrowLeft: {x: -1, y: 0},
    ArrowRight: {x: 1, y: 0},
    ArrowUp: {x: 0, y: -1},
    ArrowDown: {x: 0, y: 1},
};

/**
 * The designer's keys (contract § 3.5), on `window` while the designer shows: the arrows work right after a click on a panel
 * entry, and the clinic tabs keep theirs. `event.code` for letters (Arabic layouts, Caps Lock), `event.key` for the others.
 * `preventDefault` whenever the designer handles a key, at the sheet's edge too, so Alt + arrow never reaches the browser's Back.
 */
export const useDesignerKeys = (options: Options) => {
    const latest = useLatest(options);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const {root, selected, onUndo, onRedo, onNudge, onDelete, onDeselect} = latest.current;
            const reach = reachOf(root.current, selected?.id ?? null);
            if (reach === "none") return;

            const command = event.ctrlKey || event.metaKey;
            if (command && event.code === "KeyZ") {
                event.preventDefault();
                if (event.shiftKey) onRedo();
                else onUndo();
                return;
            }
            if (command && event.code === "KeyY") {
                event.preventDefault();
                onRedo();
                return;
            }

            if (reach !== "all" || !selected) return;
            const arrow = ARROWS[event.key];
            if (arrow) {
                if (command) return;
                event.preventDefault();
                // Alt wins over Shift (contract § 6.8)
                let step = 1;
                if (event.altKey) step = 0.1;
                else if (event.shiftKey) step = 5;
                onNudge(selected, arrow.x * step, arrow.y * step);
            } else if (event.key === "Alt") {
                event.preventDefault();
            } else if (event.key === "Delete") {
                event.preventDefault();
                if (selected.kind !== "prescriptionText") onDelete(selected);
            } else if (event.key === "Escape") {
                event.preventDefault();
                onDeselect();
            }
        };

        // Alt's own key, so Windows doesn't move the focus to the browser's menu (a manual case: CI has no browser menu)
        const onKeyUp = (event: KeyboardEvent) => {
            const {root, selected} = latest.current;
            if (event.key === "Alt" && selected && reachOf(root.current, selected.id) === "all") event.preventDefault();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [latest]);
};
