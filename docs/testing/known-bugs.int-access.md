# Known bugs: phase B, track int-access (ACC, ISO, ERR `api` cases)

Found by the M1.6.5 integration tests; to be folded into [known-bugs.md](known-bugs.md). Each one has a skipped xUnit
test (`Skip = "BUG-<id>: …"`) with the case IDs it proves.

| ID | Case IDs | Doc line (link + quote) | What happens | How to reproduce | Severity |
|---|---|---|---|---|---|
| BUG-350 | ERR-018 | [tech overview § Errors](../tech/overview.md#errors-problemdetails): "An id that is not a whole number (`/drugs/abc`) matches no route (`{id:int}`): `GET` → 404 `notFound`, other methods → 405 `methodNotAllowed`" | `PUT` and `DELETE /api/v1/drugs/abc` answer **404** `notFound`, and `/api/v1/drug-groups/abc` behaves the same (`PUT`/`DELETE` → 404). `POST` and `PATCH /api/v1/drugs/abc` do answer **405** `methodNotAllowed`. Cause: the method check gives 405 only when no candidate route supports the method (the SPA fallback matches only GET/HEAD); the `{id:int}` route supports GET/PUT/DELETE, so those methods reach its constraint, fail it and fall through to 404. The doc sentence holds only for the methods the `{id:int}` route lacks (unknown routes: `POST /api/v1/unknown` → 405, ERR-016, as documented). Seen in the `Testing` environment, with and without a `wwwroot` (the SPA fallback is mapped either way). Either the app or the doc (and ERR-018) must change: the 404 is arguably the better answer | Owner token: `PUT /api/v1/drugs/abc` with `{"name":"x"}` → 404 ProblemDetails. Test: `Errors/RoutingTests.cs` "BUG-350" | P2 |
