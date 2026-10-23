import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {addDrugToRx, drugWith, shownName, textsOf} from "../support/ux.ts";
import type {ClinicHandle, Data} from "../support/data.ts";
import {TREE_TEXTS} from "../support/texts-rx.ts";
import {DrugTreeUi} from "../support/tree.ts";

/**
 * Closing a toast before its time (business overview § قواعد عامة, tech overview § App shell "Dismissing"): an ×
 * icon button «إغلاق» / "Close" on every toast, and a sideways swipe on a touch phone.
 */

/** One toast as shown (react-hot-toast: each toast is a child of the toaster), its message, buttons and all. */
const toastBox = (page: Page, text: string): Locator => page.locator("[data-rht-toaster] > div").filter({hasText: text});

/**
 * A prescription with drugs A and B, then A and B picked again: two «… موجود بالفعل في القائمة» toasts (4 s each). The
 * two picks again come from one search showing both rows (one bucket, opened by itself), so the second toast follows
 * the first at once, well inside its 4 s even on a slow phone (two more searches through the tree could eat most of them).
 */
const twoToasts = async (page: Page, data: Data, clinic: ClinicHandle, lang: "ar" | "en") => {
    const {t, u} = textsOf(lang);
    const prefix = `Toast ${unique()}`;
    const a = await drugWith(data, clinic, {name: `${prefix} A`});
    const b = await drugWith(data, clinic, {name: `${prefix} B`});
    await signIn(page, clinic.owner.phone);
    await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("prescription.")).forEach(k => localStorage.removeItem(k)));
    await page.reload();
    for (const drug of [a, b]) {
        await addDrugToRx(page, t, drug.name);
        await expect(shownName(page, drug.name)).toBeVisible();
    }
    const tree = new DrugTreeUi(page, page.locator("main"), TREE_TEXTS[lang]);
    await tree.search(prefix);
    await expect(tree.drug(a.name)).toBeVisible();
    await expect(tree.drug(b.name)).toBeVisible();
    await tree.select(a.name);
    await tree.select(b.name);
    const first = toastBox(page, u.alreadyAdded(a.name));
    const second = toastBox(page, u.alreadyAdded(b.name));
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    return {first, second};
};

/** A finger swiping `target` sideways by `dx` px (real touch events through the DevTools protocol). */
const swipe = async (page: Page, target: Locator, dx: number) => {
    const box = (await target.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x, y}]});
    for (let step = 1; step <= 10; step++) {
        await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: x + dx * step / 10, y}]});
    }
    await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
    await cdp.detach();
};

test.describe("Closing a toast @area:ux", () => {
    test("a toast's × icon button («إغلاق» / \"Close\") closes that toast at once, the other one stays @UX-038",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const {first, second} = await twoToasts(page, data, clinic, lang);
            // Well before their own 4 s
            await first.getByRole("button", {name: t.close}).click({timeout: 2_000});
            await expect(first, "closed at once").toBeHidden({timeout: 1_000});
            await expect(second, "the other toast stays").toBeVisible();
        });

    test("on a touch phone, a tap on a toast's × closes it and the other toast still closes by itself in its time @UX-038",
        async ({page, data, lang, isMobile}) => {
            test.skip(!isMobile, "the phone project");
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const {first, second} = await twoToasts(page, data, clinic, lang);
            await first.getByRole("button", {name: t.close}).tap({timeout: 2_000});
            await expect(first, "closed at once").toBeHidden({timeout: 1_000});
            // A tap must not pause the other toasts' timers: its 4 s (already partly gone) and the exit, with margin
            await expect(second, "the other toast closes by itself").toBeHidden({timeout: 7_000});
        });

    test("on a touch phone a toast swiped sideways closes @UX-039", async ({page, data, lang, isMobile}) => {
        test.skip(!isMobile, "the phone project");
        const clinic = await data.clinic();
        const {first} = await twoToasts(page, data, clinic, lang);
        await swipe(page, first, 150);
        await expect(first, "closed by the swipe, well before its own 4 s").toBeHidden({timeout: 1_000});
    });
});
