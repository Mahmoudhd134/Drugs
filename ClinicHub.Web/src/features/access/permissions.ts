/**
 * Every permission, one per action (`resource.action`). Mirrors the backend catalog:
 * keep in sync with the `Permissions` class (ClinicHub.Application, Features/Access/Permissions.cs).
 * Labels: `permissions.<key>` in the locales.
 */
export const PERMISSIONS = {
    drugs: {
        list: "drugs.list",
        details: "drugs.details",
        create: "drugs.create",
        update: "drugs.update",
        delete: "drugs.delete",
    },
    protocols: {
        list: "protocols.list",
        details: "protocols.details",
        create: "protocols.create",
        update: "protocols.update",
        delete: "protocols.delete",
    },
    prescriptions: {
        create: "prescriptions.create",
    },
} as const;

type Resources = typeof PERMISSIONS;
/** Any permission key, e.g. "drugs.create". */
export type Permission = { [R in keyof Resources]: Resources[R][keyof Resources[R]] }[keyof Resources];

/**
 * Which permissions something needs; every given condition must hold (none given = allowed).
 * Shared by `<Can>`, `withPermission` components and `<RequirePermission>`.
 */
export type PermissionRule = {
    permission?: Permission;
    /** At least one of these */
    anyOf?: readonly Permission[];
    /** All of these */
    allOf?: readonly Permission[];
};
