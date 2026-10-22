import {Navigate, useLocation} from "react-router-dom";
import {protocolPathOf} from "../legacyRoutes.ts";

/**
 * Sends an old `/groups…` bookmark to its `/protocols…` address (query and hash kept), replacing the history entry so
 * Back doesn't loop. Mounted outside the auth guard: an anonymous visitor reaches the guard at the new address, which
 * is the one the sign-in comes back to.
 */
export const LegacyProtocolRedirect = () => {
    const location = useLocation();
    return <Navigate to={protocolPathOf(location) ?? "/"} replace/>;
};
