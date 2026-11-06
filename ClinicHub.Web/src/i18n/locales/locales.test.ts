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
        // {{name}}/{{names}}/{{from}}/{{to}} are clinic content (drug, protocol, clinic, role, staff names), except the
        // pagination's numbers, the permission labels of "Needed by" and the tree node's accessible name (decision C27:
        // an accessible name, not a displayed sentence; the e2e locators match it from its start)
        const notNames = new Set(["common.displayedRows", "roles.editor.requiredBy", "drugTree.nodeLabel"]);
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
        // The tree node's accessible name, without isolates (contract M1.7c § 3.1, decisions C8 and C27)
        expect(arTexts["drugTree.nodeLabel"]).toBe("{{name}}، {{count, count}}");
        expect(enTexts["drugTree.nodeLabel"]).toBe("{{name}}, {{count, count}}");
    });

    test("every API error code has its text, except the transport codes and noContexts @ERR-030", () => {
        // The codes of the API's Error definitions (docs/tech/overview.md "Errors", the features' tech.md "API")
        const codes = [
            "notFound", "forbidden", "tooManyRequests", "nameRequired", "nameInvalid", "nameTooLong", "invalidText",
            "noAccess", "clinicSuspended", "staffInactive", "invalidPhone", "invalidCode", "codeExpired", "tooManyAttempts",
            "drugsRequired", "drugNotFound", "invalidDosing", "duplicateProtocolItem",
            "roleNameTaken", "unknownPermission", "roleLocked", "roleInUse", "rolesRequired", "roleNotFound", "staffExists", "lastOwner",
            // The shared catalog (design M1.7 § 7; M1.7b contract § 2.4)
            "sharedDrugReadOnly", "categoryRequired", "categoryNotFound", "subCategoryNotFound", "textTooLong", "drugWithdrawn",
            "categoryNameTaken", "subCategoryNameTaken", "categoryInUse", "subCategoryInUse",
            // The print templates (contract § 3.1)
            "templateLayoutInvalid", "templateTextCount", "templatePageInvalid", "templateItemOutsidePage", "templateItemSizeInvalid",
            "templateFontSizeInvalid", "templateItemNameTaken", "templateStaticTextRequired", "templateStaticTextTooLong", "templateTooManyItems",
            "templateCalibrationInvalid",
            // The attachments (design attachments § 5)
            "attachmentTypeNotAllowed", "attachmentTooLarge", "attachmentEmpty",
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

describe("print template error texts @area:admin", () => {
    test.each([
        ["templateLayoutInvalid", "The template's data isn't valid.", "بيانات القالب غير صحيحة."],
        ["templateTextCount", "The template must hold the prescription text exactly once.", "يجب أن يحتوي القالب على نص الروشتة مرة واحدة."],
        ["templatePageInvalid", "The sheet size isn't valid.", "مقاس الورقة غير صحيح."],
        ["templateItemOutsidePage", "The item is outside the sheet.", "العنصر خارج حدود الورقة."],
        ["templateItemSizeInvalid", "The item is smaller than the allowed size.", "مقاس العنصر أصغر من الحد المسموح."],
        ["templateFontSizeInvalid", "The font size must be between 6 and 36.", "حجم الخط يجب أن يكون بين 6 و36."],
        ["templateItemNameTaken", "Another item already uses this name.", "هذا الاسم مستخدم في عنصر آخر."],
        ["templateStaticTextRequired", "Enter the text.", "اكتب النص."],
        ["templateStaticTextTooLong", "The text is longer than 1000 characters.", "النص أطول من 1000 حرف."],
        ["templateTooManyItems", "A template can't have more than 50 items.", "لا يمكن إضافة أكثر من 50 عنصرًا."],
        ["templateCalibrationInvalid", "The correction must be between −20 and +20 mm.", "يجب أن يكون التصحيح بين −20 و+20 مم."],
    ])("errors.%s is in both files, with the contract's text @TPL-244", (code, en, ar) => {
        expect(enTexts[`errors.${code}`]).toBe(en);
        expect(arTexts[`errors.${code}`]).toBe(ar);
    });
});

describe("print template step 4 texts @area:admin", () => {
    test.each([
        ["printTemplates.calibration.title", "Printer correction", "تصحيح الطابعة"],
        ["printTemplates.calibration.x", "X: + moves right (mm)", "X: الموجب يمين (مم)"],
        ["printTemplates.calibration.y", "Y: + moves down (mm)", "Y: الموجب أسفل (مم)"],
        ["printTemplates.calibration.helper", "For example: if the print landed 2 mm too low, type Y = −2.", "مثال: إذا نزلت الطباعة 2 مم عن مكانها فاكتب Y = −2."],
        ["printTemplates.calibration.cutWarning", "With this correction, one or more items leave the sheet and their text may be cut.", "بهذا التصحيح يخرج عنصر أو أكثر عن الورقة وقد يُقص نصه."],
        ["printTemplates.testPrint.button", "Test print", "طباعة تجريبية"],
        ["printTemplates.testPrint.hint", "Print at 100%, without \"Fit to page\".", "اطبع بمقياس 100% دون «ملاءمة للصفحة»."],
        ["printTemplates.paper.title", "Paper image", "صورة الورقة"],
        ["printTemplates.paper.rules", "{{types}}, up to {{size}}. One image per clinic.", "{{types}}، حتى {{size}}، صورة واحدة لكل عيادة."],
        ["printTemplates.paper.show", "Show the image", "إظهار الصورة"],
        ["printTemplates.paper.opacity", "Image opacity", "شفافية الصورة"],
        ["printTemplates.paper.loadFailed", "Couldn't show the paper image.", "تعذر عرض صورة الورقة."],
    ])("%s is in both files, with the contract's text @TPL-704 @TPL-686", (key, english, arabic) => {
        expect(enTexts[key]).toBe(english);
        expect(arTexts[key]).toBe(arabic);
    });
});

describe("attachment error texts @area:attachments", () => {
    test.each([
        ["attachmentTypeNotAllowed", "This file type isn't allowed.", "نوع هذا الملف غير مسموح به."],
        ["attachmentTooLarge", "This file is larger than allowed.", "حجم هذا الملف أكبر من المسموح به."],
        ["attachmentEmpty", "This file is empty.", "هذا الملف فارغ."],
    ])("errors.%s is in both files, with the business file's text @ATT-181", (code, english, arabic) => {
        expect(enTexts[`errors.${code}`]).toBe(english);
        expect(arTexts[`errors.${code}`]).toBe(arabic);
    });
});

describe("print texts @area:prescription", () => {
    test.each([
        ["prescription.print", "Print", "طباعة"],
        ["printTemplates.print.title", "Print the prescription", "طباعة الروشتة"],
        ["printTemplates.print.hint", "Print at 100%, without \"Fit to page\".", "اطبع بمقياس 100% دون «ملاءمة للصفحة»."],
        ["printTemplates.print.gone", "This clinic no longer has a print template.", "لم يعد لهذه العيادة قالب طباعة."],
        ["prescription.editorTitle", "Edit before copying or printing", "تعديل قبل النسخ أو الطباعة"],
        ["prescription.editorHint", "For copying or printing; changes are not saved.", "للنسخ أو الطباعة؛ التعديلات لا تُحفظ."],
        ["printTemplates.toolbar.undo", "Undo", "تراجع"],
        ["printTemplates.toolbar.redo", "Redo", "إعادة"],
        ["printTemplates.toolbar.zoomOut", "Zoom out", "تصغير"],
        ["printTemplates.toolbar.zoomIn", "Zoom in", "تكبير"],
        ["printTemplates.toolbar.fit", "Fit", "ملاءمة"],
    ])("%s is in both files, with the contract's text @I18N-011", (key, english, arabic) => {
        expect(enTexts[key]).toBe(english);
        expect(arTexts[key]).toBe(arabic);
    });

    test("the printed date's words are the same Arabic in both files: twelve months, seven days, ص and م @I18N-011", () => {
        const values = (texts: Record<string, string>) => Object.entries(texts).filter(([key]) => key.startsWith("rxText.printValues."));
        expect(values(enTexts)).toEqual(values(arTexts));
        expect(values(arTexts)).toHaveLength(21);
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
        expect(arTexts["permissionModules.catalog"]).toBe("الأدوية والبروتوكولات");
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

    test("first visit: any Arabic browser locale gives Arabic, else English; then the stored choice @I18N-021", async () => {
        expect((await startApp(null, ["ar-SA"])).resolvedLanguage).toBe("ar");
        expect((await startApp(null, ["en-GB"])).resolvedLanguage).toBe("en");
        expect((await startApp(null, ["fr-FR"])).resolvedLanguage).toBe("en");
        expect((await startApp("ar", ["en-US"])).resolvedLanguage).toBe("ar");
        vi.resetModules();
    });
});
