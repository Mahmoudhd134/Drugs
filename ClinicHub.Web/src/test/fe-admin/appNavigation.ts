import {act} from "@testing-library/react";
import type {NavigateFunction} from "react-router-dom";

let navigateTo: NavigateFunction | null = null;

/** Kept by AdminRoutes' probe while the admin app is rendered. */
export const setNavigate = (navigate: NavigateFunction | null) => {
    navigateTo = navigate;
};

/** Goes to `to` as a link or the browser's Back would (the app stays mounted). */
export const navigateInApp = (to: string) => act(async () => {
    if (!navigateTo) throw new Error("The admin app is not rendered");
    await navigateTo(to);
});
