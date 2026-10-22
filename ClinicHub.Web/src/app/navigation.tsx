import type {ReactNode} from "react";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import {PERMISSIONS, type Permission} from "../features/access/permissions.ts";

/** A sidebar entry: active on `to` (exactly with `end`, else also below it) and below each `activeFor` path. */
export type ShellNavItem = { to: string; labelKey: string; icon: ReactNode; end?: boolean; activeFor?: string[] };

export type NavItem = ShellNavItem & { permission: Permission };

// Add new modules of the clinic system here; the sidebar hides those the user can't open
export const NAV_ITEMS: NavItem[] = [
    {to: "/", labelKey: "nav.prescription", icon: <ReceiptLongIcon/>, end: true, permission: PERMISSIONS.prescriptions.create},
    {to: "/protocols", labelKey: "nav.protocols", icon: <CategoryIcon/>, permission: PERMISSIONS.protocols.list},
    {to: "/drugs", labelKey: "nav.drugs", icon: <MedicationIcon/>, permission: PERMISSIONS.drugs.list},
];

// Sections of the platform admin (super admin only, no permissions); add new ones here (e.g. Forms in M2.1)
export const ADMIN_NAV_ITEMS: ShellNavItem[] = [
    {to: "/admin", labelKey: "admin.nav.clinics", icon: <LocalHospitalIcon/>, end: true, activeFor: ["/admin/clinics"]},
];
