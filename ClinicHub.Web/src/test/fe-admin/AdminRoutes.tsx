import {useEffect} from "react";
import {Outlet, Route, Routes, useNavigate} from "react-router-dom";
import {AdminLayout} from "../../features/admin/components/AdminLayout.tsx";
import {CLINIC_TABS} from "../../features/admin/clinicTabs.tsx";
import {ClinicPage} from "../../features/admin/pages/ClinicPage.tsx";
import {ClinicsPage} from "../../features/admin/pages/ClinicsPage.tsx";
import {CreateClinicPage} from "../../features/admin/pages/CreateClinicPage.tsx";
import {setNavigate} from "./appNavigation.ts";

/** Keeps the router's `navigate` for navigateInApp (a link or Back somewhere else in the app). */
const NavigateProbe = () => {
    const navigate = useNavigate();
    useEffect(() => {
        setNavigate(navigate);
        return () => setNavigate(null);
    }, [navigate]);
    return null;
};

/*
 * The platform admin area as App.tsx mounts it (docs/features/platform-admin/tech.md "Frontend"): `/admin` in
 * AdminLayout with the clinics list, the create page and the clinic page with the tabs of CLINIC_TABS as child routes.
 * The pages are imported directly (App.tsx loads them lazily; the Roles and Staff tabs stay lazy as in the app).
 * `layout` false leaves out AdminLayout's frame (app bar, sidebar), which most tests don't look at: lighter.
 */
export const AdminRoutes = ({layout}: { layout: boolean }) => (
    <>
        <NavigateProbe/>
        <Routes>
            <Route path="/admin" element={layout ? <AdminLayout/> : <Outlet/>}>
                <Route index element={<ClinicsPage/>}/>
                <Route path="clinics/new" element={<CreateClinicPage/>}/>
                <Route path="clinics/:id" element={<ClinicPage/>}>
                    {CLINIC_TABS.map(tab => tab.path
                        ? <Route key={tab.path} path={tab.path} element={tab.element}/>
                        : <Route key="index" index element={tab.element}/>)}
                </Route>
            </Route>
        </Routes>
    </>
);
