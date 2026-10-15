# Known bugs: frontend stage 2, track fe-access (AUTH, ACC, ISO, ERR, I18N, UX `ui` cases)

Found by the M1.6.3 component tests; to be folded into [known-bugs.md](known-bugs.md). Each one has a skipped Vitest
test named `BUG-<id>: …` with the case IDs it proves.

| ID | Cases | Doc line | What happens | How to reproduce | Severity |
|---|---|---|---|---|---|
| BUG-175 | ACC-072 | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess): "`useAuth()` exposes `meReady`, `meFailed`, `meRetrying`, `retryMe` (Retry shows progress)" | After `/me` failed, pressing «إعادة المحاولة» replaces the whole load error (and its button) with the page spinner; the button never shows its own progress. `meRetrying` (`meFailed && isFetching`) is never true: TanStack Query v5 resets a query without data to `pending` when it fetches again, so `meQuery.isError` (hence `meFailed`) is false while retrying. The page still recovers when `/me` answers. | Open `/drugs` with `/me` failing (network error or 5xx); after the load error shows, make `/me` answer slowly and press «إعادة المحاولة»: a full-page spinner shows instead of the load error with a loading Retry button. Test: `src/app/App.access.test.tsx` "BUG-175". | P1 |
