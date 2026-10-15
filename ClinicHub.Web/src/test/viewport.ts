/*
 * jsdom has no layout and no `matchMedia`. This one answers width queries (`(min-width: 900px)`, `(max-width: …)`,
 * as MUI's useMediaQuery / breakpoints write them) from `window.innerWidth`, and "no" to anything else (e.g.
 * prefers-reduced-motion). Installed by setup.ts; tests start at a desktop width (1280).
 */

const DESKTOP_WIDTH = 1280;

const matches = (query: string) => {
    const width = window.innerWidth;
    const conditions = [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)];
    if (!conditions.length) return false;
    return conditions.every(([, kind, value]) => (kind === "min" ? width >= Number(value) : width <= Number(value)));
};

export const installMatchMedia = () => {
    window.matchMedia = (query: string): MediaQueryList => ({
        media: query,
        matches: matches(query),
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    });
};

/** The window width media queries see, e.g. `setViewportWidth(375)` for a phone; set it before rendering. */
export const setViewportWidth = (width: number = DESKTOP_WIDTH) => {
    Object.defineProperty(window, "innerWidth", {value: width, configurable: true, writable: true});
    window.dispatchEvent(new Event("resize"));
};
