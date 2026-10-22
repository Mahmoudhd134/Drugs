import {DialogTitle, useMediaQuery} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import {useTranslation} from "react-i18next";
import {FormDialog} from "../../../components/common/FormDialog.tsx";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {DrugEditForm} from "../../drugs/components/DrugEditForm.tsx";
import {useAdminCategories} from "../categories/api.ts";
import {useSaveSharedDrug} from "./api.ts";
import type {AdminDrug} from "./types.ts";

type Props = {
    open: boolean;
    /** null to add a shared drug */
    drug: AdminDrug | null;
    onClose: () => void;
};

/**
 * The super admin's shared-drug dialog (design M1.7 D9): the clinic's drug dialog without the default dosing (a
 * shared drug never has one) and without any Arabic-name field. Same locking rules (`FormDialog`, `useDialogSave`,
 * a fresh form per opening).
 */
export const SharedDrugDialog = ({open, drug, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const opening = useOpeningKey(open);

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <FormDialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            <DialogTitle>{drug === null ? t("adminDrugs.new") : t("adminDrugs.edit")}</DialogTitle>
            <SharedDrugForm key={opening} drug={drug} onClose={onClose}/>
        </FormDialog>
    );
};

const SharedDrugForm = ({drug, onClose}: { drug: AdminDrug | null; onClose: () => void }) => {
    const {t} = useTranslation();
    const save = useSaveSharedDrug();
    // staleTime 0: fetched again on each opening
    const categories = useAdminCategories();

    return (
        <DrugEditForm
            initial={drug}
            categories={categories.data ?? []}
            onReloadCategories={() => void categories.refetch()}
            withDosing={false}
            save={({defaultDosing: _none, ...body}) => {
                void _none;
                return save.mutateAsync({id: drug?.id ?? null, ...body});
            }}
            isPending={save.isPending}
            savedText={drug === null ? t("drugs.created") : t("drugs.updated")}
            onClose={onClose}
        />
    );
};
