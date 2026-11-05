/*
 * jsdom has no layout and no `matchMedia`. This one answers width queries (`(min-width: 900px)`, `(max-width: …)`,
 * as MUI's useMediaQuery / breakpoints write them) from `window.innerWidth`, and "no" to anything else (e.g.
 * prefers-reduced-motion). Installed by setup.ts; tests start at a desktop width (1280). A window resized while a page is
 * on screen tells the queries it changes, as a browser does (wrap it in `act`).
 */

const DESKTOP_WIDTH = 1280;

const matches = (query: string) => {
    const width = window.innerWidth;
    const conditions = [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)];
    if (!conditions.length) return false;
    return conditions.every(([, kind, value]) => (kind === "min" ? width >= Number(value) : width <= Number(value)));
};

type Subscription = { query: string; matched: boolean; listener: EventListenerOrEventListenerObject };

const subscriptions = new Set<Subscription>();

export const installMatchMedia = () => {
    window.matchMedia = (query: string): MediaQueryList => ({
        media: query,
        get matches() {
            return matches(query);
        },
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            subscriptions.add({query, matched: matches(query), listener});
        },
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            for (const subscription of subscriptions) {
                if (subscription.query === query && subscription.listener === listener) subscriptions.delete(subscription);
            }
        },
        dispatchEvent: () => false,
    });
};

/**
 * The window width media queries see, e.g. `setViewportWidth(375)` for a phone; set it before rendering, or in `act` to
 * resize the window under a page (TPL-229).
 */
export const setViewportWidth = (width: number = DESKTOP_WIDTH) => {
    Object.defineProperty(window, "innerWidth", {value: width, configurable: true, writable: true});
    window.dispatchEvent(new Event("resize"));
    for (const subscription of subscriptions) {
        const matched = matches(subscription.query);
        if (matched === subscription.matched) continue;
        subscription.matched = matched;
        const {listener} = subscription;
        const change = new Event("change");
        if (typeof listener === "function") listener(change);
        else listener.handleEvent(change);
    }
};
