import {type SetStateAction, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {flushSync} from "react-dom";
import {Box, Button, Stack, Tooltip} from "@mui/material";
import {useTranslation} from "react-i18next";
import {AREA_BOTTOM_GAP_PX, AREA_MIN_HEIGHT_PX, AREA_PADDING_PX, CSS_PX_PER_MM} from "../constants.ts";
import {type Box as MmBox, fitZoom, handlesFor, zoomIn, zoomOut} from "../dragGeometry.ts";
import {calibrationCutsItems, canAddItem, updateItem} from "../layout.ts";
import type {AttachmentsAdapter} from "../../attachments/types.ts";
import type {TimeTravel} from "../layoutHistory.ts";
import type {AddableItem, TemplatePage} from "../types.ts";
import type {Draft, DraftOps} from "../useDesignerDraft.ts";
import {useDesignerDrag} from "../useDesignerDrag.ts";
import {useDesignerKeys} from "../useDesignerKeys.ts";
import {useLatest} from "../useLatest.ts";
import {TemplateDragGhost} from "./TemplateDragGhost.tsx";
import {TemplateOverlay} from "./TemplateOverlay.tsx";
import {PaperImageScope, type PaperImageView} from "./TemplatePaperImage.tsx";
import {TemplateSettings} from "./TemplateSettings.tsx";
import {TemplateSheet} from "./TemplateSheet.tsx";
import {TemplateSidePanel} from "./TemplateSidePanel.tsx";
import {TemplateToolbar} from "./TemplateToolbar.tsx";

type Props = {
    draft: Draft;
    ops: DraftOps;
    canUndo: boolean;
    canRedo: boolean;
    dirty: boolean;
    saving: boolean;
    onSave: () => void;
    onTestPrint: () => void;
    onDelete: () => void;
    /** The message a field shows, by its key */
    messageOf: (key: string) => string | undefined;
    /** The picture's routes; none: no section and no request (TPL-644) */
    paperAdapter?: AttachmentsAdapter;
    /** Goes up with each refused Save or Test print */
    refusals: number;
};

/** The zoom that shows the whole sheet in the area now (step 3 contract § 3.8). */
const fitOf = (area: HTMLElement | null, page: TemplatePage) => {
    if (!area) return 100;
    // A scrollbar showing at this zoom won't show at Fit: its room counts, so Fit gives the same zoom from any zoom
    const padding = 2 * AREA_PADDING_PX;
    return fitZoom(Math.max(area.clientWidth, area.offsetWidth) - padding, Math.max(area.clientHeight, area.offsetHeight) - padding, page);
};

/**
 * What shows at ≥ 900 px with a draft: the panel, the sheet with its zoom and drags, the settings. Mounted only then, so the
 * keys listen only then (§ 3.5), a drag ends with it (TPL-514), and the zoom starts at Fit however the sheet first appears
 * (load, «إنشاء قالب», widening from below 900 px: TPL-588).
 */
export const TemplateWorkspace = ({draft, ops, canUndo, canRedo, dirty, saving, onSave, onTestPrint, onDelete, messageOf, paperAdapter, refusals}: Props) => {
    const {t} = useTranslation();
    const root = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const sideColumn = useRef<HTMLDivElement>(null);
    const settings = useRef<HTMLElement>(null);
    const sheet = useRef<HTMLDivElement>(null);
    const saveButton = useRef<HTMLButtonElement>(null);
    const [zoom, setZoom] = useState(100);
    const page = useLatest(draft.layout.page);

    const focusArea = () => area.current?.focus();
    const boxElement = (id: string) => sheet.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    const showBox = (id: string) => boxElement(id)?.scrollIntoView({block: "nearest", inline: "nearest"});

    // A fixed height from the window, so Fit isn't measured against its own content. Set on the element, before the fit below
    // reads it, in the same layout pass. The window changing keeps the zoom. The side column takes the same height: it scrolls on its own from 900 to
    // 1199 px, and from 1200 px it has no box of its own (`display: contents`), so the height means nothing there
    useLayoutEffect(() => {
        const element = area.current;
        if (!element) return;
        const measure = () => {
            const topInPage = element.getBoundingClientRect().top + window.scrollY;
            const height = `${Math.max(AREA_MIN_HEIGHT_PX, window.innerHeight - topInPage - AREA_BOTTOM_GAP_PX)}px`;
            element.style.height = height;
            if (sideColumn.current) sideColumn.current.style.height = height;
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    useLayoutEffect(() => setZoom(fitOf(area.current, page.current)), [draft.fitRequests, page]);

    // After every render, as the toolbar's: Save off still holds the focus here, and the browser would drop it to the body (TPL-596)
    useLayoutEffect(() => {
        const button = saveButton.current;
        if (button?.disabled && document.activeElement === button) focusArea();
    });

    // A refused Save or Test print: its message comes into view, once rendered (TPL-701). Nothing else moves. The whole field, since the message is below the
    // input. After a press only: `refusals` outlives this workspace, and widening the window mounts it anew with nothing pressed
    const answeredRefusals = useRef(refusals);
    useEffect(() => {
        if (refusals === answeredRefusals.current) return;
        answeredRefusals.current = refusals;
        settings.current?.querySelector('[aria-invalid="true"]')?.closest(".MuiFormControl-root")?.scrollIntoView({block: "nearest"});
    }, [refusals]);

    useEffect(() => {
        if (draft.revealId) sheet.current?.querySelector(`[data-item-id="${draft.revealId}"]`)?.scrollIntoView({block: "nearest", inline: "nearest"});
    }, [draft.revealId]);

    const dropNew = (addable: AddableItem, label: string, box: MmBox) => {
        const id = flushSync(() => ops.dropNew(addable, label, box));
        if (id) boxElement(id)?.focus({preventScroll: true});
    };

    const drag = useDesignerDrag({
        area,
        sheet,
        zoom,
        layout: draft.layout,
        onSelect: ops.select,
        onCommitBox: ops.commitBox,
        onDropNew: dropNew,
    });
    const {view} = drag;

    // A drag runs on this preview, so a clean template stays clean and Esc leaves nothing behind (design § 3 settled)
    const shownLayout = useMemo(
        () => (view?.kind === "item" ? updateItem(draft.layout, view.itemId, view.box) : draft.layout),
        [draft.layout, view],
    );
    const selected = draft.layout.items.find(item => item.id === draft.selectedId) ?? null;
    const shownSelected = shownLayout.items.find(item => item.id === draft.selectedId) ?? null;

    /** Now, not at the next paint: the selected box is scrolled to where the new zoom put it (TPL-595). */
    const changeZoom = (next: SetStateAction<number>) => {
        flushSync(() => setZoom(next));
        if (draft.selectedId) showBox(draft.selectedId);
    };

    /** An undo or a redo, rendered with the zoom of a step that re-fits, since `flushSync` also runs that render. */
    const travel = (move: () => TimeTravel | null) => {
        // Read before the render: a box the step removes takes the focus with it, down to the page's body
        const focusedId = document.activeElement?.closest("[data-item-id]")?.getAttribute("data-item-id");
        const answer = flushSync(move);
        if (!answer) return;
        if (focusedId && !answer.layout.items.some(item => item.id === focusedId)) focusArea();
        if (answer.selectedId) showBox(answer.selectedId);
    };
    const undo = () => travel(ops.undo);
    const redo = () => travel(ops.redo);

    const removeItem = (item: Parameters<DraftOps["removeSelected"]>[0]) => {
        ops.removeSelected(item);
        // The pressed button leaves with the item: without this the focus would fall to the page's body
        focusArea();
    };

    useDesignerKeys({
        root,
        selected,
        onUndo: undo,
        onRedo: redo,
        onNudge: (item, dxMm, dyMm) => {
            // Now, not at the next paint: the box is scrolled to where it just went (TPL-561)
            flushSync(() => ops.nudge(item, dxMm, dyMm, Date.now()));
            showBox(item.id);
        },
        onDelete: removeItem,
        onDeselect: () => ops.select(null),
    });

    const handles = view?.kind === "item" ? view.handles : selected ? handlesFor(selected, zoom) : [];

    const screen = ({sheetPaper, section}: PaperImageView) => (
        <Stack ref={root} data-testid="template-designer" sx={{gap: 2}}>
            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap"}}>
                <TemplateToolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    zoom={zoom}
                    onUndo={undo}
                    onRedo={redo}
                    onZoomOut={() => changeZoom(zoomOut)}
                    onZoomIn={() => changeZoom(zoomIn)}
                    onFit={() => changeZoom(fitOf(area.current, draft.layout.page))}
                    onFocusedButtonOff={focusArea}
                />
                <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>
                    <Button ref={saveButton} variant="contained" disabled={!dirty || saving} onClick={onSave}>
                        {t("common.save")}
                    </Button>
                    <Tooltip describeChild title={t("printTemplates.testPrint.hint")}>
                        <Button
                            variant="outlined"
                            // A double click prints once; a keyboard click's `detail` is 0 (TPL-634, TPL-708)
                            onClick={(event) => {
                                if (event.detail <= 1) onTestPrint();
                            }}
                        >
                            {t("printTemplates.testPrint.button")}
                        </Button>
                    </Tooltip>
                    {draft.baseline !== null && (
                        <Button color="error" variant="outlined" onClick={onDelete}>{t("common.delete")}</Button>
                    )}
                </Stack>
            </Stack>
            <Box sx={{
                display: "grid",
                gap: 2,
                alignItems: "start",
                gridTemplateColumns: {md: "260px minmax(0, 1fr)", lg: "200px minmax(0, 1fr) 280px"},
            }}>
                {/* One element tree at both widths, so the panel and the settings stay mounted across the breakpoint (step 4 contract § 4.6) */}
                <Box
                    ref={sideColumn}
                    data-testid="template-side-column"
                    sx={{
                        display: {md: "flex", lg: "contents"},
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                        // From 900 to 1199 px only: from 1200 px it has no box of its own to scroll
                        overflowY: {md: "auto", lg: "visible"},
                        // From 1200 px these two are the grid's children, on either side of the area
                        "& > :first-of-type": {order: {lg: 1}},
                        "& > :last-of-type": {order: {lg: 3}},
                    }}
                >
                    <TemplateSidePanel
                        canAdd={canAddItem(draft.layout)}
                        onAdd={ops.add}
                        onEntryPress={drag.pressEntry}
                        swallowClick={drag.swallowClick}
                    />
                    <TemplateSettings
                        panelRef={settings}
                        page={draft.layout.page}
                        item={shownSelected}
                        calibration={draft.layout.calibration}
                        cutsItems={calibrationCutsItems(shownLayout)}
                        onCalibration={ops.changeCalibration}
                        paperSection={section}
                        rawInputs={draft.rawInputs}
                        typedPage={draft.typedPage}
                        messageOf={messageOf}
                        onPageSize={ops.changePageSize}
                        onPageMeasureType={ops.typePageMeasure}
                        onPageMeasure={ops.commitPageMeasure}
                        onItemNumber={ops.changeItemNumber}
                        onItemText={ops.changeItemText}
                        onItemCommit={ops.commitField}
                        onRemove={removeItem}
                    />
                </Box>
                <Box
                    ref={area}
                    role="region"
                    aria-label={t("printTemplates.sheet.label")}
                    tabIndex={0}
                    dir="ltr"
                    sx={{
                        order: {lg: 2},
                        overflow: "auto",
                        minWidth: 0,
                        padding: `${AREA_PADDING_PX}px`,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                    }}
                >
                    <Box
                        data-testid="template-sheet-frame"
                        sx={{mx: "auto", boxShadow: 1}}
                        style={{
                            position: "relative",
                            width: draft.layout.page.widthMm * CSS_PX_PER_MM * zoom / 100,
                            height: draft.layout.page.heightMm * CSS_PX_PER_MM * zoom / 100,
                        }}
                    >
                        {/* Around the sheet, never inside: print renders the same sheet at true size. Absolute, so it takes the
                            sheet's width and only the frame sizes the scroll (a block would take the frame's and scale it twice) */}
                        <div style={{position: "absolute", left: 0, top: 0, transform: `scale(${zoom / 100})`, transformOrigin: "0 0"}}>
                            <TemplateSheet
                                layout={shownLayout}
                                selectedId={draft.selectedId}
                                onSelect={(id, event) => {
                                    if (!drag.swallowClick(event)) ops.select(id);
                                }}
                                onBoxPress={drag.pressBox}
                                sheetRef={sheet}
                                sampleText={t("printTemplates.sheet.sampleText")}
                                zoom={zoom}
                                paper={sheetPaper}
                            />
                        </div>
                        <TemplateOverlay
                            zoom={zoom}
                            box={shownSelected}
                            handles={handles}
                            guides={view?.guides ?? []}
                            onHandlePress={(event, handle) => {
                                if (selected) drag.pressHandle(event, selected, handle);
                            }}
                        />
                    </Box>
                </Box>
            </Box>
            {view?.kind === "entry" && <TemplateDragGhost label={view.label} point={view.point} widthPx={view.widthPx} heightPx={view.heightPx} zoom={zoom}/>}
        </Stack>
    );

    return paperAdapter
        ? <PaperImageScope adapter={paperAdapter}>{screen}</PaperImageScope>
        : screen({sheetPaper: null, section: null});
};
