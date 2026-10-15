import {waitFor} from "@testing-library/react";

/** The texts of the toasts shown now (react-hot-toast's `<Toaster>`, which renderWithProviders mounts), newest first. */
export const toastTexts = () =>
    Array.from(document.querySelectorAll("[data-rht-toaster] [role=status]")).map(toast => toast.textContent ?? "");

/** Waits for a toast and returns the text of the newest one (a multi-line toast keeps its "\n"). */
export const findToast = () => waitFor(() => {
    const [newest] = toastTexts();
    if (newest === undefined) throw new Error("No toast is shown");
    return newest;
});
