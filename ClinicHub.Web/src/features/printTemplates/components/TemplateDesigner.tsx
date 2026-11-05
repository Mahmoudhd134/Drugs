import {useMemo} from "react";
import {Alert, Box, Button, CircularProgress, useMediaQuery, useTheme} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage, getFieldErrors} from "../../../api/errors.ts";
import {useDeletePrintTemplate, usePrintTemplate, useSavePrintTemplate} from "../api.ts";
import {itemIndexOfField, newLayout, normalizeLayout, parseMmInput, validateLayout} from "../layout.ts";
import {endRun, isDirty} from "../layoutHistory.ts";
import type {LayoutError, PrintTemplateAdapter, TemplateItem} from "../types.ts";
import {type Draft, startDraft, useDesignerDraft, withTypedPageCommitted} from "../useDesignerDraft.ts";
import {useUnsavedGuard} from "../useUnsavedGuard.ts";
import {TemplateWorkspace} from "./TemplateWorkspace.tsx";

/** An item's error field as a draft key: `items[2].name` → `i5.name`; `page.widthMm` stays; null: no item there. */
const keyOfField = (field: string, items: TemplateItem[]) => {
    const index = itemIndexOfField(field);
    if (index === null) return field;
    const item = items[index];
    return item ? `${item.id}${field.slice(field.indexOf("]") + 1)}` : null;
};

/** The fields the settings show a message on; any other error is toasted (contract § 3.3, Save). */
const SHOWN_FIELD = /^(page\.(size|widthMm|heightMm)|items\[\d+]\.(name|text|xMm|yMm|wMm|hMm|fontSizePt))$/;

/** The first problem's item: the lowest index among the rules' errors and the raw inputs. */
const firstProblemItem = (errors: LayoutError[], draft: Draft) => {
    const indexes = [
        ...errors.map(error => itemIndexOfField(error.field)),
        ...draft.layout.items.map((item, index) =>
            Object.keys(draft.rawInputs).some(key => key.startsWith(`${item.id}.`)) ? index : null),
    ].filter(index => index !== null);
    return indexes.length > 0 ? draft.layout.items[Math.min(...indexes)]?.id ?? null : null;
};

/**
 * The print template designer (contract § 3): the data and the draft live here, above the desktop-only switch, so narrowing
 * the window keeps the edits (TPL-229). Mounted per clinic: `ClinicPage` keys its `PageBoundary` by the clinic (TPL-245).
 * Reusable (design D5): all its data comes through the adapter.
 */
export const TemplateDesigner = ({adapter}: { adapter: PrintTemplateAdapter }) => {
    const {t} = useTranslation();
    const desktop = useMediaQuery(useTheme().breakpoints.up("md"), {noSsr: true});
    const template = usePrintTemplate(adapter);
    const save = useSavePrintTemplate(adapter);
    const remove = useDeletePrintTemplate(adapter);
    const once = useSingleFlight();
    const {confirm, dialog: confirmDialog} = useConfirm();
    const {draft, setDraft, ops, canUndoNow, canRedoNow} = useDesignerDraft();

    // Seeded once, from an answer made since the mount (a cached copy is never shown): a later refetch never overwrites a
    // draft. Without a draft (no template, or just deleted) the screen follows the query
    const answered = template.isFetchedAfterMount && template.isSuccess;
    if (!draft && answered && template.data) setDraft(startDraft(template.data.layout, template.data.layout));

    const dirty = draft !== null && isDirty(draft.layout, draft.baseline, {...draft.rawInputs, ...draft.typedPage});
    const {dialog: guardDialog} = useUnsavedGuard(dirty);

    const layout = draft?.layout;
    const errors = useMemo(() => (layout ? validateLayout(layout) : []), [layout]);

    const handleSave = () => once(async () => {
        if (!draft) return;
        // The field's blur usually did this already; not when no blur came (the window narrowed and widened while typing)
        const committed = withTypedPageCommitted(draft);
        const problems = validateLayout(committed.layout);
        if (problems.length > 0 || Object.keys(committed.rawInputs).length > 0) {
            const hidden = new Set(problems.filter(problem => !SHOWN_FIELD.test(problem.field)).map(problem => problem.code));
            hidden.forEach(code => toast.error(t(`errors.${code}`)));
            setDraft({
                ...committed,
                // Save ends a run of nudges, whatever comes of it (TPL-558)
                history: endRun(committed.history),
                selectedId: firstProblemItem(problems, committed) ?? committed.selectedId,
                touched: new Set([
                    ...committed.touched,
                    ...problems.map(problem => keyOfField(problem.field, committed.layout.items)).filter(key => key !== null),
                ]),
            });
            return;
        }

        setDraft({...committed, history: endRun(committed.history)});
        const sent = normalizeLayout(committed.layout);
        try {
            await save.mutateAsync(sent);
            toast.success(t("printTemplates.saved"));
            setDraft(current => current && {...current, baseline: sent});
        } catch (error) {
            toast.error(getErrorMessage(error));
            const serverErrors = getFieldErrors(error);
            const named = Object.keys(serverErrors).map(itemIndexOfField).find(index => index !== null);
            setDraft(current => current && {
                ...current,
                serverErrors,
                selectedId: (named === undefined ? null : current.layout.items[named]?.id) ?? current.selectedId,
            });
        }
    });

    const handleDelete = () => once(async () => {
        const confirmed = await confirm({title: t("printTemplates.deleteConfirm"), destructive: true});
        if (!confirmed) return;
        try {
            await remove.mutateAsync();
            setDraft(null);
            toast.success(t("printTemplates.deleted"));
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    /** A field's message: the raw text's, else the rules' once it was touched, else the server's. */
    const messageOf = (current: Draft) => (key: string) => {
        const raw = current.rawInputs[key];
        if (raw !== undefined) {
            return key.startsWith("page.") && parseMmInput(raw) !== null
                ? t("errors.templatePageInvalid")
                : t("printTemplates.numberRequired");
        }
        const failure = current.touched.has(key)
            ? errors.find(error => keyOfField(error.field, current.layout.items) === key)
            : undefined;
        if (failure) return t(`errors.${failure.code}`);
        const serverField = Object.keys(current.serverErrors).find(field => keyOfField(field, current.layout.items) === key);
        return serverField ? current.serverErrors[serverField] : undefined;
    };

    const content = () => {
        if (!desktop) return <Alert severity="info">{t("printTemplates.desktopOnly")}</Alert>;
        if (draft) {
            return (
                <TemplateWorkspace
                    draft={draft}
                    ops={ops}
                    canUndo={canUndoNow}
                    canRedo={canRedoNow}
                    dirty={dirty}
                    saving={save.isPending}
                    onSave={() => void handleSave()}
                    onDelete={() => void handleDelete()}
                    messageOf={messageOf(draft)}
                />
            );
        }
        if (template.isError && template.isFetchedAfterMount) {
            return (
                <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void template.refetch()}>{t("common.retry")}</Button>}>
                    {t("common.loadFailed")}
                </Alert>
            );
        }
        if (!answered) {
            return <Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress aria-label={t("common.loading")}/></Box>;
        }
        return (
            <EmptyState
                icon={<PrintIcon/>}
                title={t("printTemplates.empty")}
                action={(
                    <Button variant="contained" onClick={(event) => {
                        if (event.detail <= 1) setDraft(startDraft(newLayout(), null));
                    }}>
                        {t("printTemplates.create")}
                    </Button>
                )}
            />
        );
    };

    return (
        <>
            {content()}
            {confirmDialog}
            {guardDialog}
        </>
    );
};
