import {expect, type Locator, type Page, type Request} from "@playwright/test";
import type {Texts} from "./texts.ts";

/** UI steps shared by the specs (the app's own labels, in the project's language). */

/**
 * A toast (react-hot-toast: role="status") with this text. A CSS locator: while a dialog is open, MUI hides the rest
 * of the page from the accessibility tree (aria-hidden), the toaster included, but the toast is on screen.
 */
export const toast = (page: Page, text: string): Locator =>
    page.locator("[role=status]").filter({hasText: text});

/** Every toast on screen. */
export const toasts = (page: Page): Locator => page.locator("[role=status]");

/** Expects one toast with exactly this text. */
export const expectToast = async (page: Page, text: string) => {
    // A long wait for the answer under load; a success toast then stays 2 s
    await expect(toast(page, text)).toHaveText(text, {timeout: 20_000});
};

/** The sidebar as shown: on a phone (menu button shown) the drawer is opened first. Returns whether it opened one. */
export const openSidebar = async (page: Page, t: Texts) => {
    const menu = page.getByRole("button", {name: t.navMenu});
    const phone = await menu.isVisible();
    if (phone) {
        // A drawer still closing (from an earlier step) would take the click on its backdrop
        await expect(page.locator(".MuiDrawer-modal")).toBeHidden();
        await menu.click();
    }
    const nav = page.getByRole("navigation", {name: t.navMain}).filter({visible: true});
    await expect(nav).toBeVisible();
    return {nav, phone};
};

/** Closes the phone's drawer (Escape) and waits until it is gone. */
export const closeSidebar = async (page: Page) => {
    await page.keyboard.press("Escape");
    await expect(page.locator(".MuiDrawer-modal")).toBeHidden();
};

/** Opens the sidebar on a phone (drawer) when needed, then the entry. */
export const navTo = async (page: Page, t: Texts, label: string) => {
    const {nav} = await openSidebar(page, t);
    await nav.getByRole("link", {name: label, exact: true}).click();
};

/** The sidebar's entries as shown (opening the drawer on a phone, closed again after). */
export const sidebarEntries = async (page: Page, t: Texts) => {
    const {nav, phone} = await openSidebar(page, t);
    const links = nav.getByRole("link");
    await expect(links.first()).toBeVisible();
    const names = await links.allTextContents();
    if (phone) await closeSidebar(page);
    return names.map(n => n.trim());
};

export const openAccountMenu = async (page: Page, t: Texts) => {
    await page.getByRole("button", {name: t.account}).click();
};

export const logout = async (page: Page, t: Texts) => {
    await openAccountMenu(page, t);
    await page.getByRole("menuitem", {name: t.logout}).click();
};

export const openSwitchClinic = async (page: Page, t: Texts) => {
    await openAccountMenu(page, t);
    await page.getByRole("menuitem", {name: t.switchContext}).click();
    await expect(page).toHaveURL(/\/select-clinic$/);
};

/** The clinic picker's entries (label + hint), in their order. */
export const pickerEntries = (page: Page) => page.locator("main .MuiListItemButton-root, .MuiCard-root .MuiListItemButton-root");

export const pickerEntry = (page: Page, label: string) =>
    page.locator(".MuiCard-root .MuiListItemButton-root").filter({has: page.getByText(label, {exact: true})});

export const expectPicker = async (page: Page, t: Texts) => {
    await expect(page).toHaveURL(/\/select-clinic$/);
    await expect(page.getByRole("heading", {level: 1, name: t.selectTitle})).toBeVisible();
};

/** The clinic app's bar shows this context label (a clinic's name, "Platform admin", "Template clinic"). */
export const expectContextLabel = async (page: Page, label: string) => {
    await expect(page.getByRole("banner").getByText(label, {exact: true})).toBeVisible();
};

/** Records the requests matching `method` + a path (regex on the pathname) from now on. */
export const recordRequests = (page: Page, method: string, path: RegExp) => {
    const seen: Request[] = [];
    page.on("request", request => {
        if (request.method() === method && path.test(new URL(request.url()).pathname)) seen.push(request);
    });
    return seen;
};

/** The tab got the focus back (another program was in front): what TanStack Query and the app listen to. */
export const focusBack = async (page: Page) => {
    await page.evaluate(() => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
    });
};
