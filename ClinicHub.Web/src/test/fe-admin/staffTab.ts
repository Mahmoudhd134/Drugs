import {expect} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {Role} from "../../features/roles/types.ts";
import type {StaffMember} from "../../features/staff/types.ts";
import {aClinicDetails, aRole, anOwnerRole} from "../data.ts";
import {adminClinicsHandlers, rolesHandler, staffHandler} from "../msw.ts";
import {server} from "../server.ts";
import {renderAdmin} from "./adminApp.tsx";

/** A clinic's default roles (Owner, Doctor, Assistant). */
export const staffRoles = () => ({owner: anOwnerRole(), doctor: aRole({name: "Doctor"}), assistant: aRole({name: "Assistant"})});

/** A staff member's role as the staff list answers it. */
export const asStaffRole = ({id, name, isOwner}: Role) => ({id, name, isOwner});

/**
 * Opens the Staff tab of a clinic (the clinic page, as in the app) with `staff` and `roles`; waits until the list has
 * loaded (its subtitle). Add handlers of your own with `server.use` before.
 */
export const openStaffTab = async (staff: StaffMember[], options: { lang?: LanguageCode; roles?: Role[] } = {}) => {
    const clinic = aClinicDetails({name: "Clinic A"});
    const roles = options.roles ?? Object.values(staffRoles());
    server.use(...adminClinicsHandlers([clinic]), staffHandler(clinic.id, staff), rolesHandler(clinic.id, roles));
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}/staff`, {lang: options.lang});
    await waitFor(() => expect(screen.getByRole("heading", {level: 2}).nextElementSibling?.textContent?.trim()).not.toBe(""));
    return {...rendered, clinic};
};

/** The staff table's rows (no header). */
export const staffRows = () => within(screen.getByRole("table")).queryAllByRole("row").slice(1);

/** The staff list's subtitle (the count, or the results while searching). */
export const staffSubtitle = () => screen.getByRole("heading", {level: 2}).nextElementSibling?.textContent;

/** Records whether `text` was ever shown from now on (e.g. never "no match" while the list settles). */
export const watchForText = (text: string) => {
    let seen = document.body.textContent?.includes(text) ?? false;
    const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes(text)) seen = true;
    });
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    return {
        seen: () => seen,
        stop: () => observer.disconnect(),
    };
};
