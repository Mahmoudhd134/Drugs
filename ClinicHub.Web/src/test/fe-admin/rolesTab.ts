import {expect} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {Role} from "../../features/roles/types.ts";
import type {PermissionDefinition} from "../../features/access/api.ts";
import {aClinicDetails, aRole, anOwnerRole} from "../data.ts";
import {adminClinicsHandlers, permissionsHandler, rolesHandler} from "../msw.ts";
import {server} from "../server.ts";
import {renderAdmin} from "./adminApp.tsx";

/** The roles as the API answers them (permissions expanded with their requirements, catalog order). */
export const ROLE_KEYS = {
    assistant: ["drugs.list", "drugs.details", "drugs.create", "drugs.update", "groups.list", "groups.details", "groups.create",
        "groups.update", "prescriptions.create"],
    groupEditors: ["drugs.list", "drugs.details", "drugs.delete", "groups.list", "groups.details", "groups.update"],
};

/** A clinic's default roles (Owner, Assistant held by one, Doctor unused). */
export const defaultRoles = (): Role[] => [
    anOwnerRole(),
    aRole({name: "Doctor", permissions: [], staffCount: 0}),
    aRole({name: "Assistant", permissions: [...ROLE_KEYS.assistant], staffCount: 1}),
];

/**
 * Opens the Roles tab of a clinic (the clinic page, as in the app) with `roles` and the permission catalog; waits for
 * the first row. Add handlers of your own with `server.use` before or after.
 */
export const openRolesTab = async (roles: Role[], options: { lang?: LanguageCode; catalog?: PermissionDefinition[] } = {}) => {
    const clinic = aClinicDetails({name: "Clinic A"});
    server.use(...adminClinicsHandlers([clinic]), rolesHandler(clinic.id, roles), permissionsHandler(options.catalog));
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}/roles`, {lang: options.lang});
    await screen.findByRole("table");
    await waitFor(() => expect(roleRows().length).toBe(roles.length));
    return {...rendered, clinic};
};

/** The roles table's rows (no header). */
export const roleRows = () => within(screen.getByRole("table")).queryAllByRole("row").slice(1);

/** The row of the role shown as `label`. */
export const roleRow = (label: string) => {
    const row = roleRows().find(r => within(r).queryByText(label, {selector: "span"}));
    if (!row) throw new Error(`No role row "${label}"`);
    return row;
};
