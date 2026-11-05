import {useEffect, useMemo, useRef, useState} from "react";
import {Alert, Box, Button, CircularProgress, Stack, useMediaQuery, useTheme} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage, getFieldErrors} from "../../../api/errors.ts";
import {useDeletePrintTemplate, usePrintTemplate, useSavePrintTemplate} from "../api.ts";
import {MAX_CUSTOM_HEIGHT_MM, MAX_CUSTOM_WIDTH_MM, MIN_CUSTOM_HEIGHT_MM, MIN_CUSTOM_WIDTH_MM} from "../constants.ts";
import {
    addItem,
    applyPageSize,
    canAddItem,
    itemIndexOfField,
    newLayout,
    normalizeLayout,
    pageOfSize,
    parseMmInput,
    removeItem,
    sameLayout,
    toTenths,
    updateItem,
    validateLayout,
} from "../layout.ts";
import type {AddableItem, LayoutError, PageSize, PrintLayout, PrintTemplateAdapter, TemplateItem} from "../types.ts";
import {useUnsavedGuard} from "../useUnsavedGuard.ts";
import {type BoxField, type PageMeasure, TemplateSettings} from "./TemplateSettings.tsx";
import {TemplateSheet} from "./TemplateSheet.tsx";
import {TemplateSidePanel} from "./TemplateSidePanel.tsx";

/** The designer's local state (contract § 3.6). Keys of `rawInputs` and `touched`: `<itemId>.<field>`, `page.widthMm`… */
type Draft = {
    layout: PrintLayout;
    /** What the screen compares with: the template as loaded or as last sent; null: a new sheet, never saved */
    baseline: PrintLayout | null;
    /** Text typed in a number field that the layout couldn't take */
    rawInputs: Record<string, string>;
    /** Text typed in a sheet measure, not committed yet, that differs from the committed number: unsaved, nothing moves */
    typedPage: Partial<Record<PageMeasure, string>>;
    selectedId: string | null;
    /** The item just added, whose box is scrolled into view */
    revealId: string | null;
    /** Fields changed since the load, or with a problem when Save was pressed: only these show the rules' messages */
    touched: ReadonlySet<string>;
    /** The server's messages by its field (`items[2].name`), until the next edit */
    serverErrors: Record<string, string>;
};

const startDraft = (layout: PrintLayout, baseline: PrintLayout | null): Draft =>
    ({layout, baseline, rawInputs: {}, typedPage: {}, selectedId: null, revealId: null, touched: new Set(), serverErrors: {}});

/** An item's error field as a draft key: `items[2].name` → `i5.name`; `page.widthMm` stays; null: no item there. */
const keyOfField = (field: string, items: TemplateItem[]) => {
    const index = itemIndexOfField(field);
    if (index === null) return field;
    const item = items[index];
    return item ? `${item.id}${field.slice(field.indexOf("]") + 1)}` : null;
};

/** The fields the settings show a message on; any other error is toasted (contract § 3.3, Save). */
const SHOWN_FIELD = /^(page\.(size|widthMm|heightMm)|items\[\d+]\.(name|text|xMm|yMm|wMm|hMm|fontSizePt))$/;

/** The field that shows a size's "outside the sheet" error (`validateLayout` names X or Y), so typing the size marks it too. */
const START_OF_SIZE: Partial<Record<BoxField, BoxField>> = {wMm: "xMm", hMm: "yMm"};

/** Without the entries of a key prefix (a removed item's). */
const withoutPrefix = <T, >(entries: Record<string, T>, prefix: string) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(prefix)));

const without = <T, >(entries: Record<string, T>, key: string) => {
    const copy = {...entries};
    delete copy[key];
    return copy;
};

/** A custom measure committed: within the rules it applies; anything else moves nothing and stays as typed. */
const commitMeasure = (current: Draft, field: PageMeasure, text: string): Draft => {
    const key = `page.${field}`;
    const value = parseMmInput(text);
    const touched = new Set(current.touched).add(key);
    const typedPage = without(current.typedPage, field);
    const [min, max] = field === "widthMm" ? [MIN_CUSTOM_WIDTH_MM, MAX_CUSTOM_WIDTH_MM] : [MIN_CUSTOM_HEIGHT_MM, MAX_CUSTOM_HEIGHT_MM];
    if (value === null || toTenths(value) < toTenths(min) || toTenths(value) > toTenths(max)) {
        return {...current, touched, typedPage, rawInputs: {...current.rawInputs, [key]: text}};
    }
    return {
        ...current,
        touched,
        typedPage,
        rawInputs: without(current.rawInputs, key),
        layout: applyPageSize(current.layout, {...current.layout.page, [field]: value}),
    };
};

/** The draft with every measure still typed committed. */
const commitTypedPage = (current: Draft) =>
    (Object.entries(current.typedPage) as [PageMeasure, string][])
        .reduce((committed, [field, text]) => commitMeasure(committed, field, text), current);

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
    const [draft, setDraft] = useState<Draft | null>(null);
    const sheetArea = useRef<HTMLDivElement>(null);

    // Seeded once, from an answer made since the mount (a cached copy is never shown): a later refetch never overwrites a
    // draft. Without a draft (no template, or just deleted) the screen follows the query
    const answered = template.isFetchedAfterMount && template.isSuccess;
    if (!draft && answered && template.data) setDraft(startDraft(template.data.layout, template.data.layout));

    const dirty = draft !== null
        && (draft.baseline === null || !sameLayout(draft.layout, draft.baseline) || Object.keys(draft.rawInputs).length > 0
            || Object.keys(draft.typedPage).length > 0);
    const {dialog: guardDialog} = useUnsavedGuard(dirty);

    const layout = draft?.layout;
    const errors = useMemo(() => (layout ? validateLayout(layout) : []), [layout]);

    const revealId = draft?.revealId;
    useEffect(() => {
        if (revealId) sheetArea.current?.querySelector(`[data-item-id="${revealId}"]`)?.scrollIntoView({block: "nearest", inline: "nearest"});
    }, [revealId]);

    /** An edit: what it changes, and the server's messages go. */
    const edit = (change: (current: Draft) => Draft) =>
        setDraft(current => current && {...change(current), serverErrors: {}});

    const add = (addable: AddableItem, defaultName: string) => edit(current => {
        const added = addItem(current.layout, addable, defaultName);
        return added ? {...current, layout: added.layout, selectedId: added.item.id, revealId: added.item.id} : current;
    });

    const changeItemNumber = (item: TemplateItem, field: BoxField, text: string) => edit(current => {
        const key = `${item.id}.${field}`;
        const value = parseMmInput(text);
        const touched = new Set(current.touched).add(key);
        const startField = START_OF_SIZE[field];
        if (startField) touched.add(`${item.id}.${startField}`);
        return value === null
            ? {...current, touched, rawInputs: {...current.rawInputs, [key]: text}}
            : {...current, touched, rawInputs: without(current.rawInputs, key), layout: updateItem(current.layout, item.id, {[field]: value})};
    });

    const changeItemText = (item: TemplateItem, field: "name" | "text", value: string) => edit(current => ({
        ...current,
        touched: new Set(current.touched).add(`${item.id}.${field}`),
        layout: updateItem(current.layout, item.id, {[field]: value}),
    }));

    const removeSelected = (item: TemplateItem) => {
        edit(current => ({
            ...current,
            layout: removeItem(current.layout, item.id),
            selectedId: null,
            // An id is reused after a removal: the next item with this one is new again
            revealId: null,
            rawInputs: withoutPrefix(current.rawInputs, `${item.id}.`),
            touched: new Set([...current.touched].filter(key => !key.startsWith(`${item.id}.`))),
        }));
        // The pressed button leaves with the item: without this the focus would fall to the page's body
        sheetArea.current?.focus();
    };

    const changePageSize = (size: PageSize) => edit(current => ({
        ...current,
        layout: applyPageSize(current.layout, pageOfSize(size, current.layout.page)),
        rawInputs: without(without(current.rawInputs, "page.widthMm"), "page.heightMm"),
        typedPage: {},
    }));

    /** A measure's keystroke: it moves nothing and counts as unsaved; typed back to the committed number, it is clean again. */
    const typePageMeasure = (field: PageMeasure, text: string) => edit(current => {
        const value = parseMmInput(text);
        return value !== null && toTenths(value) === toTenths(current.layout.page[field])
            ? {...current, typedPage: without(current.typedPage, field), rawInputs: without(current.rawInputs, `page.${field}`)}
            : {...current, typedPage: {...current.typedPage, [field]: text}};
    });

    /** A custom measure, at blur or Enter. */
    const commitPageMeasure = (field: PageMeasure, text: string) => edit(current => commitMeasure(current, field, text));

    const handleSave = () => once(async () => {
        if (!draft) return;
        // The field's blur usually did this already; not when no blur came (the window narrowed and widened while typing)
        const committed = commitTypedPage(draft);
        const problems = validateLayout(committed.layout);
        if (problems.length > 0 || Object.keys(committed.rawInputs).length > 0) {
            const hidden = new Set(problems.filter(problem => !SHOWN_FIELD.test(problem.field)).map(problem => problem.code));
            hidden.forEach(code => toast.error(t(`errors.${code}`)));
            setDraft({
                ...committed,
                selectedId: firstProblemItem(problems, committed) ?? committed.selectedId,
                touched: new Set([
                    ...committed.touched,
                    ...problems.map(problem => keyOfField(problem.field, committed.layout.items)).filter(key => key !== null),
                ]),
            });
            return;
        }

        setDraft(committed);
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
                <Stack sx={{gap: 2}}>
                    <Stack direction="row" sx={{justifyContent: "flex-end", gap: 1, flexWrap: "wrap"}}>
                        <Button variant="contained" disabled={!dirty || save.isPending} onClick={() => void handleSave()}>
                            {t("common.save")}
                        </Button>
                        {draft.baseline !== null && (
                            <Button color="error" variant="outlined" onClick={() => void handleDelete()}>{t("common.delete")}</Button>
                        )}
                    </Stack>
                    <Box sx={{
                        display: "grid",
                        gap: 2,
                        alignItems: "start",
                        gridTemplateColumns: {md: "200px minmax(0, 1fr)", lg: "200px minmax(0, 1fr) 280px"},
                    }}>
                        <TemplateSidePanel canAdd={canAddItem(draft.layout)} onAdd={add}/>
                        <Box
                            ref={sheetArea}
                            role="region"
                            aria-label={t("printTemplates.sheet.label")}
                            tabIndex={0}
                            dir="ltr"
                            sx={{
                                overflow: "auto",
                                maxHeight: "calc(100vh - 200px)",
                                minWidth: 0,
                                p: 2,
                                bgcolor: "action.hover",
                                borderRadius: 1,
                            }}
                        >
                            <Box sx={{width: "fit-content", mx: "auto", boxShadow: 1}}>
                                <TemplateSheet
                                    layout={draft.layout}
                                    selectedId={draft.selectedId}
                                    onSelect={(id) => setDraft(current => current && {...current, selectedId: id})}
                                    sampleText={t("printTemplates.sheet.sampleText")}
                                />
                            </Box>
                        </Box>
                        <TemplateSettings
                            page={draft.layout.page}
                            item={draft.layout.items.find(item => item.id === draft.selectedId) ?? null}
                            rawInputs={draft.rawInputs}
                            typedPage={draft.typedPage}
                            messageOf={messageOf(draft)}
                            onPageSize={changePageSize}
                            onPageMeasureType={typePageMeasure}
                            onPageMeasure={commitPageMeasure}
                            onItemNumber={changeItemNumber}
                            onItemText={changeItemText}
                            onRemove={removeSelected}
                        />
                    </Box>
                </Stack>
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
