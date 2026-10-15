import {type FormEvent, useEffect, useId, useRef, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormGroup,
    FormHelperText,
    FormLabel,
    Stack,
    Switch,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {splitFormErrors, toApiError} from "../../../api/errors.ts";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {useRoles} from "../../roles/useRoles.ts";
import type {Role, RolesAdapter} from "../../roles/types.ts";
import {useRoleLabel} from "../../roles/roleLabel.ts";
import {useSaveStaff} from "../useStaff.ts";
import type {StaffAdapter, StaffMember} from "../types.ts";

/** The form's inputs, by the request field the API names in its errors. */
type Field = "phone" | "fullName" | "roleIds";
const FIELDS: Field[] = ["phone", "fullName", "roleIds"];
/** `staffExists` (409) names no field: it is about the phone */
const CODE_FIELDS = {staffExists: "phone"};

type Props = {
    open: boolean;
    /** null = add someone by phone */
    member: StaffMember | null;
    adapter: StaffAdapter;
    /** The clinic's roles, to pick from */
    rolesAdapter: RolesAdapter;
    onClose: () => void;
};

/** Add a staff member (phone, full name, roles) or edit one (full name, active, roles; the phone can't change). */
export const StaffEditorDialog = ({open, member, adapter, rolesAdapter, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const save = useSaveStaff(adapter);
    const roles = useRoles(rolesAdapter);
    // Each opening starts from the member given, also when reopened during the closing animation
    const [opening, setOpening] = useState(0);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setOpening(n => n + 1);
    }

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <Dialog open={open} onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
            <DialogTitle sx={{overflowWrap: "anywhere"}}>
                {member === null ? t("staff.editor.addTitle") : t("staff.editor.editTitle", {name: member.fullName})}
            </DialogTitle>
            {roles.data ? (
                <StaffForm key={opening} member={member} roles={roles.data} save={save} onClose={onClose}/>
            ) : (
                <>
                    <DialogContent>
                        {roles.isError ? (
                            <Alert
                                severity="error"
                                action={<Button color="inherit" size="small" onClick={() => void roles.refetch()}>{t("common.retry")}</Button>}
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
        </Dialog>
    );
};

type FormProps = {
    member: StaffMember | null;
    roles: Role[];
    save: ReturnType<typeof useSaveStaff>;
    onClose: () => void;
};

const StaffForm = ({member, roles, save, onClose}: FormProps) => {
    const {t} = useTranslation();
    const roleLabel = useRoleLabel();
    const once = useSingleFlight();
    const adding = member === null;
    const [phone, setPhone] = useState("");
    const [fullName, setFullName] = useState(member?.fullName ?? "");
    const [isActive, setIsActive] = useState(member?.isActive ?? true);
    const [roleIds, setRoleIds] = useState<number[]>(member?.roles.map(r => r.id) ?? []);
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
    const activeHintId = useId();
    const rolesErrorId = useId();
    // The first invalid input gets the focus once it is enabled again (inputs are disabled while saving)
    const focusNext = useRef<Field | null>(null);
    useEffect(() => {
        if (save.isPending || !focusNext.current) return;
        inputs.current[focusNext.current]?.focus();
        focusNext.current = null;
    });

    const showErrors = (next: Partial<Record<Field, string>>) => {
        setErrors(next);
        focusNext.current = FIELDS.find(f => next[f]) ?? null;
    };
    const clearError = (field: Field) => setErrors(e => ({...e, [field]: undefined}));

    // Roles deleted meanwhile are not offered (nor sent)
    const pickedIds = roleIds.filter(id => roles.some(r => r.id === id));

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        // One save at a time (a double click would add the person twice)
        void once(async () => {
            const required: Partial<Record<Field, string>> = {
                phone: adding && !phone.trim() ? t("staff.editor.phoneRequired") : undefined,
                fullName: fullName.trim() ? undefined : t("errors.nameRequired"),
                roleIds: pickedIds.length ? undefined : t("errors.rolesRequired"),
            };
            if (FIELDS.some(f => required[f])) {
                showErrors(required);
                return;
            }
            try {
                const saved = await save.mutateAsync(adding
                    ? {id: null, body: {phone: phone.trim(), fullName: fullName.trim(), roleIds: pickedIds}}
                    : {id: member.id, body: {fullName: fullName.trim(), isActive, roleIds: pickedIds}});
                toast.success(t(adding ? "staff.added" : "staff.updated", {name: saved.fullName}));
                onClose();
            } catch (error) {
                const {fields, others} = splitFormErrors(error, FIELDS, CODE_FIELDS);
                showErrors(fields);
                const code = toApiError(error)?.code;
                // Why the clinic needs its owner, and what to do instead
                const messages = code === "lastOwner" ? [...others, t("staff.lastOwnerHint")] : others;
                if (messages.length) toast.error(messages.join("\n"), {duration: code === "lastOwner" ? 8000 : undefined});
                // The staff member (or the clinic) is gone meanwhile: nothing left to edit (the list loads again)
                if (toApiError(error)?.status === 404) onClose();
            }
        });
    };

    const toggleRole = (id: number) => {
        setRoleIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
        clearError("roleIds");
    };

    return (
        <DialogForm onSubmit={handleSubmit}>
            <DialogContent sx={{pt: 1}}>
                <Stack sx={{gap: 2.5, pt: 1}}>
                    <TextField
                        label={t("staff.editor.phone")}
                        value={adding ? phone : member.phone}
                        onChange={(e) => {
                            setPhone(e.target.value);
                            clearError("phone");
                        }}
                        error={!!errors.phone}
                        helperText={errors.phone ?? (adding ? t("staff.editor.phoneHint") : t("staff.editor.phoneLocked"))}
                        inputRef={(input: HTMLInputElement | null) => {
                            inputs.current.phone = input;
                        }}
                        type="tel"
                        autoComplete="off"
                        // The phone of a staff member can't change: shown, not editable
                        disabled={!adding || save.isPending}
                        required={adding}
                        autoFocus={adding}
                        fullWidth
                        // Phones stay left to right in Arabic
                        slotProps={{htmlInput: {dir: "ltr", inputMode: "tel", maxLength: 30}}}
                    />
                    <TextField
                        label={t("staff.editor.fullName")}
                        value={fullName}
                        onChange={(e) => {
                            setFullName(e.target.value);
                            clearError("fullName");
                        }}
                        error={!!errors.fullName}
                        helperText={errors.fullName ?? (adding ? undefined : t("staff.editor.fullNameHint"))}
                        inputRef={(input: HTMLInputElement | null) => {
                            inputs.current.fullName = input;
                        }}
                        autoComplete="off"
                        disabled={save.isPending}
                        required
                        autoFocus={!adding}
                        fullWidth
                        slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                    />
                    {!adding && (
                        <Box>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        disabled={save.isPending}
                                        slotProps={{input: {"aria-describedby": activeHintId}}}
                                    />
                                }
                                label={t("staff.editor.active")}
                            />
                            <Typography id={activeHintId} variant="body2" color="text.secondary">
                                {isActive ? t("staff.editor.activeHint") : t("staff.editor.inactiveHint")}
                            </Typography>
                        </Box>
                    )}
                    <FormControl
                        component="fieldset"
                        error={!!errors.roleIds}
                        disabled={save.isPending}
                        required
                    >
                        <FormLabel component="legend" sx={{fontWeight: 600}}>{t("staff.editor.roles")}</FormLabel>
                        <FormGroup>
                            {roles.map((role, index) => (
                                <FormControlLabel
                                    key={role.id}
                                    control={
                                        <Checkbox
                                            checked={pickedIds.includes(role.id)}
                                            onChange={() => toggleRole(role.id)}
                                            // The focus lands here on a roles error: it is said with the box
                                            slotProps={{
                                                input: {
                                                    "aria-invalid": !!errors.roleIds,
                                                    "aria-describedby": errors.roleIds ? rolesErrorId : undefined,
                                                },
                                            }}
                                            inputRef={index === 0 ? (input: HTMLInputElement | null) => {
                                                inputs.current.roleIds = input;
                                            } : undefined}
                                        />
                                    }
                                    label={
                                        <Box sx={{py: 0.5}}>
                                            <Box component="span" dir="auto" sx={{overflowWrap: "anywhere"}}>{roleLabel(role)}</Box>
                                            {role.isOwner && (
                                                <Typography variant="caption" color="text.secondary" sx={{display: "block"}}>
                                                    {t("staff.editor.ownerHint")}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                    sx={{alignItems: "flex-start", "& .MuiCheckbox-root": {pt: 0.5}}}
                                />
                            ))}
                        </FormGroup>
                        {errors.roleIds && <FormHelperText id={rolesErrorId}>{errors.roleIds}</FormHelperText>}
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={save.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={save.isPending}>
                    {save.isPending ? t("common.saving") : adding ? t("staff.editor.add") : t("common.save")}
                </Button>
            </DialogActions>
        </DialogForm>
    );
};
