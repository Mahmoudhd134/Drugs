# High-level design: multi-clinic platform

Status: **draft, not implemented.** Direction for future work, agreed in discussion on 2026-10-11.
Details will be decided per feature when each part is built (each gets its own `docs/features/<feature>/`).

## Goals

- Many clinics on one deployment; each clinic owns its drugs, groups, staff, roles, patients.
- One person (phone number) can be a patient in many clinics. Built in from the start, even if
  linking across clinics ships later.
- Phone number + OTP is the only login, for everyone.
- A platform super admin above all clinics.
- Per-clinic patient registration forms (dynamic, JSON Schema / RJSF).

## Identity

- `Users(Id, Phone UNIQUE, CreatedAt, LastLoginAt)`: the only data shared across clinics is the
  phone. Stored as E.164 (`libphonenumber-csharp`), default country Egypt (+20).
- Names and other personal data live in the clinic-scoped records (`Staff`, `Patients`), so each
  clinic keeps its own copy.

## Tenancy

- Shared database; every clinic-owned table has `ClinicId`.
- EF global query filter on `ClinicId` from `ITenantContext` (filled from the token, or from the
  route for admin endpoints). Only admin endpoints may call `IgnoreQueryFilters()`.
- `Clinics(Id, Name, Status: Active/Suspended, IsTemplate)`.

## Staff, roles, permissions

- `Staff(Id, UserId, ClinicId, FullName)`, unique `(UserId, ClinicId)`: a user may work in more
  than one clinic.
- `Roles(Id, ClinicId NOT NULL, Name, IsLocked)`: roles always belong to one clinic; no global roles.
- `StaffRoles(StaffId, RoleId)`: a staff member can have several roles; permissions are the union.
- `RolePermissions(RoleId, Permission)`.
- Permissions are code constants `resource.action` (`drugs.view`, `drugs.edit`, `patients.create`,
  `forms.manage`, `staff.manage`, `roles.manage`, `billing.view`, …), labels in both locales.
- `Owner` role is locked (`IsLocked`) and implicitly has every permission.
- Backend: `[HasPermission(...)]` via a policy provider; permissions resolved per request (short
  cache), not stored in the token, so changes apply at once.
- Frontend: `GET /me` returns permissions; `<Can permission="...">` hides UI. Backend always enforces.
- Whether a clinic Owner manages their own staff/roles is just granting `staff.manage` /
  `roles.manage` (decided later).
- No per-record rules (e.g. "doctor sees only own patients") until needed.

## Patients

- `Patients(Id, UserId, ClinicId, FullName, FileNo, FormVersionId, FormData JSON)`,
  unique `(UserId, ClinicId)`.
- **Rule:** all clinic data (visits, prescriptions, notes) references `Patients.Id`, never `UserId`.
- Assistant registers a patient: enter phone → find or create `User` → create (or open existing)
  `Patient` in this clinic → fill the clinic's registration form. The response must not reveal
  whether the phone exists in other clinics.
- Patient portal: after login, `GET /me/clinics` lists the clinics the patient belongs to.

## Authentication (phone + OTP)

- `OtpCodes(Phone, CodeHash, ExpiresAt, Attempts)`; rate-limited request and verify.
- `POST /auth/otp/request {phone}` → `POST /auth/otp/verify {phone, code}` → list of contexts:
  each staff clinic (with roles), "patient portal" if any `Patients` rows, "platform admin" if super admin.
- One context → auto-selected; several → `POST /auth/select` issues a token for that context
  (`clinic_id` or `scope=platform`). Switching = select again.
- `IOtpSender`: `ConsoleOtpSender` in dev; provider chosen later (WhatsApp Cloud API, a local
  Egyptian SMS gateway, Twilio, …). No free production option.

## Super admin

- `Users.IsSuperAdmin`, set only from config/seed, never via the UI.
- Separate area in the same SPA (`/admin/*`, own layout, lazy-loaded, code in `src/features/admin/`)
  and API (`/api/v1/admin/*`, `SuperAdmin` policy). Can be split out later if needed.
- Can: create/suspend clinics; manage any clinic's roles, permissions, staff
  (`/admin/clinics/{clinicId}/...`, reusing the clinic services with the tenant set from the route);
  build and assign registration forms; edit the template clinic; enter a clinic for support
  (`impersonating=true`, banner, audited).
- `AuditLogs(UserId, ClinicId, Action, Entity, EntityId, At)`, at least for admin actions.
- Admin tokens have a shorter lifetime.

## Clinic provisioning

`ClinicProvisioningService.CreateAsync(name, ownerPhone)` in one transaction, as ordered
`IClinicSeeder` steps:

1. Create the clinic.
2. Seed roles + permissions from a template in code.
3. Find/create the owner's `User`; add `Staff` with `Owner`.
4. Copy drugs and groups from the **template clinic** (`IsTemplate = true`), remapping drug ids.
5. Assign the default registration form.

The template clinic is edited by the super admin with the normal drugs/groups screens and is
excluded from normal queries. New modules add their own seeder.

## Dynamic registration forms (details later)

- `FormDefinitions(Id, Name, Purpose, Version, JsonSchema, UiSchema, Status: Draft/Published)`:
  global, built by the super admin. Published versions are immutable.
- `ClinicForms(ClinicId, Purpose, FormDefinitionId)`: assigns a form to a clinic.
- Core fields (name, phone) are columns; the form holds the extra fields (`Patients.FormData`).
- Frontend `@rjsf/mui` + `@rjsf/validator-ajv8`; backend re-validates (`JsonSchema.Net`).
- Builder UI: to be designed.

## Data and migrations

- Nothing in production yet: the existing migrations will be replaced by one clean `Initial`.
- Dev seed: template clinic (sample drugs/groups), a sample clinic, super admin phone from
  `appsettings.Development.json`.
- Once deployed, the data-preserving migration rules in the tech overview apply again.

## Open questions

- Owner self-management of staff/roles (permission grant, later).
- OTP provider.
- Form builder UI.
- Clinic sign-up: self-service vs. created/approved by the super admin.
- SQLite vs. PostgreSQL before going multi-clinic in production.
