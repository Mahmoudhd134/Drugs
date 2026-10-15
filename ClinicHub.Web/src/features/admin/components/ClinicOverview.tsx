import {type ReactNode, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Box, Button, Divider, Paper, Stack, Typography} from "@mui/material";
import EditIcon from "@mui/icons-material/EditOutlined";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useFormatDate} from "../../../hooks/useFormatDate.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {useDeleteClinic, useForgetClinic, useSetClinicStatus} from "../api.ts";
import {useTabClinic} from "../useTabClinic.ts";
import {useClinicsListPath} from "../listState.ts";
import {ClinicStatusChip} from "./ClinicStatusChip.tsx";
import {disabledToneSx} from "./disabledTone.ts";
import {RenameClinicDialog} from "./RenameClinicDialog.tsx";
import {DeleteClinicDialog} from "./DeleteClinicDialog.tsx";

/** The clinic page's Overview tab: details and owners; rename, disable / enable, delete. */
export const ClinicOverview = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const formatDate = useFormatDate();
    const clinic = useTabClinic();
    const listPath = useClinicsListPath();
    const setStatus = useSetClinicStatus();
    const deleteClinic = useDeleteClinic();
    const forgetClinic = useForgetClinic();
    const {confirm, dialog: confirmDialog} = useConfirm();
    const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
    const suspended = clinic.status === "suspended";

    // One action at a time (a double click would send it twice)
    const once = useSingleFlight();

    const toggleStatus = () => once(async () => {
        const status = suspended ? "active" : "suspended";
        if (status === "suspended") {
            const confirmed = await confirm({
                title: t("admin.clinic.disableTitle", {name: clinic.name}),
                message: t("admin.clinic.disableMessage"),
                confirmText: t("admin.clinic.disable"),
                destructive: true,
            });
            if (!confirmed) return;
        }
        try {
            await setStatus.mutateAsync({id: clinic.id, status});
            toast.success(t(status === "suspended" ? "admin.clinic.disabled" : "admin.clinic.enabled"));
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    const handleDelete = () => once(async () => {
        try {
            await deleteClinic.mutateAsync(clinic.id);
            setDialog(null);
            toast.success(t("admin.clinic.deleted", {name: clinic.name}));
            navigate(listPath, {replace: true});
            // Only now: dropped while the page is shown, the clinic would be loaded again (404)
            forgetClinic(clinic.id);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    return (
        <Stack sx={{gap: 2, maxWidth: 900}}>
            <Paper variant="outlined" sx={{p: {xs: 2, sm: 3}}}>
                <Stack direction="row" sx={{alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2}}>
                    <Typography variant="subtitle1" component="h2" sx={{fontWeight: 700}}>{t("admin.clinic.details")}</Typography>
                    <Button startIcon={<EditIcon/>} onClick={() => setDialog("rename")}>{t("admin.clinic.rename")}</Button>
                </Stack>
                <Box
                    component="dl"
                    sx={{
                        m: 0,
                        display: "grid",
                        gridTemplateColumns: {xs: "1fr", sm: "180px 1fr"},
                        columnGap: 2,
                        rowGap: {xs: 0.5, sm: 1.5},
                        "& dt": {color: "text.secondary", typography: "body2", pt: {xs: 1, sm: 0}},
                        "& dd": {m: 0, typography: "body1", minWidth: 0},
                    }}
                >
                    <Detail label={t("admin.clinic.name")}>
                        <Box component="span" dir="auto" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{clinic.name}</Box>
                    </Detail>
                    <Detail label={t("admin.clinic.status")}><ClinicStatusChip status={clinic.status}/></Detail>
                    <Detail label={t("admin.clinic.created")}>{formatDate(clinic.createdAt, "long")}</Detail>
                    <Detail label={t("admin.clinic.staff")}>{clinic.staffCount}</Detail>
                    <Detail label={t("admin.clinic.owners")}>
                        {clinic.owners.length === 0 ? (
                            <Typography color="text.secondary">{t("admin.clinic.noOwners")}</Typography>
                        ) : (
                            <Stack component="ul" sx={{m: 0, p: 0, listStyle: "none", gap: 0.75}}>
                                {clinic.owners.map(owner => (
                                    <li key={owner.staffId}>
                                        <Box component="span" dir="auto" sx={{fontWeight: 600}}>{owner.fullName}</Box>
                                        {" · "}
                                        {/* Phones stay left to right in Arabic (else the "+" moves to the end) */}
                                        <Box component="span" dir="ltr" sx={{color: "text.secondary", whiteSpace: "nowrap"}}>{owner.phone}</Box>
                                    </li>
                                ))}
                            </Stack>
                        )}
                    </Detail>
                </Box>
            </Paper>

            <Paper variant="outlined" sx={{p: {xs: 2, sm: 3}}}>
                <Typography variant="subtitle1" component="h2" sx={{fontWeight: 700, mb: 2}}>{t("admin.clinic.manage")}</Typography>
                <Stack divider={<Divider flexItem/>} sx={{gap: 2}}>
                    <Action
                        title={suspended ? t("admin.clinic.enableTitle") : t("admin.clinic.disableSection")}
                        description={suspended ? t("admin.clinic.suspendedInfo") : t("admin.clinic.activeInfo")}
                        button={
                            <Button
                                variant="outlined"
                                color={suspended ? "success" : "warning"}
                                startIcon={suspended ? <CheckCircleIcon/> : <BlockIcon/>}
                                sx={suspended ? undefined : disabledToneSx}
                                onClick={() => void toggleStatus()}
                                disabled={setStatus.isPending}
                            >
                                {suspended ? t("admin.clinic.enable") : t("admin.clinic.disable")}
                            </Button>
                        }
                    />
                    <Action
                        title={t("admin.clinic.deleteSection")}
                        description={t("admin.clinic.deleteInfo")}
                        button={
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon/>} onClick={() => setDialog("delete")}>
                                {t("admin.clinic.delete")}
                            </Button>
                        }
                    />
                </Stack>
            </Paper>

            <RenameClinicDialog open={dialog === "rename"} clinic={clinic} onClose={() => setDialog(null)}/>
            <DeleteClinicDialog
                open={dialog === "delete"}
                clinicName={clinic.name}
                pending={deleteClinic.isPending}
                onConfirm={() => void handleDelete()}
                onClose={() => setDialog(null)}
            />
            {confirmDialog}
        </Stack>
    );
};

const Detail = ({label, children}: { label: string; children: ReactNode }) => (
    <>
        <dt>{label}</dt>
        <dd>{children}</dd>
    </>
);

const Action = ({title, description, button}: { title: string; description: string; button: ReactNode }) => (
    <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1.5, alignItems: {sm: "center"}, justifyContent: "space-between"}}>
        <Box sx={{minWidth: 0}}>
            <Typography sx={{fontWeight: 600}}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
        <Box sx={{flexShrink: 0}}>{button}</Box>
    </Stack>
);
