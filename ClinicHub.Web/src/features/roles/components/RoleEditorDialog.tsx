import {useEffect, useRef, useState} from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {splitFormErrors, toApiError} from "../../../api/errors.ts";
import {FormDialog} from "../../../components/common/FormDialog.tsx";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {useDialogSave} from "../../../hooks/useDialogSave.ts";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {type PermissionDefinition, usePermissionCatalog} from "../../access/api.ts";
import {withRequirements} from "../permissionChoice.ts";
import {useSaveRole} from "../useRoles.ts";
import type {Role, RolesAdapter} from "../types.ts";
import {PermissionPicker} from "./PermissionPicker.tsx";

/** The longest role name the API takes (`FieldLimits.RoleNameMaxLength`). */
const NAME_MAX_LENGTH = 100;

type Props = {
    open: boolean;
    /** null = a new role */
    role: Role | null;
    adapter: RolesAdapter;
    onClose: () => void;
};

/** Create or edit a role: its name and permissions (never the Owner role: it is locked). */
export const RoleEditorDialog = ({open, role, adapter, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const save = useSaveRole(adapter);
    const catalog = usePermissionCatalog();
    // Each opening starts from the role given, also when reopened during the closing animation
    const opening = useOpeningKey(open);

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <FormDialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            <DialogTitle sx={{overflowWrap: "anywhere"}}>
                {role === null ? t("roles.editor.newTitle") : t("roles.editor.editTitle", {name: role.name})}
            </DialogTitle>
            {catalog.data ? (
                <RoleForm key={opening} role={role} catalog={catalog.data} save={save} onClose={onClose}/>
            ) : (
                <>
                    <DialogContent>
                        {catalog.isError ? (
                            <Alert
                                severity="error"
                                action={<Button color="inherit" size="small" onClick={() => void catalog.refetch()}>{t("common.retry")}</Button>}
                            >
                                {t("common.loadFailed")}
                            </Alert>
                        ) : (
                            <Box sx={{display: "flex", justifyContent: "center", py: 4}}><CircularProgress aria-label={t("common.loading")}/></Box>
                        )}
                    </DialogContent>
                    <DialogActions sx={{px: 3, pb: 2}}>
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                    </DialogActions>
                </>
            )}
        </FormDialog>
    );
};

type FormProps = {
    role: Role | null;
    catalog: PermissionDefinition[];
    save: ReturnType<typeof useSaveRole>;
    onClose: () => void;
};

const RoleForm = ({role, catalog, save, onClose}: FormProps) => {
    const {t} = useTranslation();
    const nameInput = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(role?.name ?? "");
    const [permissions, setPermissions] = useState(() => new Set(withRequirements(catalog, role?.permissions ?? [])));
    // Keys the role has that the loaded catalog doesn't know (the API was updated since the app loaded it): kept as they are
    const unknownKeys = (role?.permissions ?? []).filter(key => !catalog.some(p => p.key === key));
    const [nameError, setNameError] = useState<string | null>(null);
    const total = catalog.length;
    // An API error on the name: the input gets the focus once it is enabled again (disabled while saving)
    const focusName = useRef(false);
    useEffect(() => {
        if (save.isPending || !focusName.current) return;
        focusName.current = false;
        nameInput.current?.focus();
    });

    // One save at a time, locked once saved (a double click would create the role twice)
    const {submit, done} = useDialogSave(async () => {
        if (!name.trim()) {
            setNameError(t("errors.nameRequired"));
            nameInput.current?.focus();
            return false;
        }
        try {
            const saved = await save.mutateAsync({
                id: role?.id ?? null,
                name: name.trim(),
                permissions: [...withRequirements(catalog, permissions), ...unknownKeys],
            });
            toast.success(t(role === null ? "roles.created" : "roles.updated", {name: saved.name}));
            onClose();
            return true;
        } catch (error) {
            const {fields, others} = splitFormErrors(error, ["name"], {roleNameTaken: "name"});
            if (fields.name) {
                setNameError(fields.name);
                focusName.current = true;
            }
            if (others.length) toast.error(others.join("\n"));
            // The role (or the clinic) is gone meanwhile: nothing left to edit (the list loads again without it)
            if (toApiError(error)?.status !== 404) return false;
            onClose();
            return true;
        }
    });

    return (
        <DialogForm onSubmit={submit}>
            <DialogContent sx={{pt: 1}}>
                <Stack sx={{gap: 2.5, pt: 1}}>
                    <TextField
                        label={t("roles.editor.name")}
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setNameError(null);
                        }}
                        error={nameError !== null}
                        helperText={nameError}
                        inputRef={nameInput}
                        disabled={save.isPending}
                        // Role names may be typed in any language
                        slotProps={{htmlInput: {dir: "auto", maxLength: NAME_MAX_LENGTH}}}
                        required
                        autoFocus
                        fullWidth
                    />
                    <div>
                        <Typography variant="subtitle1" component="h2" sx={{fontWeight: 700}}>
                            {t("roles.editor.permissions")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}} aria-live="polite">
                            {t("roles.editor.permissionsHint")} {t("roles.editor.picked", {selected: permissions.size, total})}
                        </Typography>
                        <PermissionPicker
                            catalog={catalog}
                            value={permissions}
                            onChange={keys => setPermissions(new Set(keys))}
                            disabled={save.isPending}
                        />
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={save.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={save.isPending || done}>
                    {save.isPending ? t("common.saving") : t("common.save")}
                </Button>
            </DialogActions>
        </DialogForm>
    );
};
