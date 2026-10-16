import {useState} from "react";
import {DosingFields} from "../../features/dosing/components/DosingFields.tsx";
import type {Dosing} from "../../features/dosing/types.ts";

/**
 * `DosingFields` with its own state, as the dialogs use it (`onChange` is the state setter). The current value is
 * printed as JSON for `harnessValue()` (dosing.ts).
 */
export const DosingHarness = ({initial = {}, inheritFrom, allowAskEye}: { initial?: Dosing; inheritFrom?: Dosing | null; allowAskEye?: boolean }) => {
    const [dosing, setDosing] = useState<Dosing>(initial);
    return (
        <>
            <DosingFields value={dosing} onChange={setDosing} inheritFrom={inheritFrom} allowAskEye={allowAskEye}/>
            <output data-testid="dosing-value">{JSON.stringify(dosing)}</output>
        </>
    );
};
