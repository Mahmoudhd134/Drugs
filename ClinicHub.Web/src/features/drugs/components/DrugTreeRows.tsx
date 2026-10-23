import type {MouseEvent, ReactNode} from "react";
import {alpha, Box, Chip, IconButton, Stack, type Theme, Tooltip, Typography} from "@mui/material";
import type {SvgIconComponent} from "@mui/icons-material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import {useTranslation} from "react-i18next";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";
import {useLanguage} from "../../../hooks/useLanguage.ts";
import {useFormatCount} from "../../../i18n/numbers.ts";
import {DosingText} from "../../dosing/components/DosingText.tsx";
import type {Drug} from "../types.ts";

/** What every tree row needs from the tree: the roving tab stop and the row elements (to move the focus). */
export type TreeNav = {
    /** The row that is the tree's one Tab stop */
    activeId: string | undefined;
    rowRef: (id: string, element: HTMLElement | null) => void;
};

/**
 * The treeitem itself takes the focus; its own line (not its children) shows the focus ring. A row scrolled into view
 * by the keyboard stops below the pinned category line (R4).
 */
const itemSx = {
    outline: "none",
    scrollMarginTop: 56,
    "&:focus-visible > .drug-tree-line": {outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2},
} as const;

const lineSx = {
    display: "flex",
    gap: 1,
    pr: 1.5,
    borderRadius: 1.5,
    cursor: "pointer",
    "&:hover": {bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.06)},
} as const;

/** The thin line that ties an open node to its children, under its icon (category) or chevron (subcategory). */
const guideSx = (level: 1 | 2) => ({
    ml: level === 1 ? "21px" : "17px",
    pl: 0.5,
    borderLeft: 1,
    borderColor: "divider",
});

/** A click that comes from inside the row's `role="group"` (its nested rows and their buttons). */
const isFromChildren = (event: MouseEvent<HTMLElement>) => {
    const group = (event.target as HTMLElement).closest('[role="group"]');
    return group !== null && event.currentTarget.contains(group);
};

const treeItemProps = (id: string, nav: TreeNav) => ({
    role: "treeitem",
    "data-row-id": id,
    tabIndex: id === nav.activeId ? 0 : -1,
    ref: (element: HTMLElement | null) => nav.rowRef(id, element),
});

type NodeProps = {
    id: string;
    level: 1 | 2;
    name: string;
    count: number;
    expanded: boolean;
    nav: TreeNav;
    onToggle: () => void;
    /** A category's pictogram (R4); subcategories have none */
    icon?: SvgIconComponent;
    /** Its `role="group"` (rendered only while open) */
    children?: ReactNode;
};

/**
 * A category (level 1) or subcategory (level 2) row: chevron, a category's pictogram, name, count; a click (first of a
 * burst) toggles it. An open category's line stays pinned at the panel's top while its drugs scroll (R4).
 */
export const DrugTreeNode = ({id, level, name, count, expanded, nav, onToggle, icon: Icon, children}: NodeProps) => {
    const {t} = useTranslation();
    const {dir} = useLanguage();
    const formatCount = useFormatCount();
    const toggleLabel = t(expanded ? "drugTree.close" : "drugTree.open", {name});
    const category = level === 1;
    return (
        <Box {...treeItemProps(id, nav)} aria-level={level} aria-expanded={expanded}
             aria-label={t("drugTree.nodeLabel", {name, count})} sx={itemSx}
             onClick={(event) => {
                 // A click in its children (a nested row, «تحميل المزيد», a retry) is theirs, not this row's
                 if (isFromChildren(event)) return;
                 // A double click opens once (its second click has detail 2)
                 if (event.detail > 1) return;
                 event.currentTarget.focus();
                 onToggle();
             }}>
            <Box
                className="drug-tree-line"
                sx={{
                    ...lineSx, alignItems: "center", columnGap: category ? 1.25 : 0.5, py: category ? 0.75 : 0.25, pl: category ? 0.5 : 0, pr: 1,
                    // A touch target on a phone
                    minHeight: {xs: 44, sm: category ? 48 : 36},
                    ...(category && expanded && {
                        position: "sticky", top: 0, zIndex: 2, bgcolor: "background.paper", borderRadius: 0,
                        boxShadow: (theme: Theme) => `0 1px 0 ${theme.palette.divider}`,
                    }),
                }}
            >
                {Icon && (
                    <Box aria-hidden sx={{
                        width: 34, height: 34, flexShrink: 0, borderRadius: 2, display: "grid", placeItems: "center",
                        color: expanded ? "primary.contrastText" : "primary.main",
                        bgcolor: (theme: Theme) => expanded ? theme.palette.primary.main : alpha(theme.palette.primary.main, 0.09),
                        transition: "background-color 150ms ease, color 150ms ease",
                        "@media (prefers-reduced-motion: reduce)": {transition: "none"},
                    }}>
                        <Icon sx={{fontSize: 20}}/>
                    </Box>
                )}
                {!category && <Chevron label={toggleLabel} expanded={expanded} dir={dir}/>}
                <Typography sx={{
                    flex: "1 1 8rem", minWidth: 0, overflowWrap: "anywhere",
                    fontWeight: category ? 600 : 500, fontSize: category ? "0.95rem" : "0.9rem",
                    color: category || expanded ? "text.primary" : "text.secondary",
                }}>
                    {name}
                </Typography>
                <Typography component="span" variant="caption" sx={{
                    marginInlineStart: "auto", flexShrink: 0, px: 1, py: 0.25, borderRadius: 99, lineHeight: 1.5,
                    fontVariantNumeric: "tabular-nums", fontWeight: 600,
                    color: expanded ? "primary.dark" : "text.secondary",
                    bgcolor: (theme: Theme) => expanded ? alpha(theme.palette.primary.main, 0.1) : theme.palette.grey[100],
                }}>
                    {formatCount(count)}
                </Typography>
                {category && <Chevron label={toggleLabel} expanded={expanded} dir={dir}/>}
            </Box>
            {expanded && <Box sx={guideSx(level)}>{children}</Box>}
        </Box>
    );
};

/** A node's open/close button: not a Tab stop and never takes the focus (the row does). */
const Chevron = ({label, expanded, dir}: { label: string; expanded: boolean; dir: string }) => (
    <Tooltip title={label}>
        <IconButton size="small" tabIndex={-1} aria-label={label} onMouseDown={(event) => event.preventDefault()}>
            {expanded ? <ExpandMoreIcon fontSize="small"/> : dir === "rtl" ? <ChevronLeftIcon fontSize="small"/> : <ChevronRightIcon fontSize="small"/>}
        </IconButton>
    </Tooltip>
);

/** What a click on a drug row does: "add" (the pickers: «مُضاف» or ⊕) or "open" (the drugs page: neither). */
export type DrugRowMode = "add" | "open";

type DrugProps = {
    id: string;
    drug: Drug;
    added: boolean;
    mode: DrugRowMode;
    /** Buttons at the row's end (the drugs page's ✎ / 🗑); their clicks never reach the row */
    actions?: ReactNode;
    nav: TreeNav;
    onPick: () => void;
};

/**
 * A drug row (design M1.7 D9): the name (never an Arabic name), the ingredients on one line (full text in a tooltip;
 * wrapped on a phone), an own drug's dosing sentence, «خاص بالعيادة» on an own drug (a shared drug has no chip, M1.7
 * review R2), then «مُضاف» or ⊕ when it adds. No description.
 */
export const DrugTreeDrug = ({id, drug, added, mode, actions, nav, onPick}: DrugProps) => {
    const {t} = useTranslation();
    const adds = mode === "add";
    return (
        <Box {...treeItemProps(id, nav)} aria-level={3} aria-label={drug.name} sx={itemSx}
             onClick={(event) => {
                 // A double click adds once
                 if (event.detail > 1) return;
                 onPick();
             }}>
            <Box className="drug-tree-line" sx={{...lineSx, alignItems: "flex-start", py: 1, pl: {xs: 0.5, sm: 1}, pr: {xs: 0.5, sm: 1}}}>
                <Box sx={{flex: 1, minWidth: 0}}>
                    {/* Isolated: a Latin name reads left to right in the Arabic UI (M1.7b D27) */}
                    <Typography sx={{fontWeight: 600, fontSize: "0.9rem", overflowWrap: "anywhere"}}><bdi>{drug.name}</bdi></Typography>
                    {drug.activeIngredients && (
                        // The tap is the row's own action (adds the drug); on a phone the text wraps instead
                        <TapTooltip title={drug.activeIngredients} tap={false}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                // The line takes its own text's direction: its beginning stays visible and the ellipsis
                                // sits at its end, a Latin line in the Arabic UI too (M1.7c C34). The text sits directly
                                // in the line, no `<bdi>`: `dir="auto"` skips a `<bdi>` child when it looks for the first
                                // strong character, so the line would fall back to left to right (CAT-262)
                                dir="auto"
                                sx={{
                                    overflowWrap: "anywhere",
                                    whiteSpace: {xs: "normal", sm: "nowrap"},
                                    overflow: {sm: "hidden"},
                                    textOverflow: {sm: "ellipsis"},
                                    // A line that fits starts at the interface's start side: `left` is flipped to
                                    // `right` in Arabic by the RTL style cache (a line too long is start-aligned in its
                                    // own direction by CSS, so its beginning shows)
                                    textAlign: "left",
                                }}
                            >
                                {drug.activeIngredients}
                            </Typography>
                        </TapTooltip>
                    )}
                    {/* A shared drug has no default dosing */}
                    {!drug.isShared && <DosingText dosing={drug.defaultDosing}/>}
                    {(!drug.isShared || (adds && added)) && (
                        <Stack direction="row" sx={{gap: 0.75, mt: 0.5, flexWrap: "wrap"}}>
                            {!drug.isShared && <Chip size="small" variant="outlined" color="primary" label={t("drugs.chip.own")}/>}
                            {/* success.dark, not success.main: on a focused row's tint success.main is below WCAG AA's 4.5:1 (as the pickers) */}
                            {adds && added && <Chip size="small" color="success" variant="outlined" icon={<CheckIcon/>} label={t("common.added")}
                                                    sx={{color: "success.dark", borderColor: "success.dark", "& .MuiChip-icon": {color: "success.dark"}}}/>}
                        </Stack>
                    )}
                </Box>
                {adds && !added && (
                    // The row is the button; this only shows that a click adds
                    <Box aria-hidden sx={{
                        width: 28, height: 28, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
                        border: 1.5, borderColor: "primary.main", color: "primary.main", mt: 0.25,
                        ".drug-tree-line:hover &": {bgcolor: "primary.main", color: "primary.contrastText"},
                    }}>
                        <AddIcon sx={{fontSize: 18}}/>
                    </Box>
                )}
                {actions && (
                    <Box sx={{flexShrink: 0, whiteSpace: "nowrap"}} onClick={(event) => event.stopPropagation()}>
                        {actions}
                    </Box>
                )}
            </Box>
        </Box>
    );
};
