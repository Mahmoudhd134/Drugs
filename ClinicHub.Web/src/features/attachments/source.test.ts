import {describe, expect, test} from "vitest";

// Custom UI means React elements, never an HTML string (design § 12): a file name is user data.

const SOURCES = Object.entries(import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
    query: "?raw", import: "default", eager: true,
}));

/** The source without its comments: a comment may name what the code must never do. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'`])\/\/.*$/gm, "");

describe("the feature's source @area:attachments", () => {
    test("the search reads the four components and the hook", () => {
        const files = SOURCES.map(([file]) => file);
        expect(files).toEqual(expect.arrayContaining([
            "./components/AttachmentManager.tsx",
            "./components/AttachmentPicker.tsx",
            "./components/AttachmentList.tsx",
            "./components/AttachmentPreview.tsx",
            "./useAttachments.ts",
            "./functions.ts",
        ]));
    });

    test("none uses dangerouslySetInnerHTML, nor sets innerHTML itself @ATT-252", () => {
        const offenders = SOURCES.filter(([, source]) => /dangerouslySetInnerHTML|\.innerHTML|srcDoc/.test(code(source))).map(([file]) => file);
        expect(offenders).toEqual([]);
    });
});
