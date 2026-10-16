# Known bugs (found by the tests)

Status: collected during M1.6 phases A–C, fixed after M1.6 ([design D9](../design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)).

A known bug is an app behavior that contradicts a **clear** rule in the docs, found while writing a test. The test is
kept exactly as the doc says (never weakened to pass) and marked as a known bug; the bug is listed here. A rule the docs
don't settle is not a bug: it goes to the user's question list and the case keeps today's behavior.

## How to add an entry

1. Re-read the doc. If the doc is clear and the app disagrees, it is a bug.
2. Mark the test with the next free ID of your range (phase A: infra BUG-001…049; other tracks get their own range
   from the orchestrator):
   - xUnit: `[Fact(Skip = "BUG-012: <one line>")]` (or `[Theory(Skip = …)]`), keeping its `[Trait("Case", …)]` tags;
   - Vitest: `test.skip("BUG-112: <one line> @DOSE-012", …)`;
   - Playwright: `test.fixme("BUG-212: <one line> @RX-004", …)`.
3. Add a row below (a track writes `docs/testing/known-bugs.<track>.md` with the same table; the orchestrator folds it
   in). The orchestrator checks each entry (app vs doc) before accepting it.

Known-bug tests don't count against the gates: the traceability report counts their cases as covered-but-known-bug and
lists them; `artifacts/summary.md` shows the count.

## How to clear an entry (after M1.6)

One bug per commit: fix the app, remove the `Skip` / `.skip` / `.fixme` marker from every test that names the ID (they
must now pass, unchanged), delete the row here, and update the docs if the fix changes behavior.

## Entries

| ID | Case IDs | Doc line (link + quote) | What happens | How to reproduce | Severity |
|---|---|---|---|---|---|
| BUG-175 | ACC-072 | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess): "`useAuth()` exposes `meReady`, `meFailed`, `meRetrying`, `retryMe` (Retry shows progress)" | After `/me` failed, pressing «إعادة المحاولة» replaces the whole load error (and its button) with the page spinner; the button never shows its own progress. `meRetrying` (`meFailed && isFetching`) is never true: TanStack Query v5 resets a query without data to `pending` when it fetches again, so `meQuery.isError` (hence `meFailed`) is false while retrying. The page still recovers when `/me` answers. | Open `/drugs` with `/me` failing (network error or 5xx); after the load error shows, make `/me` answer slowly and press «إعادة المحاولة»: a full-page spinner shows instead of the load error with a loading Retry button. Test: `src/app/App.access.test.tsx` "BUG-175". | P1 |
