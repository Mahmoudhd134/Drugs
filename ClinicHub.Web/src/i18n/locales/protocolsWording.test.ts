import {describe, expect, test} from "vitest";
import indexHtml from "../../../index.html?raw";
import ar from "./ar.ts";
import en from "./en.ts";
import rxTextAr from "./rxTextAr.ts";

// Groups renamed to protocols: design M1.7 D10 ("Texts": «المجموعات» → «البروتوكولات», «مجموعة» → «بروتوكول», also in
// titles, aria-labels and tooltips) and the M1.7a contract "Every changed locale text" (after the change no locale
// string contains «مجموعة», «مجموعات», «المجموعات» or «مجموع», nor "group" in any case).

type Tree = { [key: string]: string | Tree };

/** Every text of a locale tree by its dotted key. */
const flatten = (tree: Tree, prefix = ""): [string, string][] =>
    Object.entries(tree).flatMap(([key, value]) =>
        typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : flatten(value, `${prefix}${key}.`));

const LOCALES = {en: flatten(en as unknown as Tree), ar: flatten(ar as unknown as Tree), rxTextAr: flatten(rxTextAr as unknown as Tree)};
const GROUP_AR = /مجموع/;
const GROUP_EN = /group/i;

/** The entries of every locale file whose text matches `pattern`, as "file key: text". */
const leftovers = (pattern: RegExp, keys: (key: string) => boolean = () => true) =>
    Object.entries(LOCALES).flatMap(([file, texts]) =>
        texts.filter(([key, text]) => keys(key) && pattern.test(text)).map(([key, text]) => `${file} ${key}: ${text}`));

describe("protocols: no «مجموعة» or \"group\" left in the UI texts @area:i18n", () => {
    test("every string of en.ts, ar.ts and rxTextAr.ts: no «مجموع» and no \"group\" in any case @GRP-102", () => {
        expect(LOCALES.en.length).toBeGreaterThan(300);
        expect(LOCALES.ar.length).toBe(LOCALES.en.length);
        expect(LOCALES.rxTextAr.length).toBeGreaterThan(50);
        expect(leftovers(GROUP_AR)).toEqual([]);
        expect(leftovers(GROUP_EN)).toEqual([]);
    });

    test("the renamed texts say «البروتوكولات» / \"Protocols\" (sidebar, page title, prescription tab, role editor) @GRP-102", () => {
        const text = (file: "en" | "ar", key: string) => LOCALES[file].find(([k]) => k === key)?.[1];
        for (const key of ["nav.protocols", "protocols.title", "prescription.tabProtocols", "permissionResources.protocols"]) {
            expect(text("ar", key), key).toBe("البروتوكولات");
            expect(text("en", key), key).toBe("Protocols");
        }
    });

    test("the page title, and every locale text used as a title, label, tooltip, hint or error: no \"group\" / «مجموعة» @GRP-104", () => {
        expect(indexHtml.match(/<title>([^<]*)<\/title>/)?.[1]).toBe("Clinic Drugs");
        expect(indexHtml).not.toMatch(GROUP_EN);
        // The accessible names and tooltips come from these keys (errors.* are the toasts and field errors)
        const labelLike = (key: string) =>
            /(^errors\.|title|label|aria|tooltip|hint|info|placeholder|name|tab|nav\.|permission)/i.test(key);
        const checked = leftovers(/[\s\S]/, labelLike).length;
        expect(checked).toBeGreaterThan(100);
        expect(leftovers(GROUP_AR, labelLike)).toEqual([]);
        expect(leftovers(GROUP_EN, labelLike)).toEqual([]);
    });

    test("no app source sets a hard-coded document.title, aria-label, title or tooltip text with \"group\" / «مجموعة» @GRP-104", () => {
        const sources = Object.entries(import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}", "!../../test/**", "!../../i18n/locales/**"], {
            query: "?raw", import: "default", eager: true,
        }));
        expect(sources.length).toBeGreaterThan(50);
        const literal = /(document\.title\s*=|aria-label\s*=|\btitle\s*[=:]|\blabel\s*[=:]|placeholder\s*[=:]|aria-description\s*=)\s*\{?\s*(["'`])((?:(?!\2).)*)\2/g;
        const found = sources.flatMap(([file, text]) => [...text.matchAll(literal)].map(m => ({file, text: m[3], match: m[0]})));
        // The scan sees the hard-coded texts there are (the language names of the language menu)
        expect(found.map(f => f.text)).toEqual(expect.arrayContaining(["English", "العربية"]));
        const offenders = found.filter(f => GROUP_EN.test(f.text) || GROUP_AR.test(f.text)).map(f => `${f.file}: ${f.match}`);
        expect(offenders).toEqual([]);
    });
});
