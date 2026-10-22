import type {Page} from "@playwright/test";
import type {ClinicHandle, Data} from "../support/data.ts";
import {expect, signIn, test} from "../support/fixtures.ts";
import {expectEditorHealthy, type HtmlParagraph, markClipboard, parseHtml, readClipboard, RxPage, rxDrug, rxName} from "../support/rx.ts";
import {RX_DOSINGS, RX_TEXTS, type RxTexts} from "../support/texts-rx.ts";
import {expectToast} from "../support/ui.ts";

const NOTE = "رج الزجاجة قبل الاستعمال";

/**
 * Lines A (a dosing), B (no dosing, a two-line description), C (a dosing and a note): the catalog's RX-065 example.
 * Returns the drugs and the expected plain text ("A\n<sentence>\n\nB\nسطر1\nسطر2\n\nC\n<sentence>\n<note>").
 */
const threeLines = async (page: Page, rx: RxPage, data: Data, clinic: ClinicHandle) => {
    const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: RX_DOSINGS.twoDropsLeft6Daily2Weeks.dosing});
    const b = await rxDrug(data, clinic, {name: rxName("Beta"), description: "سطر1\nسطر2"});
    const c = await rxDrug(data, clinic, {name: rxName("Gamma"), dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing});
    await signIn(page, clinic.owner.phone);
    await rx.addAlone([a, b, c]);
    await rx.saveNote(rx.line(2), NOTE);
    await rx.expectLines([
        [a.name, RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence],
        [b.name, "سطر1", "سطر2"],
        [c.name, RX_DOSINGS.tabletEvery8Hours5Days.sentence, NOTE],
    ]);
    const plain = `${a.name}\n${RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence}\n\n${b.name}\nسطر1\nسطر2\n\n`
        + `${c.name}\n${RX_DOSINGS.tabletEvery8Hours5Days.sentence}\n${NOTE}`;
    return {a, b, c, plain};
};

/**
 * The HTML for Word (RX-067, RX-069): one paragraph per drug (`<strong dir="ltr">name</strong><br>details`: the Latin
 * name's own direction, D27; multi-line text with `<br>`), empty paragraphs between drugs; every paragraph `dir="rtl"`, `text-align:right`, no margins, no class.
 */
const expectWordHtml = (paragraphs: HtmlParagraph[], drugs: string[][]) => {
    const expected: string[] = [];
    drugs.forEach(([name, ...details], i) => {
        if (i) expected.push("<br>");
        expected.push([`<strong dir="ltr">${name}</strong>`, ...details].join("<br>"));
    });
    expect(paragraphs.map(p => p.html), "the copied paragraphs").toEqual(expected);
    for (const p of paragraphs) {
        expect(p.tag).toBe("p");
        expect(p.dir).toBe("rtl");
        expect(p.className).toBeNull();
        expect(p.style).toEqual({"text-align": "right", "margin-top": "0px", "margin-bottom": "0px"});
    }
};

const openEditor = async (page: Page, rt: RxTexts) => {
    await page.getByRole("button", {name: rt.editAndCopy}).click();
    const dialog = page.getByRole("dialog").filter({has: page.getByRole("heading", {name: rt.editorTitle})});
    // The editor is lazy-loaded: the dialog shows a spinner first
    await expect(dialog.locator(".ql-editor")).toBeVisible({timeout: 30_000});
    return dialog;
};

test.describe("Prescription: copy and Edit & copy @area:prescription", () => {
    test.beforeEach(async ({context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("«نسخ» puts plain text and HTML on the clipboard (read back) and shows «تم النسخ» @RX-071 @smoke", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const rx = new RxPage(page, rt);
        const {a, b, c, plain} = await threeLines(page, rx, data, clinic);
        await markClipboard(page);

        await page.getByRole("button", {name: rt.quickCopy, exact: true}).click();
        await expectToast(page, rt.copied);
        const clipboard = await readClipboard(page);
        expect(clipboard.text).toBe(plain);
        expect(clipboard.html, "an HTML format on the clipboard").not.toBeNull();
        expectWordHtml(await parseHtml(page, clipboard.html ?? ""), [
            [a.name, RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence],
            [b.name, "سطر1", "سطر2"],
            [c.name, RX_DOSINGS.tabletEvery8Hours5Days.sentence, NOTE],
        ]);
    });

    test("with the English interface the copied text is still the Arabic sentences, right-to-left @RX-072", async ({page, data}) => {
        const rt = RX_TEXTS.en;
        await page.addInitScript(() => localStorage.setItem("language", "en"));
        const clinic = await data.clinic();
        const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: RX_DOSINGS.dropRightAfterMealsContinuous.dosing});
        await signIn(page, clinic.owner.phone);
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        const rx = new RxPage(page, rt);
        await rx.addAlone([a]);
        await markClipboard(page);

        await page.getByRole("button", {name: rt.quickCopy, exact: true}).click();
        await expectToast(page, rt.copied);
        const clipboard = await readClipboard(page);
        expect(clipboard.text).toBe(`${a.name}\n${RX_DOSINGS.dropRightAfterMealsContinuous.sentence}`);
        expectWordHtml(await parseHtml(page, clipboard.html ?? ""), [[a.name, RX_DOSINGS.dropRightAfterMealsContinuous.sentence]]);
    });

    test("«تعديل ونسخ» opens «تعديل قبل النسخ» with its hint and the lines: bold names, sentences, notes, right-to-left @RX-075 @smoke",
        async ({page, lang, data}, testInfo) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const rx = new RxPage(page, rt);
            const {a, b, c} = await threeLines(page, rx, data, clinic);

            const dialog = await openEditor(page, rt);
            await expect(dialog.getByText(rt.editorHint, {exact: true})).toBeVisible();
            await expectEditorHealthy(page, lang, testInfo);
            const editor = dialog.locator(".ql-editor");
            await expect(editor.locator("strong")).toHaveText([a.name, b.name, c.name]);
            for (const text of [RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence, "سطر1", "سطر2", RX_DOSINGS.tabletEvery8Hours5Days.sentence, NOTE]) {
                await expect(editor).toContainText(text);
            }
            const directions = await editor.locator("p").evaluateAll(ps => ps.map(p => getComputedStyle(p).direction));
            expect(directions.length).toBeGreaterThan(0);
            expect(new Set(directions)).toEqual(new Set(["rtl"]));
            await dialog.getByRole("button", {name: rt.close, exact: true}).click();
            await expect(dialog).toBeHidden();
        });

    test("in the editor, bold text and a numbered list are kept in the copied HTML, the plain text has «1. » items, «تم النسخ» @RX-077",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const rx = new RxPage(page, rt);
            const {a} = await threeLines(page, rx, data, clinic);
            const dialog = await openEditor(page, rt);
            const editor = dialog.locator(".ql-editor");

            await editor.click();
            await page.keyboard.press("Control+End");
            await page.keyboard.press("Enter");
            await dialog.locator(".ql-toolbar button.ql-list[value=ordered]").click();
            await dialog.locator(".ql-toolbar button.ql-bold").click();
            await page.keyboard.type("أولًا");
            await page.keyboard.press("Enter");
            await page.keyboard.type("ثانيًا");
            await markClipboard(page);
            await dialog.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);

            const clipboard = await readClipboard(page);
            expect(clipboard.text?.startsWith(`${a.name}\n${RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence}`), clipboard.text ?? "").toBe(true);
            expect(clipboard.text?.endsWith(`${NOTE}\n1. أولًا\n2. ثانيًا`), clipboard.text ?? "").toBe(true);
            const parsed = await parseHtml(page, clipboard.html ?? "");
            const list = parsed.find(p => p.tag === "ol");
            expect(list, `an <ol> in ${clipboard.html}`).toBeDefined();
            const items = await page.evaluate(html => {
                const ol = new DOMParser().parseFromString(html, "text/html").querySelector("ol");
                return Array.from(ol?.querySelectorAll("li") ?? []).map(li => ({text: li.textContent, bold: li.querySelector("strong")?.textContent ?? null}));
            }, clipboard.html ?? "");
            expect(items).toEqual([{text: "أولًا", bold: "أولًا"}, {text: "ثانيًا", bold: "ثانيًا"}]);
            expect(parsed.filter(p => p.html.includes(`<strong>${a.name}</strong>`))).toHaveLength(1);
            await dialog.getByRole("button", {name: rt.close, exact: true}).click();
        });

    test("edits in the editor closed with «إغلاق» change no line, and reopening shows the original text again @RX-078",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const rx = new RxPage(page, rt);
            const {a, b, c} = await threeLines(page, rx, data, clinic);
            const lines = await rx.lineTexts();

            let dialog = await openEditor(page, rt);
            let editor = dialog.locator(".ql-editor");
            const original = await editor.innerHTML();
            await editor.click();
            await page.keyboard.press("Control+a");
            await page.keyboard.type("نص آخر");
            await expect(editor).not.toContainText(a.name);
            await dialog.getByRole("button", {name: rt.close, exact: true}).click();
            await expect(dialog).toBeHidden();
            await rx.expectLines(lines);

            dialog = await openEditor(page, rt);
            editor = dialog.locator(".ql-editor");
            await expect(editor.locator("strong")).toHaveText([a.name, b.name, c.name]);
            expect(await editor.innerHTML()).toBe(original);
            await dialog.getByRole("button", {name: rt.close, exact: true}).click();
            await expect(dialog).toBeHidden();
        });
});
