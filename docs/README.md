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
└── features/
    ├── _template/             ← copy this folder for every new feature
    │   ├── tech.md
    │   └── business.md
    ├── dosing/                ← structured dosing (shared by drugs, groups, prescriptions)
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
5. Keep docs describing what **is** built, not plans. Put ideas in a "Future ideas" section.

## Current features

| Feature | Tech | Business |
|---|---|---|
| Structured dosing | [tech](features/dosing/tech.md) | [business](features/dosing/business.md) |
| Drug catalog | [tech](features/drugs/tech.md) | [business](features/drugs/business.md) |
| Drug groups | [tech](features/drug-groups/tech.md) | [business](features/drug-groups/business.md) |
| Prescription builder | [tech](features/prescription/tech.md) | [business](features/prescription/business.md) |
