import {type ReactNode, useCallback, useState} from "react";
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from "@mui/material";
import {useTranslation} from "react-i18next";

type ConfirmOptions = {
    title: ReactNode;
    message?: ReactNode;
    confirmText?: ReactNode;
    destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (confirmed: boolean) => void };

/**
 * Promise-based confirmation dialog: `if (await confirm({...})) ...`.
 * Render the returned `dialog` element somewhere in the component.
 */
export const useConfirm = () => {
    const {t} = useTranslation();
    const [pending, setPending] = useState<PendingConfirm | null>(null);

    const confirm = useCallback(
        (options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({...options, resolve})),
        []
    );

    const close = (confirmed: boolean) => {
        pending?.resolve(confirmed);
        setPending(null);
    };

    const dialog = (
        <Dialog open={!!pending} onClose={() => close(false)} maxWidth="xs" fullWidth>
            {/* A long unbroken name (e.g. in the title) wraps instead of widening the dialog */}
            <DialogTitle sx={{overflowWrap: "anywhere"}}>{pending?.title}</DialogTitle>
            {pending?.message && (
                <DialogContent>
                    <DialogContentText sx={{whiteSpace: "pre-line", overflowWrap: "anywhere"}}>{pending.message}</DialogContentText>
                </DialogContent>
            )}
            <DialogActions sx={{px: 3, pb: 2}}>
                {/* A destructive action never runs on a stray Enter: the focus starts on Cancel */}
                <Button onClick={() => close(false)} autoFocus={pending?.destructive}>{t("common.cancel")}</Button>
                <Button
                    variant="contained"
                    color={pending?.destructive ? "error" : "primary"}
                    onClick={() => close(true)}
                    autoFocus={!pending?.destructive}
                >
                    {pending?.confirmText ?? t("common.delete")}
                </Button>
            </DialogActions>
        </Dialog>
    );

    return {confirm, dialog};
};
