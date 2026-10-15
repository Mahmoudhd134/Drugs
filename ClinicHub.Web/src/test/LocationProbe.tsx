import {useLayoutEffect} from "react";
import {type Location, useLocation} from "react-router-dom";

/** Tells the test where the router is (renderWithProviders' `location()`). */
export const LocationProbe = ({onChange}: { onChange: (location: Location) => void }) => {
    const location = useLocation();
    useLayoutEffect(() => onChange(location), [location, onChange]);
    return null;
};
