import {useState} from "react";
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useMediaQuery} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {DosingFields} from "../../dosing/components/DosingFields.tsx";
import {dosingErrors, isDosingEmpty, normalizeDosing, type Dosing} from "../../dosing/types.ts";
import type {EditorItem} from "../editorItem.ts";

type Props = {
    /** The group line being edited; null when closed */
    item: EditorItem | null;
    onClose: () => void;
    /** Returns false when the change clashes with another line (same drug, same eye) */
    onSave: (key: string, dosing: Dosing) => boolean;
};

/** Edits a group line's dosing override (empty fields use the drug's default). */
export const GroupItemDialog = ({item, onClose, onSave}: Props) => {
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

    return (
        <Dialog open={!!item} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
            {item && <ItemForm key={item.key} item={item} onClose={onClose} onSave={onSave}/>}
        </Dialog>
    );
};

const ItemForm = ({item, onClose, onSave}: { item: EditorItem } & Omit<Props, "item">) => {
    const {t} = useTranslation();
    const [dosing, setDosing] = useState<Dosing>(item.dosing);
    const [showErrors, setShowErrors] = useState(false);

    const handleSave = () => {
        if (dosingErrors(dosing).length) {
            setShowErrors(true);
            return;
        }
        if (!onSave(item.key, normalizeDosing(dosing))) {
            toast.error(t("groups.alreadyInGroupForEye", {name: item.drug.name}));
            return;
        }
        onClose();
    };

    return (
        <>
            <DialogTitle>
                {t("groups.itemDosing")}
                <Typography color="text.secondary" sx={{fontWeight: 600}}>{item.drug.name}</Typography>
            </DialogTitle>
            <DialogContent>
                <Stack sx={{gap: 1.5, pt: 1}}>
                    <Typography variant="body2" color="text.secondary">{t("dosing.inheritHint")}</Typography>
                    <DosingFields
                        value={dosing}
                        onChange={setDosing}
                        showErrors={showErrors}
                        inheritFrom={item.drug.defaultDosing ?? null}
                        allowAskEye
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button
                    startIcon={<RestartAltIcon/>}
                    onClick={() => setDosing({})}
                    disabled={isDosingEmpty(dosing)}
                    sx={{me: "auto"}}
                >
                    {t("dosing.resetToDefault")}
                </Button>
                <Button onClick={onClose}>{t("common.cancel")}</Button>
                <Button variant="contained" onClick={handleSave}>{t("common.save")}</Button>
            </DialogActions>
        </>
    );
};
