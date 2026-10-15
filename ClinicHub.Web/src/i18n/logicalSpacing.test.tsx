import {describe, expect, test} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithProviders} from "../test";
import {AppShell} from "../components/layout/AppShell.tsx";
import {patientWaits} from "../test/fe-access/patience.ts";

// RTL spacing: docs/tech/overview.md "Internationalization (UI text only)": logical properties (marginInlineStart…)
// or left/right; the ms/me/ps/pe shorthands are not applied by this MUI version (they render as zero).

patientWaits();

/** Every app source file (tests and test helpers aside), as text. */
const SOURCES = Object.entries(import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../test/**"], {
    query: "?raw", import: "default", eager: true,
}));

/** An `sx` spacing key written with a shorthand that renders as zero: `ms: 1`, `pe: {xs: 1}`, `me: "auto"`… */
const SHORTHAND = /\b(ms|me|ps|pe)\s*:\s*(-?\d|\{|"|'|`)/g;

describe("RTL spacing @area:i18n", () => {
    test("no ms/me/ps/pe shorthand anywhere: spacing is written with logical properties, mirrored in RTL @I18N-007", () => {
        expect(SOURCES.length).toBeGreaterThan(50);
        const offenders = SOURCES.flatMap(([file, text]) => [...text.matchAll(SHORTHAND)].map(m => `${file}: ${m[0]}`));
        expect(offenders).toEqual([]);
        // The logical properties are what the app uses instead
        const logical = SOURCES.filter(([, text]) => /\b(margin|padding|border)Inline(Start|End)\b/.test(text));
        expect(logical.length).toBeGreaterThan(5);
    });

    test("in Arabic the app bar's spacing keeps its logical properties (the RTL style plugin leaves them to the browser) @I18N-007", async () => {
        await renderWithProviders(<AppShell homeTo="/" homeLabel="Home" contextLabel="A" contextTitle="A" navItems={[]}/>, {lang: "ar"});
        const css = Array.from(document.querySelectorAll("style")).map(style => style.textContent).join("\n");
        const menu = screen.getByRole("button", {name: "فتح القائمة"});
        const rule = [...menu.classList].map(name => css.match(new RegExp(`\\.${name}\\{([^}]*)\\}`))?.[1]).find(Boolean) ?? "";
        expect(rule).toMatch(/margin-inline-end:\s*8px/);
        expect(document.documentElement).toHaveAttribute("dir", "rtl");
    });
});
