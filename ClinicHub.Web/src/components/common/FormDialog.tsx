import {useState} from "react";
import {Dialog, type DialogProps} from "@mui/material";
import {DialogSavingContext} from "../../hooks/useDialogSave.ts";

type Props = Omit<DialogProps, "onClose"> & { onClose: () => void };

/**
 * The dialog of a create/edit form that saves through `useDialogSave`: Esc and a backdrop click don't close it while
 * the save is in flight (the answer would come after the form is gone); Cancel is the form's to disable.
 */
export const FormDialog = ({onClose, children, ...props}: Props) => {
    const [saving, setSaving] = useState(false);
    return (
        <Dialog {...props} onClose={saving ? undefined : onClose}>
            <DialogSavingContext.Provider value={setSaving}>{children}</DialogSavingContext.Provider>
        </Dialog>
    );
};
