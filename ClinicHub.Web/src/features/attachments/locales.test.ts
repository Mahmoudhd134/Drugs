import {describe, expect, test} from "vitest";
import ar from "../../i18n/locales/ar.ts";
import en from "../../i18n/locales/en.ts";

// The attachments block of the locale files: contract § 2 "Screen structure and names", "Sizes and texts".

/** Every key the contract's screen structure and sizes name. */
const CONTRACT_KEYS = [
    "pick", "pickOne", "dropHint", "dropHintOne", "dropNow", "selectedLabel", "storedLabel", "upload", "download", "downloadAll",
    "empty", "listFailed", "rulesFailed", "removeFile", "cancelFile", "retryFile", "previewFile", "downloadFile", "replaceFile",
    "deleteFile", "uploadingFile", "uploadedFile", "failedFile", "refused", "tooMany", "onlyOne", "folderRefused", "deleteTitle",
    "deleteMessage", "deleted", "replaced", "previewOf", "noPreview", "cantShow", "textCut", "sizeB", "sizeKb", "sizeMb", "sizeGb",
];

const enTexts = en.attachments as Record<string, string>;
const arTexts = ar.attachments as Record<string, string>;

/** Its interpolations, in any order: `{{name}}`, `{{count, count}}`. */
const variables = (text: string) => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1]).sort();

const SOURCES = Object.entries(import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
    query: "?raw", import: "default", eager: true,
}));

describe("attachments texts @area:attachments", () => {
    test("every attachments key exists in en.ts and in ar.ts, with a text @ATT-256", () => {
        expect(Object.keys(arTexts).sort()).toEqual(Object.keys(enTexts).sort());
        for (const [key, text] of [...Object.entries(enTexts), ...Object.entries(arTexts)]) expect(text.trim(), key).not.toBe("");
    });

    test("every key the contract names is there @ATT-256", () => {
        expect(Object.keys(enTexts)).toEqual(expect.arrayContaining(CONTRACT_KEYS));
    });

    test("a text has the same interpolations in both files @ATT-256", () => {
        for (const key of Object.keys(enTexts)) expect(variables(arTexts[key]), key).toEqual(variables(enTexts[key]));
    });

    test("every attachments key the feature's code names exists in both files @ATT-256", () => {
        const used = SOURCES.flatMap(([, source]) => [...source.matchAll(/(["'`])attachments\.(\w+)\1/g)].map(match => match[2]));
        for (const key of used) {
            expect(enTexts[key], `en: ${key}`).toBeTypeOf("string");
            expect(arTexts[key], `ar: ${key}`).toBeTypeOf("string");
        }
    });

    test("the messages the business file's table quotes, and the refusals they come from @ATT-256", () => {
        expect(ar.attachments.noPreview).toBe("لا تتوفر معاينة لهذا النوع من الملفات. يمكنك تنزيله.");
        expect(ar.errors.attachmentTypeNotAllowed).toBe("نوع هذا الملف غير مسموح به.");
        expect(ar.errors.attachmentTooLarge).toBe("حجم هذا الملف أكبر من المسموح به.");
        expect(ar.errors.attachmentEmpty).toBe("هذا الملف فارغ.");
        expect(ar.errors.notFound).toBe("هذا العنصر لم يعد موجودًا.");
    });
});
