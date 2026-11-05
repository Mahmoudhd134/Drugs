import {type ReactElement, useLayoutEffect, useRef} from "react";
import {Button, IconButton, Stack, Tooltip, Typography} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RedoIcon from "@mui/icons-material/Redo";
import RemoveIcon from "@mui/icons-material/Remove";
import UndoIcon from "@mui/icons-material/Undo";
import {useTranslation} from "react-i18next";
import {useLanguage} from "../../../hooks/useLanguage.ts";
import {canZoomIn, canZoomOut} from "../dragGeometry.ts";

type Props = {
    canUndo: boolean;
    canRedo: boolean;
    zoom: number;
    onUndo: () => void;
    onRedo: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onFit: () => void;
    /** A focused button just turned off: the focus must go somewhere (TPL-557) */
    onFocusedButtonOff: () => void;
};

/**
 * Undo, redo and zoom (step 3 contract § 3.2): a plain row of named buttons, no `role="toolbar"`, which would promise arrow-key
 * focus. Its order flips with the language; the arrows of undo and redo mirror, minus and plus don't.
 */
export const TemplateToolbar = ({canUndo, canRedo, zoom, onUndo, onRedo, onZoomOut, onZoomIn, onFit, onFocusedButtonOff}: Props) => {
    const {t} = useTranslation();
    const {dir} = useLanguage();
    const row = useRef<HTMLDivElement>(null);

    // After every render: a button that turned off still holds the focus here, and the browser would drop it to the body
    useLayoutEffect(() => {
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && active.disabled && row.current?.contains(active)) onFocusedButtonOff();
    });

    const mirrored = {transform: dir === "rtl" ? "scaleX(-1)" : undefined};

    // span: a disabled button can't show a tooltip
    const withTooltip = (label: string, button: ReactElement) => (
        <Tooltip title={label}><span>{button}</span></Tooltip>
    );

    const iconButton = (label: string, icon: ReactElement, disabled: boolean, onClick: () => void) => withTooltip(label, (
        <IconButton size="small" aria-label={label} disabled={disabled} onClick={onClick}>{icon}</IconButton>
    ));

    return (
        <Stack ref={row} direction="row" data-testid="template-toolbar" sx={{alignItems: "center", gap: 0.5}}>
            {iconButton(t("printTemplates.toolbar.undo"), <UndoIcon sx={mirrored}/>, !canUndo, onUndo)}
            {iconButton(t("printTemplates.toolbar.redo"), <RedoIcon sx={mirrored}/>, !canRedo, onRedo)}
            {iconButton(t("printTemplates.toolbar.zoomOut"), <RemoveIcon/>, !canZoomOut(zoom), onZoomOut)}
            <Typography variant="body2" data-testid="template-zoom-percent" dir="ltr" sx={{minWidth: "3em", textAlign: "center"}}>
                {`${Math.round(zoom)}%`}
            </Typography>
            {iconButton(t("printTemplates.toolbar.zoomIn"), <AddIcon/>, !canZoomIn(zoom), onZoomIn)}
            {withTooltip(t("printTemplates.toolbar.fit"), <Button size="small" onClick={onFit}>{t("printTemplates.toolbar.fit")}</Button>)}
        </Stack>
    );
};
