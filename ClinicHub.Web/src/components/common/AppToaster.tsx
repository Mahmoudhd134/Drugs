import {type CSSProperties, type ReactNode, type TouchEvent, useCallback, useRef, useState} from "react";
import {IconButton, Tooltip, useMediaQuery, useTheme} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {useTranslation} from "react-i18next";
import toast, {type Toast, ToastBar, type ToastPosition, useToaster} from "react-hot-toast";

const POSITION: ToastPosition = "bottom-center";
/** Space between stacked toasts and from the screen edges (px), as react-hot-toast's own `Toaster`. */
const GUTTER = 8;
const EDGE = 16;
/** How far (px) a finger must swipe a toast sideways to close it; a shorter move springs it back. */
const SWIPE_CLOSE_PX = 60;

/**
 * One toast: the library's bar plus a small × icon button «إغلاق» / "Close" at its end (the reading end, so the left in
 * Arabic) that closes it at once, and a sideways swipe on a touch screen that closes it too. Closing removes this
 * toast only, without the library's 1 s exit delay.
 */
const DismissibleToast = ({item}: { item: Toast }) => {
    const {t} = useTranslation();
    const start = useRef<{ x: number; y: number } | null>(null);
    const [dx, setDx] = useState(0);
    const close = () => toast.remove(item.id);

    const onTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        start.current = touch ? {x: touch.clientX, y: touch.clientY} : null;
    };
    const onTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!start.current || !touch) return;
        const moveX = touch.clientX - start.current.x;
        // A mostly vertical move is a scroll, not a swipe
        if (Math.abs(moveX) >= Math.abs(touch.clientY - start.current.y)) setDx(moveX);
    };
    const onTouchEnd = () => {
        start.current = null;
        if (Math.abs(dx) >= SWIPE_CLOSE_PX) close();
        else setDx(0);
    };

    return (
        <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => {
                start.current = null;
                setDx(0);
            }}
            style={{
                // Only a toast on screen takes the pointer (one leaving lets it through to the page)
                pointerEvents: item.visible ? "auto" : "none",
                // The finger moves the toast sideways; the page still scrolls vertically
                touchAction: "pan-y",
                transform: dx ? `translateX(${dx}px)` : undefined,
                opacity: dx ? Math.max(0.3, 1 - Math.abs(dx) / 200) : undefined,
                transition: dx ? undefined : "transform 150ms, opacity 150ms",
            }}
        >
            <ToastBar toast={item} position={POSITION}>
                {({icon, message}) => (
                    <>
                        {icon}
                        {message}
                        <Tooltip title={t("common.close")}>
                            <IconButton size="small" onClick={close} aria-label={t("common.close")} sx={{my: -0.5}}>
                                <CloseIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    </>
                )}
            </ToastBar>
        </div>
    );
};

/** A toast's row across the toaster, measured so the toasts above it stack (react-hot-toast's own toast wrapper). */
const ToastRow = ({id, style, onHeight, children}: {
    id: string;
    style: CSSProperties;
    onHeight: (id: string, height: number) => void;
    children: ReactNode;
}) => {
    const measure = useCallback((el: HTMLDivElement | null) => {
        if (!el) return;
        const update = () => onHeight(id, el.getBoundingClientRect().height);
        update();
        new MutationObserver(update).observe(el, {subtree: true, childList: true, characterData: true});
    }, [id, onHeight]);
    return <div ref={measure} style={style}>{children}</div>;
};

/**
 * The app's toasts (react-hot-toast, headless through `useToaster`, laid out as its own `Toaster`), bottom-center:
 * multi-line messages (`\n`), long names wrap, and each toast can be closed before its time (tech overview § App shell
 * "Dismissing"). A mouse over the toasts pauses their timers, as in the library; a finger doesn't: a tap also fires
 * mouse events, and once the tapped toast is removed the pointer never "leaves", so the others would stay paused.
 */
export const AppToaster = () => {
    const theme = useTheme();
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const {toasts, handlers} = useToaster({
        // A long unbroken name wraps instead of running off the screen
        style: {fontFamily: theme.typography.fontFamily, whiteSpace: "pre-line", overflowWrap: "anywhere"},
    });
    const {startPause, endPause, calculateOffset, updateHeight} = handlers;

    return (
        <div
            data-rht-toaster=""
            style={{position: "fixed", zIndex: 9999, inset: EDGE, pointerEvents: "none"}}
            onPointerEnter={e => {
                if (e.pointerType === "mouse") startPause();
            }}
            onPointerLeave={endPause}
        >
            {toasts.map(item => (
                <ToastRow key={item.id} id={item.id} onHeight={updateHeight} style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    justifyContent: "center",
                    // A visible toast paints over one still sliding out
                    zIndex: item.visible ? 9999 : undefined,
                    // Newest at the bottom, the older ones stacked above it
                    transform: `translateY(${-calculateOffset(item, {gutter: GUTTER, defaultPosition: POSITION})}px)`,
                    transition: reducedMotion ? undefined : "all 230ms cubic-bezier(.21,1.02,.73,1)",
                }}>
                    <DismissibleToast item={item}/>
                </ToastRow>
            ))}
        </div>
    );
};
