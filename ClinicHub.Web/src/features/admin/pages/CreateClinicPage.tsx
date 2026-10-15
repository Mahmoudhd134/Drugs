import {type FormEvent, useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Alert, Button, Paper, Stack, TextField, Typography} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {BackButton} from "../../../components/common/BackButton.tsx";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {splitFormErrors} from "../../../api/errors.ts";
import {useCreateClinic} from "../api.ts";

/** The form's inputs, by the request field the API names in its errors. */
type Field = "name" | "owner.phone" | "owner.fullName";
const FIELDS: Field[] = ["name", "owner.phone", "owner.fullName"];

/** New clinic: its name and its owner (one form, design § 2); provisioned from the template by the API. */
export const CreateClinicPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const create = useCreateClinic();
    // One request at a time: a double click would create the clinic twice
    const once = useSingleFlight();
    const [values, setValues] = useState<Record<Field, string>>({"name": "", "owner.phone": "", "owner.fullName": ""});
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
    // The first invalid input gets the focus once it is enabled again (inputs are disabled while creating)
    const focusNext = useRef<Field | null>(null);
    useEffect(() => {
        if (create.isPending || !focusNext.current) return;
        inputs.current[focusNext.current]?.focus();
        focusNext.current = null;
    });

    const showErrors = (next: Partial<Record<Field, string>>) => {
        setErrors(next);
        focusNext.current = FIELDS.find(f => next[f]) ?? null;
    };

    const set = (field: Field, value: string) => {
        setValues(v => ({...v, [field]: value}));
        // A fixed input no longer shows its error
        setErrors(e => ({...e, [field]: undefined}));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        void once(submit);
    };

    const submit = async () => {
        const required: Partial<Record<Field, string>> = {
            "name": values.name.trim() ? undefined : t("errors.nameRequired"),
            "owner.phone": values["owner.phone"].trim() ? undefined : t("admin.create.phoneRequired"),
            "owner.fullName": values["owner.fullName"].trim() ? undefined : t("errors.nameRequired"),
        };
        if (FIELDS.some(f => required[f])) {
            showErrors(required);
            return;
        }

        try {
            const clinic = await create.mutateAsync({
                name: values.name.trim(),
                owner: {phone: values["owner.phone"].trim(), fullName: values["owner.fullName"].trim()},
            });
            toast.success(t("admin.create.created", {name: clinic.name}));
            // The form is done: Back from the clinic goes to the list, not here
            navigate(`/admin/clinics/${clinic.id}`, {replace: true});
        } catch (error) {
            const {fields, others} = splitFormErrors(error, FIELDS);
            showErrors(fields);
            // The rest (no field, or one the form has no input for) as a toast
            if (others.length) toast.error(others.join("\n"));
        }
    };

    const fieldProps = (field: Field) => ({
        value: values[field],
        onChange: (e: { target: { value: string } }) => set(field, e.target.value),
        error: !!errors[field],
        inputRef: (input: HTMLInputElement | null) => {
            inputs.current[field] = input;
        },
        disabled: create.isPending,
        required: true,
        fullWidth: true,
    });

    return (
        <>
            <PageHeader
                leading={<BackButton onClick={() => navigate("/admin")}/>}
                title={t("admin.create.title")}
                subtitle={t("admin.create.subtitle")}
            />

            <Paper variant="outlined" component="form" onSubmit={handleSubmit} noValidate sx={{p: {xs: 2, sm: 3}, maxWidth: 640}}>
                <Stack sx={{gap: 3}}>
                    <Stack sx={{gap: 2}}>
                        <Typography variant="subtitle1" component="h2" sx={{fontWeight: 700}}>{t("admin.create.clinicSection")}</Typography>
                        <TextField
                            {...fieldProps("name")}
                            label={t("admin.create.name")}
                            helperText={errors.name}
                            autoFocus
                            // Clinic names may be typed in any language
                            slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                        />
                    </Stack>
                    <Stack sx={{gap: 2}}>
                        <div>
                            <Typography variant="subtitle1" component="h2" sx={{fontWeight: 700}}>{t("admin.create.ownerSection")}</Typography>
                            <Typography variant="body2" color="text.secondary">{t("admin.create.ownerHint")}</Typography>
                        </div>
                        <TextField
                            {...fieldProps("owner.phone")}
                            label={t("admin.create.ownerPhone")}
                            helperText={errors["owner.phone"] ?? t("auth.phoneHint")}
                            type="tel"
                            autoComplete="off"
                            // Phones stay left to right in Arabic
                            slotProps={{htmlInput: {dir: "ltr", inputMode: "tel", maxLength: 30}}}
                        />
                        <TextField
                            {...fieldProps("owner.fullName")}
                            label={t("admin.create.ownerName")}
                            helperText={errors["owner.fullName"]}
                            autoComplete="off"
                            slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                        />
                    </Stack>
                    <Alert severity="info">{t("admin.create.templateNote")}</Alert>
                    <Stack direction="row" sx={{justifyContent: "flex-end", gap: 1}}>
                        <Button onClick={() => navigate("/admin")} disabled={create.isPending}>{t("common.cancel")}</Button>
                        <Button type="submit" variant="contained" disabled={create.isPending}>
                            {create.isPending ? t("admin.create.creating") : t("admin.create.submit")}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </>
    );
};
