import {lazy} from "react";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {AppProviders} from "./AppProviders.tsx";
import {AppLayout} from "../components/layout/AppLayout.tsx";

// Each page is its own chunk, loaded on first visit
const PrescriptionPage = lazy(() => import("../features/prescription/pages/PrescriptionPage.tsx")
    .then(m => ({default: m.PrescriptionPage})));
const DrugsPage = lazy(() => import("../features/drugs/pages/DrugsPage.tsx")
    .then(m => ({default: m.DrugsPage})));
const DrugGroupsPage = lazy(() => import("../features/drugGroups/pages/DrugGroupsPage.tsx")
    .then(m => ({default: m.DrugGroupsPage})));
const DrugGroupEditorPage = lazy(() => import("../features/drugGroups/pages/DrugGroupEditorPage.tsx")
    .then(m => ({default: m.DrugGroupEditorPage})));

export const App = () => (
    <AppProviders>
        <BrowserRouter>
            <Routes>
                <Route element={<AppLayout/>}>
                    <Route index element={<PrescriptionPage/>}/>
                    <Route path="groups" element={<DrugGroupsPage/>}/>
                    <Route path="groups/new" element={<DrugGroupEditorPage/>}/>
                    <Route path="groups/:id" element={<DrugGroupEditorPage/>}/>
                    <Route path="drugs" element={<DrugsPage/>}/>
                    {/* Old URL from before the redesign */}
                    <Route path="manage" element={<Navigate to="/drugs" replace/>}/>
                    <Route path="*" element={<Navigate to="/" replace/>}/>
                </Route>
            </Routes>
        </BrowserRouter>
    </AppProviders>
);
