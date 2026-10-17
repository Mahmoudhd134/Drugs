import {useState} from "react";

/**
 * A number that changes each time `open` turns true: the `key` of a dialog's form, so every opening mounts a fresh form
 * (state from the given entity, or empty), also when the dialog is reopened during its closing animation (MUI keeps the
 * closing content mounted until it has faded out).
 */
export const useOpeningKey = (open: boolean) => {
    const [opening, setOpening] = useState(0);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setOpening(n => n + 1);
    }
    return opening;
};
