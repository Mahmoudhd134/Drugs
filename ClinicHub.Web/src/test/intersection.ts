/*
 * jsdom has no IntersectionObserver (the drug tree loads the next page when the end of an open subcategory scrolls into
 * view, design M1.7 D7). `installIntersectionObserver()` puts a controllable fake on `window`; call it inside each
 * test or in `beforeEach` (setup.ts's `vi.unstubAllGlobals()` removes it after every test). The test makes an
 * observed element enter the view with `enter(element)` (or every observed one with `enterAll()`), and can check each observer's `root` (the tree's scroll panel, CAT-118).
 */
import {act} from "@testing-library/react";
import {vi} from "vitest";

type Fake = {
    callback: IntersectionObserverCallback;
    root: Element | Document | null;
    targets: Set<Element>;
    observer: IntersectionObserver;
};

export const installIntersectionObserver = () => {
    const observers = new Set<Fake>();
    class FakeObserver {
        readonly root: Element | Document | null;
        readonly rootMargin: string;
        readonly thresholds = [0];
        private readonly fake: Fake;

        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            this.root = options?.root ?? null;
            this.rootMargin = options?.rootMargin ?? "0px";
            this.fake = {callback, root: this.root, targets: new Set(), observer: this as unknown as IntersectionObserver};
            observers.add(this.fake);
        }

        observe(target: Element) {
            this.fake.targets.add(target);
        }

        unobserve(target: Element) {
            this.fake.targets.delete(target);
        }

        disconnect() {
            this.fake.targets.clear();
            observers.delete(this.fake);
        }

        takeRecords(): IntersectionObserverEntry[] {
            return [];
        }
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);

    const fire = (fake: Fake, target: Element, isIntersecting: boolean) =>
        fake.callback([{target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0} as IntersectionObserverEntry], fake.observer);

    return {
        /** `element` enters (or, with false, leaves) the view of every observer watching it. */
        enter: (element: Element, isIntersecting = true) => act(() => {
            for (const fake of [...observers]) if (fake.targets.has(element)) fire(fake, element, isIntersecting);
        }),
        /** Every observed element enters the view. */
        enterAll: () => act(() => {
            for (const fake of [...observers]) for (const target of [...fake.targets]) fire(fake, target, true);
        }),
        /** The elements observed now. */
        observed: () => [...observers].flatMap(f => [...f.targets]),
        /** The roots of the live observers. */
        roots: () => [...observers].map(f => f.root),
    };
};
