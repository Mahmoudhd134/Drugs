import {lazy, type ReactNode} from "react";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {AppProviders} from "./AppProviders.tsx";
import {AppLayout} from "../components/layout/AppLayout.tsx";
import {SimpleLayout} from "../components/layout/SimpleLayout.tsx";
import {RequireAuth} from "../features/auth/components/RequireAuth.tsx";
import {RequirePermission} from "../features/access/components/RequirePermission.tsx";
import {PERMISSIONS, type PermissionRule} from "../features/access/permissions.ts";
import {FirstAllowedPage} from "./FirstAllowedPage.tsx";

// Each page is its own chunk, loaded on first visit
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage.tsx")
    .then(m => ({default: m.LoginPage})));
const SelectClinicPage = lazy(() => import("../features/auth/pages/SelectClinicPage.tsx")
    .then(m => ({default: m.SelectClinicPage})));
const PlatformPage = lazy(() => import("../features/auth/pages/PlatformPage.tsx")
    .then(m => ({default: m.PlatformPage})));
const PrescriptionPage = lazy(() => import("../features/prescription/pages/PrescriptionPage.tsx")
    .then(m => ({default: m.PrescriptionPage})));
const DrugsPage = lazy(() => import("../features/drugs/pages/DrugsPage.tsx")
    .then(m => ({default: m.DrugsPage})));
const DrugGroupsPage = lazy(() => import("../features/drugGroups/pages/DrugGroupsPage.tsx")
    .then(m => ({default: m.DrugGroupsPage})));
const DrugGroupEditorPage = lazy(() => import("../features/drugGroups/pages/DrugGroupEditorPage.tsx")
    .then(m => ({default: m.DrugGroupEditorPage})));

type ClinicRoute = PermissionRule & {
    /** Omit for the index route ("/") */
    path?: string;
    page: ReactNode;
    /** Shown instead of the page without permission (default: the "no permission" page) */
    denied?: ReactNode;
};

// Pages of the clinic app, each behind its permission(s)
const CLINIC_ROUTES: ClinicRoute[] = [
    {page: <PrescriptionPage/>, permission: PERMISSIONS.prescriptions.create, denied: <FirstAllowedPage/>},
    {path: "groups", page: <DrugGroupsPage/>, permission: PERMISSIONS.groups.list},
    {path: "groups/new", page: <DrugGroupEditorPage/>, permission: PERMISSIONS.groups.create},
    {path: "groups/:id", page: <DrugGroupEditorPage/>, permission: PERMISSIONS.groups.details},
    {path: "drugs", page: <DrugsPage/>, permission: PERMISSIONS.drugs.list},
];

export const App = () => (
    <BrowserRouter>
        <AppProviders>
            <Routes>
                <Route element={<SimpleLayout/>}>
                    <Route path="login" element={<LoginPage/>}/>
                    <Route element={<RequireAuth/>}>
                        <Route path="select-clinic" element={<SelectClinicPage/>}/>
                    </Route>
                    {/* TEMPORARY placeholder until the admin area (phase 4) */}
                    <Route element={<RequireAuth context="platform"/>}>
                        <Route path="platform" element={<PlatformPage/>}/>
                    </Route>
                </Route>
                <Route element={<RequireAuth context="clinic"/>}>
                    <Route element={<AppLayout/>}>
                        {CLINIC_ROUTES.map(({path, page, denied, ...rule}) => {
                            const element = <RequirePermission {...rule} fallback={denied}>{page}</RequirePermission>;
                            return path === undefined
                                ? <Route key="index" index element={element}/>
                                : <Route key={path} path={path} element={element}/>;
                        })}
                        {/* Old URL from before the redesign */}
                        <Route path="manage" element={<Navigate to="/drugs" replace/>}/>
                        <Route path="*" element={<Navigate to="/" replace/>}/>
                    </Route>
                </Route>
            </Routes>
        </AppProviders>
    </BrowserRouter>
);
