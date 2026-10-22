import {Button, DialogActions, DialogContent, DialogTitle, useMediaQuery} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import {useTranslation} from "react-i18next";
import {FormDialog} from "../../../components/common/FormDialog.tsx";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {useDrugCategories, useSaveDrug} from "../api.ts";
import type {Drug} from "../types.ts";
import {DrugDetails} from "./DrugDetails.tsx";
import {DrugEditForm} from "./DrugEditForm.tsx";

type Props = {
    open: boolean;
    /** null to create a new drug */
    drug: Drug | null;
    /** Show the drug's details without editing (no edit permission; always for a shared drug) */
    readOnly?: boolean;
    onClose: () => void;
};

export const DrugFormDialog = ({open, drug, readOnly, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const opening = useOpeningKey(open);
    // A shared drug is read-only for every clinic user (design M1.7 D2, D9)
    const showDetails = drug !== null && (readOnly || drug.isShared);

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <FormDialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            <DialogTitle>{drug === null ? t("drugs.new") : showDetails ? t("drugs.details") : t("drugs.edit")}</DialogTitle>
            {showDetails ? (
                <>
                    <DialogContent sx={{pt: 1}}>
                        <DrugDetails drug={drug}/>
                    </DialogContent>
                    <DialogActions sx={{px: 3, pb: 2}}>
                        <Button onClick={onClose}>{t("common.close")}</Button>
                    </DialogActions>
                </>
            ) : (
                // Each opening starts from the given drug, also when reopened during the closing animation
                <OwnDrugForm key={opening} drug={drug} onClose={onClose}/>
            )}
        </FormDialog>
    );
};

const OwnDrugForm = ({drug, onClose}: { drug: Drug | null; onClose: () => void }) => {
    const {t} = useTranslation();
    const saveDrug = useSaveDrug();
    // Fetched again on each opening: a category the super admin just created is listed (design M1.7 D5)
    const categories = useDrugCategories({refetchOnMount: "always"});

    return (
        <DrugEditForm
            initial={drug}
            categories={categories.data ?? []}
            onReloadCategories={() => void categories.refetch()}
            withDosing
            save={(body) => saveDrug.mutateAsync({id: drug?.id ?? null, ...body})}
            isPending={saveDrug.isPending}
            savedText={drug === null ? t("drugs.created") : t("drugs.updated")}
            onClose={onClose}
        />
    );
};
