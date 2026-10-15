# Catalog integration tests

DRUG, GRP, DOSE and TAPER (catalog): `api` cases of the [test catalog](../../../docs/testing/test-catalog.md); classes tagged `[Trait("Area", "catalog")]`.
Add a collection here like `Auth/AuthCollection.cs` (name `catalog`, then `catalog-2`… to run more in parallel).
How to write them: [docs/testing/README.md](../../../docs/testing/README.md#integration-tests-testsclinichubintegrationtests).

Note for Int-4: DOSE-065 ("all fields empty → normalize returns null **and the drug stores `defaultDosing: null`**") is
`unit+api`: the unit tests prove the first half (`DosingRules.Normalize` returns null); tag the drug test that proves
the second (create or update a drug with an all-empty `defaultDosing`, then `GET` it → `defaultDosing: null`) with
`DOSE-065` too.
