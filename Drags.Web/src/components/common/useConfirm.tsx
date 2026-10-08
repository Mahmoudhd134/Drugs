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
            <DialogTitle>{pending?.title}</DialogTitle>
            {pending?.message && (
                <DialogContent>
                    <DialogContentText>{pending.message}</DialogContentText>
                </DialogContent>
            )}
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={() => close(false)}>{t("common.cancel")}</Button>
                <Button
                    variant="contained"
                    color={pending?.destructive ? "error" : "primary"}
                    onClick={() => close(true)}
                    autoFocus
                >
                    {pending?.confirmText ?? t("common.delete")}
                </Button>
            </DialogActions>
        </Dialog>
    );

    return {confirm, dialog};
};
