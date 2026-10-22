import {lazy, type ReactNode} from "react";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {AppProviders} from "./AppProviders.tsx";
import {AppLayout} from "../components/layout/AppLayout.tsx";
import {SimpleLayout} from "../components/layout/SimpleLayout.tsx";
import {RequireAuth} from "../features/auth/components/RequireAuth.tsx";
import {RequirePermission} from "../features/access/components/RequirePermission.tsx";
import {PERMISSIONS, type PermissionRule} from "../features/access/permissions.ts";
import {FirstAllowedPage} from "./FirstAllowedPage.tsx";
import {AdminLayout} from "../features/admin/components/AdminLayout.tsx";
import {CLINIC_TABS} from "../features/admin/clinicTabs.tsx";
import {LEGACY_PROTOCOLS_ROUTES} from "../features/protocols/legacyRoutes.ts";
import {LegacyProtocolRedirect} from "../features/protocols/components/LegacyProtocolRedirect.tsx";

// Each page is its own chunk, loaded on first visit
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage.tsx")
    .then(m => ({default: m.LoginPage})));
const SelectClinicPage = lazy(() => import("../features/auth/pages/SelectClinicPage.tsx")
    .then(m => ({default: m.SelectClinicPage})));
const ClinicsPage = lazy(() => import("../features/admin/pages/ClinicsPage.tsx")
    .then(m => ({default: m.ClinicsPage})));
const CreateClinicPage = lazy(() => import("../features/admin/pages/CreateClinicPage.tsx")
    .then(m => ({default: m.CreateClinicPage})));
const ClinicPage = lazy(() => import("../features/admin/pages/ClinicPage.tsx")
    .then(m => ({default: m.ClinicPage})));
const PrescriptionPage = lazy(() => import("../features/prescription/pages/PrescriptionPage.tsx")
    .then(m => ({default: m.PrescriptionPage})));
const DrugsPage = lazy(() => import("../features/drugs/pages/DrugsPage.tsx")
    .then(m => ({default: m.DrugsPage})));
const ProtocolsPage = lazy(() => import("../features/protocols/pages/ProtocolsPage.tsx")
    .then(m => ({default: m.ProtocolsPage})));
const ProtocolEditorPage = lazy(() => import("../features/protocols/pages/ProtocolEditorPage.tsx")
    .then(m => ({default: m.ProtocolEditorPage})));

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
    {path: "protocols", page: <ProtocolsPage/>, permission: PERMISSIONS.protocols.list},
    {path: "protocols/new", page: <ProtocolEditorPage/>, permission: PERMISSIONS.protocols.create},
    {path: "protocols/:id", page: <ProtocolEditorPage/>, permission: PERMISSIONS.protocols.details},
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
                </Route>
                {/* Platform admin (super admin, platform context) */}
                <Route element={<RequireAuth context="platform"/>}>
                    <Route path="admin" element={<AdminLayout/>}>
                        <Route index element={<ClinicsPage/>}/>
                        <Route path="clinics/new" element={<CreateClinicPage/>}/>
                        <Route path="clinics/:id" element={<ClinicPage/>}>
                            {CLINIC_TABS.map(tab => tab.path
                                ? <Route key={tab.path} path={tab.path} element={tab.element}/>
                                : <Route key="index" index element={tab.element}/>)}
                        </Route>
                        <Route path="*" element={<Navigate to="/admin" replace/>}/>
                    </Route>
                </Route>
                {/* Old bookmarks from before groups were renamed protocols (M1.7a), outside the guards so the sign-in
                    comes back to the new address */}
                {LEGACY_PROTOCOLS_ROUTES.map(path => <Route key={path} path={path} element={<LegacyProtocolRedirect/>}/>)}
                {/* The platform's placeholder page before the admin area (M1.5.4) */}
                <Route path="platform" element={<Navigate to="/admin" replace/>}/>
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
