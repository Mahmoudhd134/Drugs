import {type ReactNode, useState} from "react";

/** A part of the page a button takes off it, as a clinic switch does: the rest of the app, the toaster too, stays. */
export const Leavable = ({children}: { children: ReactNode }) => {
    const [here, setHere] = useState(true);
    return (
        <>
            <button onClick={() => setHere(false)}>Leave the page</button>
            {here && children}
        </>
    );
};
