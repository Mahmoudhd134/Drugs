import type {ReactNode} from "react";
// The first tab comes with the page (no second spinner); later tabs may be lazy (`lazy(() => import(...))`)
import {ClinicOverview} from "./components/ClinicOverview.tsx";

/** A tab of the clinic page: a child route of `/admin/clinics/:id` ("" = the page itself). */
export type ClinicTab = { path: string; labelKey: string; element: ReactNode };

// The clinic page's tabs, in order; App.tsx makes each one a route. Add new ones here (Roles and Staff in M1.5.5)
export const CLINIC_TABS: ClinicTab[] = [
    {path: "", labelKey: "admin.clinic.tabs.overview", element: <ClinicOverview/>},
];
