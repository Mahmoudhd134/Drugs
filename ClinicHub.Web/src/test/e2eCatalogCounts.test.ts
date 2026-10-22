import {describe, expect, test} from "vitest";

/*
 * CAT-229 (design M1.7 D12): the imported catalog is shared by every test of an e2e run, so no spec holds a literal
 * count of it (the global total 23,414, the number of categories or subcategories, or a search's, category's or
 * subcategory's count such as 219, 203, 91 or 1,469): count specs compare the screen with the API's answer of the same
 * run. The numbers below are the catalog's documented counts (design § 8, D7; test cases CAT-055, CAT-072, CAT-073,
 * CAT-074; M1.7b contract § 1c); the literal values are asserted at the api level only.
 */

/** Catalog counts that must never be a count literal in an e2e spec. */
const CATALOG_COUNTS = [23414, 23410, 23, 182, 2286, 219, 207, 203, 91, 1469, 1054, 747, 3394, 541, 276, 34];

/** Calls that assert or render a count: Playwright's `toHaveCount`, the texts' count helpers (`displayedRows`, …). */
const COUNT_CALL = /\b(toHaveCount|displayedRows|results|[A-Za-z]*[Ss]ubtitle|[A-Za-z]*[Cc]ount|[A-Za-z]*Total)\s*\(([^()]*)\)/g;
/** String and template literals. */
const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

const asNumber = (digits: string) => Number(digits.replace(/,/g, ""));

/** The offending pieces of a spec's source: catalog counts as count-call arguments, or inside a string as a number. */
const catalogCountLiterals = (spec: string): string[] => {
    const found: string[] = [];
    // Comments and case tags (@AUTH-182) are not counts
    const source = spec.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'`])\/\/.*$/gm, "").replace(/@[A-Z0-9]+-\d+/g, "");
    for (const [call, , args] of source.matchAll(COUNT_CALL)) {
        for (const [number] of args.matchAll(/(?<![\w.])\d[\d,_]*(?![\w.])/g)) {
            if (CATALOG_COUNTS.includes(asNumber(number.replace(/_/g, "")))) found.push(call);
        }
    }
    for (const [literal, , body] of source.matchAll(LITERAL)) {
        for (const [number] of body.matchAll(/(?<![\w,.-])\d{1,3}(?:,\d{3})+(?![\w,])|(?<![\w,.-])\d{3,5}(?![\w,.])/g)) {
            if (CATALOG_COUNTS.includes(asNumber(number))) found.push(literal);
        }
    }
    return found;
};

describe("e2e specs never hold a literal count of the imported catalog @area:infra", () => {
    test("the check finds catalog counts in count assertions and texts, and lets the API's answer through @CAT-229", () => {
        expect(catalogCountLiterals(`await expect(rows).toHaveCount(23);`)).toHaveLength(1);
        expect(catalogCountLiterals(`await expect(page.getByText(ct.displayedRows(1, 20, 23414))).toBeVisible();`)).toHaveLength(1);
        expect(catalogCountLiterals(`await expect(page.getByText("إجمالي الأدوية: 23,414")).toBeVisible();`)).toHaveLength(1);
        expect(catalogCountLiterals("expect(page.getByText(`النتائج: 219`)).toBeVisible();")).toHaveLength(1);
        expect(catalogCountLiterals(`expect(u.results(1_469)).toBe(x);`)).toHaveLength(1);
        expect(catalogCountLiterals(`await expect(page.getByText("العيون: 541")).toBeVisible();`)).toHaveLength(1);
        // Numbers read from the API in the same run, and unrelated numbers, pass
        expect(catalogCountLiterals(`const total = (await api.ok("GET", "/api/v1/drugs?search=amox")).totalCount;
            await expect(page.getByText(u.results(total))).toBeVisible();
            await expect(rows).toHaveCount(20);
            await createDrugs(data, clinic, Array.from({length: 25}, (_, i) => \`Bulk \${i}\`));
            await page.setViewportSize({width: 375, height: 812});`)).toEqual([]);
    });

    test("no e2e spec holds a literal count of the imported catalog (compare with the API's answer instead) @CAT-229", () => {
        const specs = Object.entries(import.meta.glob<string>("../../e2e/**/*.spec.ts", {query: "?raw", import: "default", eager: true}));
        expect(specs.length, "the specs are read").toBeGreaterThan(30);
        const offenders = specs.flatMap(([file, source]) => catalogCountLiterals(source).map(piece => `${file}: ${piece}`));
        expect(offenders).toEqual([]);
    });
});
