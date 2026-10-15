# Documentation

Read this before changing the app. Every feature is documented twice:

- **Tech doc (English)**: how it is built (data model, API, UI components, conventions).
- **Business doc (Arabic)**: what it does for the clinic (who uses it, workflows, business rules).

```
docs/
├── README.md                  ← you are here
├── tech/
│   └── overview.md            ← architecture, stack, conventions, how to add a feature
├── business/
│   └── overview.md            ← (عربي) what the system supports today
├── design/
│   ├── platform-hld.md        ← multi-clinic platform: requirements, data model, API, delivery (MVP milestones and steps)
│   ├── architecture.md        ← backend layers, MediatR use cases, Result/Error, ProblemDetails (M1.4)
│   └── m1.5-platform-admin.md ← design of the platform admin (M1.5)
└── features/
    ├── _template/             ← copy this folder for every new feature
    │   ├── tech.md
    │   └── business.md
    ├── clinic-scoping/        ← clinics + automatic per-clinic data isolation (M1.1)
    ├── auth/                  ← phone + OTP login, sessions, clinic contexts (M1.2)
    ├── access/                ← roles, permissions, permission checks (M1.3)
    ├── platform-admin/        ← super admin: clinics, provisioning, each clinic's roles and staff (M1.5)
    ├── dosing/                ← structured dosing (shared by drugs, groups, prescriptions)
    ├── tapering/              ← tapering schedules (steps inside a dosing)
    ├── drugs/                 ← drug catalog
    ├── drug-groups/           ← groups / treatment templates
    └── prescription/          ← building and copying a prescription
```

## Rules for adding a feature

1. Read `tech/overview.md`, `business/overview.md` and the docs of any feature you touch.
2. Copy `features/_template/` to `features/<feature-name>/` and fill in both files.
3. Update `tech/overview.md` (API table, data model, routes) and `business/overview.md`
   (feature list) when the feature adds endpoints, tables, pages or user-visible capabilities.
4. If a change alters an existing feature's behavior, update that feature's docs in the same commit.
5. Keep docs describing what **is** built, not plans. List gaps under "Edge cases & limitations" (tech) /
   «ما لا تدعمه الميزة حاليًا» (business).

## Current features

| Feature | Tech | Business |
|---|---|---|
| Clinic scoping | [tech](features/clinic-scoping/tech.md) | [business](features/clinic-scoping/business.md) |
| Login (phone + OTP) | [tech](features/auth/tech.md) | [business](features/auth/business.md) |
| Roles and permissions (M1.3) | [tech](features/access/tech.md) | [business](features/access/business.md) |
| Structured dosing | [tech](features/dosing/tech.md) | [business](features/dosing/business.md) |
| Tapering schedules | [tech](features/tapering/tech.md) | [business](features/tapering/business.md) |
| Drug catalog | [tech](features/drugs/tech.md) | [business](features/drugs/business.md) |
| Drug groups (protocols) | [tech](features/drug-groups/tech.md) | [business](features/drug-groups/business.md) |
| Prescription builder | [tech](features/prescription/tech.md) | [business](features/prescription/business.md) |
| Platform admin (M1.5: clinics, roles and staff; API and screens) | [tech](features/platform-admin/tech.md) | [business](features/platform-admin/business.md) |
