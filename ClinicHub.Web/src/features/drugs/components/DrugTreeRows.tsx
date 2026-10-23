import type {MouseEvent, ReactNode} from "react";
import {Box, Chip, IconButton, Stack, Tooltip, Typography} from "@mui/material";
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

/** The treeitem itself takes the focus; its own line (not its children) shows the focus ring. */
const itemSx = {
    outline: "none",
    "&:focus-visible > .drug-tree-line": {outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2},
} as const;

const lineSx = {
    display: "flex",
    gap: 1,
    pr: 1.5,
    borderRadius: 1,
    cursor: "pointer",
    "&:hover": {bgcolor: "action.hover"},
} as const;

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
    /** Its `role="group"` (rendered only while open) */
    children?: ReactNode;
};

/** A category (level 1) or subcategory (level 2) row: chevron, name, count; a click (first of a burst) toggles it. */
export const DrugTreeNode = ({id, level, name, count, expanded, nav, onToggle, children}: NodeProps) => {
    const {t} = useTranslation();
    const {dir} = useLanguage();
    const formatCount = useFormatCount();
    const ClosedIcon = dir === "rtl" ? ChevronLeftIcon : ChevronRightIcon;
    const toggleLabel = t(expanded ? "drugTree.close" : "drugTree.open", {name});
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
                    ...lineSx, alignItems: "center", flexWrap: "wrap", columnGap: 0.5, py: 0.5, pl: level === 1 ? 0.5 : 3,
                    // A touch target on a phone
                    minHeight: {xs: 44, sm: 0},
                }}
            >
                <Tooltip title={toggleLabel}>
                    {/* Not a Tab stop and doesn't take the focus: the row does */}
                    <IconButton size="small" tabIndex={-1} aria-label={toggleLabel} onMouseDown={(event) => event.preventDefault()}>
                        {expanded ? <ExpandMoreIcon fontSize="small"/> : <ClosedIcon fontSize="small"/>}
                    </IconButton>
                </Tooltip>
                <Typography sx={{flex: "1 1 8rem", minWidth: 0, overflowWrap: "anywhere", fontWeight: level === 1 ? 600 : 500}}>
                    {name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{marginInlineStart: "auto", flexShrink: 0}}>
                    {formatCount(count)}
                </Typography>
            </Box>
            {expanded && children}
        </Box>
    );
};

type DrugProps = {
    id: string;
    drug: Drug;
    added: boolean;
    nav: TreeNav;
    onPick: () => void;
};

/**
 * A drug row (design M1.7 D9): the name (never an Arabic name), the ingredients on one line (full text in a tooltip;
 * wrapped on a phone), an own drug's dosing sentence, «مشترك» / «خاص بالعيادة», «مُضاف» or ⊕. No description.
 */
export const DrugTreeDrug = ({id, drug, added, nav, onPick}: DrugProps) => {
    const {t} = useTranslation();
    return (
        <Box {...treeItemProps(id, nav)} aria-level={3} aria-label={drug.name} sx={itemSx}
             onClick={(event) => {
                 // A double click adds once
                 if (event.detail > 1) return;
                 onPick();
             }}>
            <Box className="drug-tree-line" sx={{...lineSx, alignItems: "flex-start", py: 1, pl: 7}}>
                <Box sx={{flex: 1, minWidth: 0}}>
                    {/* Isolated: a Latin name reads left to right in the Arabic UI (M1.7b D27) */}
                    <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}><bdi>{drug.name}</bdi></Typography>
                    {drug.activeIngredients && (
                        // The tap is the row's own action (adds the drug); on a phone the text wraps instead
                        <TapTooltip title={drug.activeIngredients} tap={false}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                // The line takes its own text's direction: its beginning stays visible and the ellipsis
                                // sits at its end, a Latin line in the Arabic UI too (M1.7c C34)
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
                                <bdi>{drug.activeIngredients}</bdi>
                            </Typography>
                        </TapTooltip>
                    )}
                    {/* A shared drug has no default dosing */}
                    {!drug.isShared && <DosingText dosing={drug.defaultDosing}/>}
                    <Stack direction="row" sx={{gap: 0.75, mt: 0.5, flexWrap: "wrap"}}>
                        <Chip
                            size="small"
                            variant="outlined"
                            color={drug.isShared ? "default" : "primary"}
                            label={drug.isShared ? t("drugs.chip.shared") : t("drugs.chip.own")}
                        />
                        {/* success.dark, not success.main: on a focused row's tint success.main is below WCAG AA's 4.5:1 (as the pickers) */}
                        {added && <Chip size="small" color="success" variant="outlined" icon={<CheckIcon/>} label={t("common.added")}
                                        sx={{color: "success.dark", borderColor: "success.dark", "& .MuiChip-icon": {color: "success.dark"}}}/>}
                    </Stack>
                </Box>
                {!added && <AddIcon color="action" fontSize="small" sx={{mt: 0.5}}/>}
            </Box>
        </Box>
    );
};
