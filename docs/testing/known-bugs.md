# Known bugs (found by the tests)

Status: all entries found during M1.6 (the tests, and the final review: BUG-621) were fixed after M1.6 (2026-10-18), one per commit ([design D9](../design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)); the Entries table is empty.

A known bug is an app behavior that contradicts a **clear** rule in the docs, found while writing a test. The test is
kept exactly as the doc says (never weakened to pass) and marked as a known bug; the bug is listed here. A rule the docs
don't settle is not a bug: it goes to the user's question list and the case keeps today's behavior.

From the end of M1.6, a bug a new test finds in the feature being built is fixed with that feature, in the same step,
and never listed here. Only a bug that can't be fixed there (outside the step's scope, or deferred by the user) gets an
entry ([testing README § Known bugs](README.md#known-bugs)).

## How to add an entry

1. Re-read the doc. If the doc is clear and the app disagrees, it is a bug.
2. Mark the test with the next free ID (IDs are never reused: take the next number above the highest one in this file
   and in its history, `git log -p -- docs/testing/known-bugs.md`). The test **runs and is expected to fail** (M1.6
   final review, 2026-10-16), so a fixed bug is noticed: the test then passes, and an expected failure that passes
   fails the run:
   - Vitest: `test.fails("BUG-612: <one line> @DOSE-012", …)`;
   - Playwright: `test.fail("BUG-612: <one line> @RX-004", …)` (a known bug seen in some projects only: a conditional
     `test.fail(condition, "BUG-612: …")` inside the test, or a conditional `test.skip(condition, "<why> (BUG-612)")` at
     the top of the `test.fail` test for the projects where it doesn't show); an
     axe finding: a `KNOWN_AXE` entry in `ClinicHub.Web/e2e/support/checks.ts`, limited to the rule and the elements
     the row documents (every page check lets it through), and the bug's own test checks the page with
     `expectHealthyPage(page, lang, testInfo, {onlyBug: "BUG-612"})`: it fails on that bug only, never on another
     known bug of the same page;
   - xUnit has no expected-failure marker: `[Fact(Skip = "BUG-612: <one line>")]` (or `[Theory(Skip = …)]`), a plain
     string literal, keeping its `[Trait("Case", …)]` tags.
3. Add a row below. Whoever validates the step checks the entry (app vs doc) before accepting it.

Known-bug tests don't count against the gates: the traceability report counts their cases as covered with known bug
(also when a passing test covers the same case) and lists them; `artifacts/summary.md` lists the known-bug tests of
xUnit, Vitest and Playwright and their IDs.

## How to clear an entry

One bug per commit: fix the app, turn every test that names the ID back into a plain test (`test.fails` / `test.fail`
→ `test`, remove the xUnit `Skip`; also the `onlyBug` option) and delete its `KNOWN_AXE` entry: they must now pass,
unchanged otherwise. Delete the row here, and update the docs if the fix changes behavior. (Until then, an
expected-failure test that passes fails the run: the bug was fixed by another change, so clear it the same way.)

## Entries

| ID | Case IDs | Doc line (link + quote) | What happens | How to reproduce | Severity |
|---|---|---|---|---|---|
