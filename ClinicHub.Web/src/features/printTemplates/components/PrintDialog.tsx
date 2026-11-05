import {type ClipboardEvent, type FormEvent, useState} from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import {useTranslation} from "react-i18next";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {MANUAL_VALUE_MAX_LENGTH} from "../constants.ts";
import {singleLine} from "../printHtml.ts";
import type {ManualInputItem} from "../types.ts";

type Props = {
    /** The template's manual inputs in order; null: closed */
    items: ManualInputItem[] | null;
    /** The values by item id, trimmed */
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
};

/** The fields, empty per opening: the `key` of each opening mounts a fresh form (TPL-115). */
const PrintForm = ({items, onConfirm, onCancel}: { items: ManualInputItem[] } & Pick<Props, "onConfirm" | "onCancel">) => {
    const {t} = useTranslation();
    const [values, setValues] = useState<Record<string, string>>({});

    const submit = (event: FormEvent) => {
        event.preventDefault();
        onConfirm(Object.fromEntries(items.map(item => [item.id, (values[item.id] ?? "").trim()])));
    };

    /** An `<input>` would delete a pasted line break: it becomes a space here, inserted at the selection within the limit (TPL-114). */
    const paste = (event: ClipboardEvent<HTMLInputElement>, id: string) => {
        event.preventDefault();
        const input = event.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const room = MANUAL_VALUE_MAX_LENGTH - (input.value.length - (end - start));
        // Never half of a surrogate pair at the limit
        const text = singleLine(event.clipboardData.getData("text/plain")).slice(0, Math.max(room, 0)).replace(/[\uD800-\uDBFF]$/, "");
        input.setRangeText(text, start, end, "end");
        setValues(current => ({...current, [id]: input.value}));
    };

    return (
        <DialogForm onSubmit={submit}>
            <DialogContent>
                <Stack sx={{gap: 2}}>
                    <Typography variant="body2" color="text.secondary">{t("printTemplates.print.hint")}</Typography>
                    {items.map((item, index) => (
                        <TextField
                            key={item.id}
                            // Keeps its own direction, whatever the UI's (TPL-312)
                            label={<bdi>{item.name}</bdi>}
                            value={values[item.id] ?? ""}
                            onChange={event => setValues(current => ({...current, [item.id]: singleLine(event.target.value)}))}
                            fullWidth
                            autoFocus={index === 0}
                            slotProps={{
                                htmlInput: {
                                    maxLength: MANUAL_VALUE_MAX_LENGTH,
                                    dir: "auto",
                                    onPaste: (event: ClipboardEvent<HTMLInputElement>) => paste(event, item.id),
                                },
                            }}
                        />
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onCancel}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained">{t("prescription.print")}</Button>
            </DialogActions>
        </DialogForm>
    );
};

/** The pop-up (contract § 3.3). A click outside does nothing; Esc and Cancel close only the pop-up, and the focus returns to Print. */
export const PrintDialog = ({items, onConfirm, onCancel}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const opening = useOpeningKey(items !== null);
    // The closing dialog keeps its fields until it has faded out
    const [shown, setShown] = useState(items);
    if (items && items !== shown) setShown(items);

    return (
        <Dialog
            open={items !== null}
            onClose={(_, reason) => reason !== "backdropClick" && onCancel()}
            fullWidth
            maxWidth="xs"
            fullScreen={fullScreen}
        >
            <DialogTitle>{t("printTemplates.print.title")}</DialogTitle>
            {shown && <PrintForm key={opening} items={shown} onConfirm={onConfirm} onCancel={onCancel}/>}
        </Dialog>
    );
};
