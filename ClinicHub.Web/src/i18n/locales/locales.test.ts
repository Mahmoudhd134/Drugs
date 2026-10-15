import {describe, expect, test, vi} from "vitest";
import {PERMISSIONS} from "../../features/access/permissions.ts";
import {PERMISSION_CATALOG} from "../../test";
import ar from "./ar.ts";
import en from "./en.ts";
import rxTextAr from "./rxTextAr.ts";

// Rules: docs/tech/overview.md "Internationalization (UI text only)", "Conventions"; access/tech.md "Frontend".

type Tree = { [key: string]: string | Tree };

/** Every text of a locale file by its dotted key. */
const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => (
        typeof value === "string"
            ? {...all, [`${prefix}${key}`]: value}
            : {...all, ...flatten(value, `${prefix}${key}.`)}
    ), {});

const enTexts = flatten(en as unknown as Tree);
const arTexts = flatten(ar as unknown as Tree);
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

describe("locale files @area:i18n", () => {
    test("every key of en.ts is in ar.ts and back, and rxText is the same Arabic in both @I18N-011 @smoke", () => {
        expect(Object.keys(arTexts).sort()).toEqual(Object.keys(enTexts).sort());
        // No forgotten translation (rxText.eye.none is empty on purpose: no eye, no words)
        for (const [key, value] of Object.entries(arTexts)) if (key !== "rxText.eye.none") expect(value.trim(), key).not.toBe("");
        expect(en.rxText).toBe(rxTextAr);
        expect(ar.rxText).toBe(rxTextAr);
    });

    test("every plural family has the six Arabic plural forms in both files @I18N-012", () => {
        for (const texts of [enTexts, arTexts]) {
            const families = new Set(Object.keys(texts)
                .filter(key => PLURAL_SUFFIXES.some(s => key.endsWith(s)))
                .map(key => key.replace(/_(zero|one|two|few|many|other)$/, "")));
            expect(families.size).toBeGreaterThan(10);
            for (const family of ["rxText.dose.drop", "rxText.frequency.daily", "rxText.duration.weeks", "dosing.taper.totalDays", "dosing.taper.totalWeeks"])
                expect(families.has(family), family).toBe(true);
            for (const family of families)
                for (const suffix of PLURAL_SUFFIXES) expect(texts[`${family}${suffix}`], `${family}${suffix}`).toBeTypeOf("string");
        }
    });

    test("a name interpolated in a message sits inside the bidi isolates U+2068…U+2069 @I18N-017", () => {
        // {{name}}/{{names}}/{{from}}/{{to}} are clinic content (drug, group, clinic, role, staff names), except the
        // pagination's numbers and the permission labels of "Needed by"
        const notNames = new Set(["common.displayedRows", "roles.editor.requiredBy"]);
        let checked = 0;
        for (const texts of [enTexts, arTexts]) {
            for (const [key, value] of Object.entries(texts)) {
                if (notNames.has(key)) continue;
                for (const match of value.matchAll(/\{\{(name|names|from|to)\}\}/g)) {
                    checked++;
                    const at = match.index;
                    expect(value[at - 1], `${key}: ${value}`).toBe("\u2068");
                    expect(value[at + match[0].length], `${key}: ${value}`).toBe("\u2069");
                }
            }
        }
        expect(checked).toBeGreaterThan(30);
        // {{clinics}} is a list of names, each quoted by common.quotedName
        expect(enTexts["common.quotedName"]).toBe("“\u2068{{name}}\u2069”");
        expect(arTexts["common.quotedName"]).toBe("«\u2068{{name}}\u2069»");
    });

    test("the names not checked are not names", () => {
        expect(arTexts["roles.editor.requiredBy"]).toBe("مطلوبة لـ: {{names}}");
        expect(enTexts["common.displayedRows"]).toBe("{{from}}–{{to}} of {{count}}");
    });

    test("every API error code has its text, except the transport codes and noContexts @ERR-030", () => {
        // The codes of the API's Error definitions (docs/tech/overview.md "Errors", the features' tech.md "API")
        const codes = [
            "notFound", "forbidden", "tooManyRequests", "nameRequired", "nameInvalid", "nameTooLong", "invalidText",
            "noAccess", "clinicSuspended", "staffInactive", "invalidPhone", "invalidCode", "codeExpired", "tooManyAttempts",
            "drugsRequired", "drugNotFound", "invalidDosing", "duplicateGroupItem",
            "roleNameTaken", "unknownPermission", "roleLocked", "roleInUse", "rolesRequired", "roleNotFound", "staffExists", "lastOwner",
        ];
        for (const code of codes) {
            expect(enTexts[`errors.${code}`], `en errors.${code}`).toBeTypeOf("string");
            expect(arTexts[`errors.${code}`], `ar errors.${code}`).toBeTypeOf("string");
        }
        for (const code of ["unauthorized", "invalidRequest", "conflict", "methodNotAllowed", "unexpected", "noContexts"]) {
            expect(enTexts[`errors.${code}`]).toBeUndefined();
            expect(arTexts[`errors.${code}`]).toBeUndefined();
        }
    });
});

describe("permission keys and labels @area:access", () => {
    const spaKeys = Object.values(PERMISSIONS).flatMap(resource => Object.values(resource) as string[]);

    test("permissions.ts holds exactly the backend's 11 keys @ACC-008", () => {
        expect(spaKeys.sort()).toEqual(PERMISSION_CATALOG.map(p => p.key).sort());
        expect(spaKeys).toHaveLength(11);
    });

    test("every permission, resource and module has its label in both files @ACC-009", () => {
        for (const texts of [enTexts, arTexts]) {
            for (const {key, resource, module} of PERMISSION_CATALOG) {
                expect(texts[`permissions.${key}`], key).toBeTypeOf("string");
                expect(texts[`permissionResources.${resource}`], resource).toBeTypeOf("string");
                expect(texts[`permissionModules.${module}`], module).toBeTypeOf("string");
            }
        }
        expect(arTexts["permissions.drugs.delete"]).toBe("حذف الأدوية");
        expect(arTexts["permissions.prescriptions.create"]).toBe("كتابة الروشتات");
        expect(arTexts["permissionModules.catalog"]).toBe("الأدوية والمجموعات");
        expect(enTexts["permissionModules.prescription"]).toBe("Prescription");
    });
});

describe("language on start @area:i18n", () => {
    /** A fresh copy of the app's i18n set-up (src/i18n/index.ts), as on page load. */
    const startApp = async (stored: string | null, browserLanguages: string[]) => {
        if (stored === null) localStorage.removeItem("language");
        else localStorage.setItem("language", stored);
        vi.spyOn(navigator, "languages", "get").mockReturnValue(browserLanguages);
        vi.spyOn(navigator, "language", "get").mockReturnValue(browserLanguages[0]);
        vi.resetModules();
        return (await import("../index.ts")).default;
    };

    test("a stored unsupported language: the browser's when supported, else English, no error @I18N-022", async () => {
        const errors = vi.spyOn(console, "error");
        const arabicBrowser = await startApp("fr", ["ar-EG", "en-US"]);
        expect(arabicBrowser.resolvedLanguage).toBe("ar");
        expect(document.documentElement.lang).toBe("ar");
        expect(document.documentElement.dir).toBe("rtl");

        const germanBrowser = await startApp("fr", ["de-DE"]);
        expect(germanBrowser.resolvedLanguage).toBe("en");
        expect(document.documentElement.lang).toBe("en");
        expect(document.documentElement.dir).toBe("ltr");
        expect(errors).not.toHaveBeenCalled();
    });

    test("first visit: any Arabic browser locale gives Arabic, else English; then the stored choice", async () => {
        expect((await startApp(null, ["ar-SA"])).resolvedLanguage).toBe("ar");
        expect((await startApp(null, ["en-GB"])).resolvedLanguage).toBe("en");
        expect((await startApp("ar", ["en-US"])).resolvedLanguage).toBe("ar");
        vi.resetModules();
    });
});
