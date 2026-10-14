import type {ReactNode} from "react";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import {PERMISSIONS, type Permission} from "../features/access/permissions.ts";

export type NavItem = { to: string; labelKey: string; icon: ReactNode; end?: boolean; permission: Permission };

// Add new modules of the clinic system here; the sidebar hides those the user can't open
export const NAV_ITEMS: NavItem[] = [
    {to: "/", labelKey: "nav.prescription", icon: <ReceiptLongIcon/>, end: true, permission: PERMISSIONS.prescriptions.create},
    {to: "/groups", labelKey: "nav.groups", icon: <CategoryIcon/>, permission: PERMISSIONS.groups.list},
    {to: "/drugs", labelKey: "nav.drugs", icon: <MedicationIcon/>, permission: PERMISSIONS.drugs.list},
];
