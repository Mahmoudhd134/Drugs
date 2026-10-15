# Admin integration tests

ADM (platform admin): `api` cases of the [test catalog](../../../docs/testing/test-catalog.md); classes tagged `[Trait("Area", "admin")]`.
How to write them: [docs/testing/README.md](../../../docs/testing/README.md#integration-tests-testsclinichubintegrationtests).
"API restarted with other `Platform:SuperAdminPhones`" cases (ADM-012, ADM-014, …): see "Restart cases" in that README.

| Collection | Classes |
|---|---|
| `admin` | `AdminAuthorizationTests`, `DemotedSuperAdminTests` (restart cases), `ClinicNotFoundTests` (missing, deleted, template), `LockoutAfterAdminChangeTests`, `AdminClinicFilterGuardTests` |
| `admin-2` | `ClinicListTests`, `ClinicListPagingTests` (exactly 25 clinics per class), `ClinicArabicSearchTests`, `CatalogRegressionPortTests` |
| `admin-3` | `CreateClinicValidationTests`, `CreateClinicProvisioningTests`, `CreateClinicFromAnEmptyTemplateTests`, `CreateClinicRollbackTests` (a failing seeder on a variant app) |
| `admin-4` | `ClinicDetailsAndRenameTests`, `SuspendAndActivateTests`, `DeleteClinicTests` |
| `admin-5` | `RoleTests`, `OwnerLabelTests` |
| `admin-6` | `StaffListTests`, `StaffChangeTests`, `LastOwnerTests` |

- Local helpers: `AdminApi.cs` (routes, "every admin route", list/read shortcuts, `PermissionKeys` in catalog order,
  `RowCounts` for "nothing written", `TemplateCatalog`: the catalog's template fixture of 2 drugs + 1 group), the
  create/role/staff call shortcuts next to their tests, `ForgedTokens` (the M1.5 matrix's forged-token rows).
- The clinics list is global: list tests name their clinics with their own token and search for it, or (paging) own a
  class whose data is made once per class.
- The M1.5 acceptance scripts (`accept-api.py`, `accept-reg-api.py`) are ported here: a check proving an ADM case is in
  that case's test; the others are untagged tests marked "Ported from …" (their ACC / AUTH / catalog cases belong to
  other tracks).
