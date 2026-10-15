# Catalog integration tests

DRUG, GRP, DOSE and TAPER (catalog): `api` cases of the [test catalog](../../../docs/testing/test-catalog.md); classes tagged `[Trait("Area", "catalog")]`.
Add a collection here like `Auth/AuthCollection.cs` (name `catalog`, then `catalog-2`… to run more in parallel).
How to write them: [docs/testing/README.md](../../../docs/testing/README.md#integration-tests-testsclinichubintegrationtests).

Note for Int-4: DOSE-065 ("all fields empty → normalize returns null **and the drug stores `defaultDosing: null`**") is
a `unit` case, and the unit tests only prove the first half (`DosingRules.Normalize` returns null). The second half is
an API outcome: assert it in a drug test (create or update a drug with an all-empty `defaultDosing`, then `GET` it →
`defaultDosing: null`). The traceability tool counts a case only at its catalog level, so ask the orchestrator to make
the row `unit+api` before tagging that test `DOSE-065`.
