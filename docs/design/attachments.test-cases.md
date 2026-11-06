# Attachments: test cases

Status: **approved** (user, T0, 2026-11-06). Same format and rules as the [test catalog](../testing/test-catalog.md). New area **ATT**. Sources:
the [design](attachments.md) (§ / An) and the [business file](../features/attachments/business.md) («…»). Moved into the catalog with the feature.

Two parts (§ 9). **Part 1, backend:** levels `unit` and `api`; `api` cases run on the test-only controller. **Part 2, components:** levels `unit`,
`ui` and `e2e` on the harness page (§ 12). Examples: clinics A and B; M = `clinicPaper` with its override (PNG and JPEG, 2 MB); G = any other
module string, with no entry (global list, 20 MB); owner O = (M, "1"). "Nothing written" means a clinic's own folder is unchanged: Respawn doesn't
reset the disk.

**All the rows moved** to the [test catalog](../testing/test-catalog.md#att--attachments), section ATT, with the feature: part 1's (ATT-001 to ATT-186), and part 2's (ATT-200 to ATT-269) under its "Components" headings.
