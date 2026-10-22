import {expect, type Locator, type Page} from "@playwright/test";
import type {Lang} from "./texts.ts";
import {SHARED_TEXTS} from "./texts-shared.ts";

/*
 * The «معطّل من الإدارة» / "Disabled by admin" mark (`WithdrawnChip`, design M1.7 D6): one chip, focusable, its tooltip
 * on hover, keyboard focus and tap (at once), closed by Esc or a tap elsewhere, the text also its accessible
 * description; screen only, never copied.
 */

/** The mark inside `scope` with exactly this text (the chip, or the count «معطّل من الإدارة: N»). */
export const markIn = (scope: Locator, text: string) => scope.getByText(text, {exact: true}).first();

const tooltip = (page: Page) => page.getByRole("tooltip").filter({visible: true});

/** The tooltip shows the text, in the UI's direction, fully inside the viewport. */
const expectTooltipShown = async (page: Page, lang: Lang, what: string) => {
    const shown = tooltip(page);
    await expect(shown, what).toHaveText(SHARED_TEXTS[lang].withdrawnTooltip);
    const box = await shown.boundingBox();
    const width = page.viewportSize()!.width;
    expect(box, `${what}: the tooltip is laid out`).not.toBeNull();
    expect(box!.x, `${what}: the tooltip starts inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${what}: the tooltip ends inside the viewport`).toBeLessThanOrEqual(width + 1);
    expect(await shown.evaluate(e => getComputedStyle(e).direction), `${what}: the tooltip's direction`).toBe(lang === "ar" ? "rtl" : "ltr");
};

/** Hover, then keyboard focus (Shift+Tab, Tab: a keyboard focus), each shows the tooltip; Esc closes it. */
export const expectMarkTooltip = async (page: Page, mark: Locator, lang: Lang, what: string) => {
    await expect(mark, what).toBeVisible();
    // The chip itself (or the element around its label that holds the focus) is described by the tooltip text
    const focusable = mark.locator("xpath=ancestor-or-self::*[@tabindex][1]");
    await expect(focusable, `${what}: the mark's accessible description`).toHaveAccessibleDescription(SHARED_TEXTS[lang].withdrawnTooltip);

    await mark.hover();
    await expectTooltipShown(page, lang, `${what}, hovered`);
    await page.mouse.move(1, 1);
    await expect(tooltip(page), `${what}: the tooltip closes when the mouse leaves`).toHaveCount(0);

    await focusable.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(focusable, `${what}: Tab reaches the mark`).toBeFocused();
    await expectTooltipShown(page, lang, `${what}, focused with Tab`);
    await page.keyboard.press("Escape");
    await expect(tooltip(page), `${what}: Esc closes the tooltip`).toHaveCount(0);
};

/** A tap on a touch screen shows the tooltip at once; a tap elsewhere closes it. */
export const expectMarkTapTooltip = async (page: Page, mark: Locator, lang: Lang, what: string) => {
    await mark.tap();
    await expectTooltipShown(page, lang, `${what}, tapped`);
    await page.touchscreen.tap(2, page.viewportSize()!.height - 2);
    await expect(tooltip(page), `${what}: a tap elsewhere closes the tooltip`).toHaveCount(0, {timeout: 10_000});
};
