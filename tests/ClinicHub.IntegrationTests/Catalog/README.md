# Catalog integration tests

DRUG, GRP, DOSE and TAPER (catalog): `api` cases of the [test catalog](../../../docs/testing/test-catalog.md); classes tagged `[Trait("Area", "catalog")]`.
Collections (`CatalogCollections.cs`): `catalog` to `catalog-4`, run in parallel, and `catalog-migrations` (its own database,
whose migrations its test moves down and up); put a new class in one of the first four, or add `catalog-5` when they get
slow. Folders: `Drugs/`, `Protocols/`, `Doses/` (dosing and taper rules through the API), `Migrations/`; shared base class
`CatalogTest.cs`.
How to write them: [docs/testing/README.md](../../../docs/testing/README.md#integration-tests-testsclinichubintegrationtests).

A `unit+api` case needs a test at each level: e.g. DOSE-065 (all fields empty → no dosing) is proved by
`DosingRules.Normalize` in the unit tests and by the drug test that saves an all-empty `defaultDosing` and reads back
`null` (`Drugs/DrugValidationTests.cs`).
