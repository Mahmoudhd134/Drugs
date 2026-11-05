import {useLayoutEffect, useMemo, useRef, useState} from "react";
import {flushSync} from "react-dom";
import {Box, Button, Stack} from "@mui/material";
import {useTranslation} from "react-i18next";
import {AREA_BOTTOM_GAP_PX, AREA_MIN_HEIGHT_PX, AREA_PADDING_PX, CSS_PX_PER_MM} from "../constants.ts";
import {type Box as MmBox, fitZoom, handlesFor, zoomIn, zoomOut} from "../dragGeometry.ts";
import {canAddItem, updateItem} from "../layout.ts";
import type {TimeTravel} from "../layoutHistory.ts";
import type {AddableItem, TemplatePage} from "../types.ts";
import type {Draft, DraftOps} from "../useDesignerDraft.ts";
import {useDesignerDrag} from "../useDesignerDrag.ts";
import {useDesignerKeys} from "../useDesignerKeys.ts";
import {useLatest} from "../useLatest.ts";
import {TemplateDragGhost} from "./TemplateDragGhost.tsx";
import {TemplateOverlay} from "./TemplateOverlay.tsx";
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
    onDelete: () => void;
    /** The message a field shows, by its key */
    messageOf: (key: string) => string | undefined;
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
export const TemplateWorkspace = ({draft, ops, canUndo, canRedo, dirty, saving, onSave, onDelete, messageOf}: Props) => {
    const {t} = useTranslation();
    const root = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const sheet = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(100);
    const page = useLatest(draft.layout.page);

    const focusArea = () => area.current?.focus();
    const boxElement = (id: string) => sheet.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`);

    // A fixed height from the window, so Fit isn't measured against its own content. Set on the element, before the fit below
    // reads it, in the same layout pass. The window changing keeps the zoom
    useLayoutEffect(() => {
        const element = area.current;
        if (!element) return;
        const measure = () => {
            const topInPage = element.getBoundingClientRect().top + window.scrollY;
            element.style.height = `${Math.max(AREA_MIN_HEIGHT_PX, window.innerHeight - topInPage - AREA_BOTTOM_GAP_PX)}px`;
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    useLayoutEffect(() => setZoom(fitOf(area.current, page.current)), [draft.fitRequests, page]);

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

    /** A focused box the step removed: without this the focus would fall to the page's body. */
    const afterTravel = (answer: TimeTravel | null) => {
        const focusedId = document.activeElement?.closest("[data-item-id]")?.getAttribute("data-item-id");
        if (answer && focusedId && !answer.layout.items.some(item => item.id === focusedId)) focusArea();
    };
    const undo = () => afterTravel(ops.undo());
    const redo = () => afterTravel(ops.redo());

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
            boxElement(item.id)?.scrollIntoView({block: "nearest", inline: "nearest"});
        },
        onDelete: removeItem,
        onDeselect: () => ops.select(null),
    });

    const handles = view?.kind === "item" ? view.handles : selected ? handlesFor(selected, zoom) : [];

    return (
        <Stack ref={root} data-testid="template-designer" sx={{gap: 2}}>
            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap"}}>
                <TemplateToolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    zoom={zoom}
                    onUndo={undo}
                    onRedo={redo}
                    onZoomOut={() => setZoom(zoomOut)}
                    onZoomIn={() => setZoom(zoomIn)}
                    onFit={() => setZoom(fitOf(area.current, draft.layout.page))}
                    onFocusedButtonOff={focusArea}
                />
                <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>
                    <Button variant="contained" disabled={!dirty || saving} onClick={onSave}>
                        {t("common.save")}
                    </Button>
                    {draft.baseline !== null && (
                        <Button color="error" variant="outlined" onClick={onDelete}>{t("common.delete")}</Button>
                    )}
                </Stack>
            </Stack>
            <Box sx={{
                display: "grid",
                gap: 2,
                alignItems: "start",
                gridTemplateColumns: {md: "200px minmax(0, 1fr)", lg: "200px minmax(0, 1fr) 280px"},
            }}>
                <TemplateSidePanel
                    canAdd={canAddItem(draft.layout)}
                    onAdd={ops.add}
                    onEntryPress={drag.pressEntry}
                    swallowClick={drag.swallowClick}
                />
                <Box
                    ref={area}
                    role="region"
                    aria-label={t("printTemplates.sheet.label")}
                    tabIndex={0}
                    dir="ltr"
                    sx={{
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
                <TemplateSettings
                    page={draft.layout.page}
                    item={shownSelected}
                    rawInputs={draft.rawInputs}
                    messageOf={messageOf}
                    onPageSize={ops.changePageSize}
                    onPageMeasure={ops.commitPageMeasure}
                    onItemNumber={ops.changeItemNumber}
                    onItemText={ops.changeItemText}
                    onItemCommit={ops.commitField}
                    onRemove={removeItem}
                />
            </Box>
            {view?.kind === "entry" && <TemplateDragGhost label={view.label} point={view.point} widthPx={view.widthPx} heightPx={view.heightPx}/>}
        </Stack>
    );
};
