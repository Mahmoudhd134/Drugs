/** The part of a location a legacy redirect reads (react-router's `Location` fits). */
export type LegacyLocation = {
    pathname: string;
    search: string;
    hash: string;
};

/** The old routes of the protocols screens (named groups before M1.7a), relative to the app's root. */
export const LEGACY_PROTOCOLS_ROUTES = ["groups", "groups/new", "groups/:id"] as const;

// "/groups", "/groups/" or "/groups/<one segment>[/]" (any case, like react-router's matching)
const LEGACY_PATH = /^\/groups(?:\/([^/]+))?\/?$/i;

/**
 * Maps an old bookmark of the protocols screens to its new address: `/groups` → `/protocols`,
 * `/groups/new` → `/protocols/new`, `/groups/{id}` → `/protocols/{id}` (any segment, kept as written: the editor
 * applies its own rules to it), with the query string and hash kept. Null for any other path.
 */
export const protocolPathOf = ({pathname, search, hash}: LegacyLocation): string | null => {
    const match = LEGACY_PATH.exec(pathname);
    if (!match) return null;
    const segment = match[1];
    const path = segment === undefined ? "/protocols" : `/protocols/${segment}`;
    return `${path}${search}${hash}`;
};
