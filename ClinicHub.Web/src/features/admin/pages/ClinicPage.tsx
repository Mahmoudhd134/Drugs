import {Link as RouterLink, Outlet, useLocation, useNavigate, useParams} from "react-router-dom";
import {Alert, Box, Button, CircularProgress, Tab, Tabs} from "@mui/material";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import {useTranslation} from "react-i18next";
import {BackButton} from "../../../components/common/BackButton.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {PageBoundary} from "../../../components/common/PageBoundary.tsx";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {toApiError} from "../../../api/errors.ts";
import {useAdminClinic} from "../api.ts";
import {CLINIC_TABS} from "../clinicTabs.tsx";
import {ClinicStatusChip} from "../components/ClinicStatusChip.tsx";
import {useClinicsListPath} from "../listState.ts";

/** A clinic id in the URL: a positive whole number without leading zeros that fits the API's int. */
const parseClinicId = (id: string | undefined) =>
    id !== undefined && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2_147_483_647 ? Number(id) : null;

/**
 * One clinic: its name and status above the tabs of {@link CLINIC_TABS} (child routes, each given the clinic). A
 * missing, deleted or template clinic (404) shows "not found".
 */
export const ClinicPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const {id} = useParams();
    const listPath = useClinicsListPath();
    const clinicId = parseClinicId(id);
    const clinic = useAdminClinic(clinicId);
    const back = <BackButton onClick={() => navigate(listPath)}/>;

    // Checked before the data: a clinic deleted meanwhile answers 404 even when an older copy is cached
    if (clinicId === null || toApiError(clinic.error)?.status === 404) {
        return (
            <EmptyState
                icon={<SearchOffIcon/>}
                title={t("admin.clinic.notFoundTitle")}
                description={t("admin.clinic.notFoundDescription")}
                action={<Button variant="outlined" component={RouterLink} to={listPath}>{t("admin.clinic.backToList")}</Button>}
            />
        );
    }
    if (!clinic.data) {
        return clinic.isError ? (
            <>
                <PageHeader leading={back} title={t("admin.clinic.title")}/>
                <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void clinic.refetch()}>{t("common.retry")}</Button>}>
                    {t("common.loadFailed")}
                </Alert>
            </>
        ) : (
            <Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress aria-label={t("common.loading")}/></Box>
        );
    }

    // The tab is the first path segment after the clinic's own path ("" = Overview)
    const base = `/admin/clinics/${clinicId}`;
    const segment = location.pathname.slice(base.length).split("/").filter(Boolean)[0] ?? "";
    const activeTab = CLINIC_TABS.some(tab => tab.path === segment) ? segment : false;

    return (
        <>
            <PageHeader
                leading={back}
                title={<span dir="auto">{clinic.data.name}</span>}
                titleText={clinic.data.name}
                subtitle={<Box sx={{mt: 0.5}}><ClinicStatusChip status={clinic.data.status}/></Box>}
            />

            <Tabs value={activeTab} variant="scrollable" allowScrollButtonsMobile sx={{mb: 3, borderBottom: 1, borderColor: "divider"}}>
                {CLINIC_TABS.map(tab => (
                    <Tab
                        key={tab.path || "overview"}
                        value={tab.path}
                        label={t(tab.labelKey)}
                        component={RouterLink}
                        to={tab.path ? `${base}/${tab.path}` : base}
                        // The list to go back to stays known on every tab
                        state={location.state}
                        replace
                    />
                ))}
            </Tabs>

            {/* Remounted for another clinic (e.g. Back between two clinics' tabs): its dialogs, search and rows never follow */}
            <PageBoundary key={clinicId}>
                <Outlet context={clinic.data}/>
            </PageBoundary>
        </>
    );
};
