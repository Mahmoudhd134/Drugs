import {lazy, type ReactNode} from "react";
// The first tab comes with the page (no second spinner); the others load on first visit
import {ClinicOverview} from "./components/ClinicOverview.tsx";

const ClinicRolesTab = lazy(() => import("./components/ClinicRolesTab.tsx").then(m => ({default: m.ClinicRolesTab})));
const ClinicStaffTab = lazy(() => import("./components/ClinicStaffTab.tsx").then(m => ({default: m.ClinicStaffTab})));

/** A tab of the clinic page: a child route of `/admin/clinics/:id` ("" = the page itself). */
export type ClinicTab = { path: string; labelKey: string; element: ReactNode };

// The clinic page's tabs, in order; App.tsx makes each one a route. Add new ones here
export const CLINIC_TABS: ClinicTab[] = [
    {path: "", labelKey: "admin.clinic.tabs.overview", element: <ClinicOverview/>},
    {path: "roles", labelKey: "admin.clinic.tabs.roles", element: <ClinicRolesTab/>},
    {path: "staff", labelKey: "admin.clinic.tabs.staff", element: <ClinicStaffTab/>},
];
