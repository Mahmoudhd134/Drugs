import {createContext, type FormEvent, useContext, useRef, useState} from "react";
import {useSingleFlight} from "./useSingleFlight.ts";

/**
 * Tells the dialog around the form (`FormDialog`) that a save is in flight, so Esc and a backdrop click don't close it
 * meanwhile (the answer would come after the form is gone). Outside a `FormDialog`: does nothing.
 */
export const DialogSavingContext = createContext<(saving: boolean) => void>(() => undefined);

/**
 * The submit of a dialog's form: one save at a time (`useSingleFlight`), the dialog not closable (Esc, backdrop) while it
 * runs, and a save that succeeded keeps the form locked (`done`: Save disabled, every later submit or Enter ignored)
 * while the dialog fades out; the second click of a double click landing after a fast answer would otherwise save
 * again. `save` resolves true when it succeeded and the dialog closes; false (invalid input, an API error) unlocks at
 * once, so the user can fix it and retry.
 * The lock lasts until the form unmounts: mount the form per opening (`useOpeningKey`), so the next opening starts unlocked.
 */
export const useDialogSave = (save: () => Promise<boolean>) => {
    const once = useSingleFlight();
    const setSaving = useContext(DialogSavingContext);
    const closing = useRef(false);
    const [done, setDone] = useState(false);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (closing.current) return;
        void once(async () => {
            setSaving(true);
            try {
                if (await save()) {
                    closing.current = true;
                    setDone(true);
                }
            } finally {
                setSaving(false);
            }
        });
    };

    return {submit, done};
};
