import {cloneElement, type ReactElement, type TouchEvent, useState} from "react";
import {Tooltip, type TooltipProps} from "@mui/material";

export type TapTooltipProps = Omit<TooltipProps, "open" | "enterTouchDelay" | "leaveTouchDelay" | "children"> & {
    children: ReactElement<{ onTouchEnd?: (event: TouchEvent<HTMLElement>) => void }>;
    /** Show on tap (default true). False while a tap is the control's own action (an enabled button or field). */
    tap?: boolean;
};

/**
 * A `Tooltip` that a tap on a touch screen shows at once and keeps ~5 s (`leaveTouchDelay` 5000), for a tooltip that
 * explains something (ⓘ, why a control is disabled). MUI's default needs a 700 ms long press, and even with
 * `enterTouchDelay={0}` its open timer is cancelled by a touchend that comes in the same tick (a quick tap), so the
 * tooltip is controlled and the child's touchend opens it too; MUI's own leave timer closes it. Hover and keyboard focus
 * work as in a plain `Tooltip`. The child must take the ref and the event props (a disabled control: wrap it in a span).
 */
export const TapTooltip = ({children, tap = true, onOpen, onClose, ...props}: TapTooltipProps) => {
    const [open, setOpen] = useState(false);
    const onChildTouchEnd = children.props.onTouchEnd;
    return (
        <Tooltip
            {...props}
            open={open}
            onOpen={(event) => {
                setOpen(true);
                onOpen?.(event);
            }}
            onClose={(event) => {
                setOpen(false);
                onClose?.(event);
            }}
            {...(tap && {enterTouchDelay: 0, leaveTouchDelay: 5000})}
        >
            {cloneElement(children, {
                onTouchEnd: (event: TouchEvent<HTMLElement>) => {
                    onChildTouchEnd?.(event);
                    if (tap) setOpen(true);
                },
            })}
        </Tooltip>
    );
};
