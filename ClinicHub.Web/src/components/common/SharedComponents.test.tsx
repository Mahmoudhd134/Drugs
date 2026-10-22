import {beforeEach, describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {Link, Route, Routes} from "react-router-dom";
import {http, HttpResponse} from "msw";
import {aProtocol, aPage, api, protocolsHandlers, hoverTooltip, renderWithProviders, server, tapTooltip} from "../../test";
import type {Protocol} from "../../features/protocols/types.ts";
import {ProtocolPicker} from "../../features/protocols/components/ProtocolPicker.tsx";
import {AppShell} from "../layout/AppShell.tsx";
import {PageBoundary} from "./PageBoundary.tsx";
import {useConfirm} from "./useConfirm.tsx";
import {InfoTip} from "./InfoTip.tsx";

// Shared components: docs/tech/overview.md "Shared components (components/common)" (SearchableList, PageBoundary,
// useConfirm), "App shell", "Data fetching" (loading states), "Code conventions" (icon-only buttons).

// The search lists (`SearchableList`) since M1.7c: the protocol picker (the drug picker became the drug tree, whose
// keyboard and loading have their own tests: DrugTree.keyboard / DrugTree.search, UX-018, UX-019, UX-035)
const PROTOCOLS = ["Cataract", "Glaucoma", "Uveitis"].map(name => aProtocol({name}));

/** `GET /protocols` for the picker: `protocols` matched by name, optionally waiting for `gate` when a search is typed. */
const protocolsApi = (protocols: Protocol[], gate?: Promise<void>) => http.get(api("/protocols"), async ({request}) => {
    const search = (new URL(request.url).searchParams.get("search") ?? "").toLowerCase();
    if (search && gate) await gate;
    const items = protocols.filter(g => g.name.toLowerCase().includes(search));
    return HttpResponse.json(aPage(items, {pageSize: 30}));
});

// jsdom has no layout (setup.ts makes scrollIntoView a no-op): record which rows the list scrolls to
let scrolledTo: Element[] = [];
beforeEach(() => {
    scrolledTo = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
        scrolledTo.push(this);
    });
});

/** The protocol name an option shows first (its line count and drug names follow). */
const nameOf = (option: Element | undefined) => PROTOCOLS.map(g => g.name).find(name => option?.textContent?.startsWith(name));

const openPicker = async (onSelect = vi.fn(), protocols = PROTOCOLS) => {
    server.use(protocolsApi(protocols));
    const rendered = await renderWithProviders(<ProtocolPicker onSelect={onSelect} autoFocus/>, {lang: "ar"});
    await screen.findByText("Uveitis");
    const search = screen.getByRole("searchbox", {name: "ابحث عن بروتوكول بالاسم…"});
    const highlighted = () => nameOf(screen.getAllByRole("option").find(o => o.getAttribute("aria-selected") === "true"));
    return {...rendered, onSelect, search, highlighted};
};

describe("search lists: keyboard @area:ux", () => {
    test("↓ past the last result and ↑ before the first keep the highlight on the edge; the highlighted row scrolls into view @UX-018 @smoke", async () => {
        const {user, search, highlighted} = await openPicker();
        await user.click(search);
        expect(highlighted()).toBe("Cataract");
        await user.keyboard("{ArrowUp}");
        expect(highlighted()).toBe("Cataract");
        await user.keyboard("{ArrowDown}{ArrowDown}");
        expect(highlighted()).toBe("Uveitis");
        expect(nameOf(scrolledTo[scrolledTo.length - 1])).toBe("Uveitis");
        await user.keyboard("{ArrowDown}{ArrowDown}");
        expect(highlighted()).toBe("Uveitis");
        await user.keyboard("{ArrowUp}");
        expect(highlighted()).toBe("Glaucoma");
        expect(nameOf(scrolledTo[scrolledTo.length - 1])).toBe("Glaucoma");
    });

    test("Esc clears the typed search; a new search puts the highlight back on the first result @UX-019", async () => {
        const {user, search, highlighted} = await openPicker();
        await user.click(search);
        await user.keyboard("{ArrowDown}{ArrowDown}");
        expect(highlighted()).toBe("Uveitis");

        await user.type(search, "a");
        // Every name has an "a"… except Uveitis: the list is Cataract, Glaucoma, the highlight back on the first one
        await waitFor(() => expect(highlighted()).toBe("Cataract"));
        await user.keyboard("{ArrowDown}");
        await user.keyboard("{Escape}");
        expect(search).toHaveValue("");
        await waitFor(() => expect(highlighted()).toBe("Cataract"));
    });

    test("a double click on an item selects it once; Enter on a focused item still selects it @UX-027", async () => {
        const {user, onSelect} = await openPicker();
        await user.dblClick(screen.getByRole("option", {name: /^Glaucoma/}));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({name: "Glaucoma"}));

        screen.getByRole("option", {name: /^Uveitis/}).focus();
        await user.keyboard("{Enter}");
        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({name: "Uveitis"}));
    });

    test("a double click in the protocol picker adds the protocol once @UX-027", async () => {
        const onSelect = vi.fn();
        server.use(...protocolsHandlers([aProtocol({name: "Post cataract"})]));
        const {user} = await renderWithProviders(<ProtocolPicker onSelect={onSelect}/>, {lang: "ar"});
        await user.dblClick(await screen.findByRole("option", {name: /Post cataract/}));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});

describe("search lists: loading @area:ux", () => {
    test("loading shows a progress indicator; a new search keeps the previous results with a thin progress bar @UX-035", async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        server.use(protocolsApi(PROTOCOLS, gate));
        const {user} = await renderWithProviders(<ProtocolPicker onSelect={vi.fn()}/>, {lang: "ar"});
        expect(screen.getByRole("progressbar")).toHaveClass("MuiCircularProgress-root");
        await screen.findByText("Uveitis");

        await user.type(screen.getByRole("searchbox"), "Uve");
        const bar = await screen.findByRole("progressbar");
        expect(bar).toHaveClass("MuiLinearProgress-root");
        expect(screen.getByRole("option", {name: /^Cataract/})).toBeInTheDocument();
        release();
        await waitFor(() => expect(screen.queryByRole("option", {name: /^Cataract/})).not.toBeInTheDocument());
        expect(screen.getByRole("option", {name: /^Uveitis/})).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
});

/** A confirmation with a result line, as the pages use `useConfirm`. */
const ConfirmProbe = ({destructive}: { destructive: boolean }) => {
    const {confirm, dialog} = useConfirm();
    return (
        <>
            <button onClick={async () => {
                const answer = await confirm({title: "Discard changes?", message: "Unsaved changes are lost.", confirmText: "Discard", destructive});
                document.title = answer ? "confirmed" : "cancelled";
            }}>Ask</button>
            {dialog}
        </>
    );
};

describe("confirmations @area:ux", () => {
    test.each([true, false])("Esc closes a confirmation as Cancel (destructive: %s) @UX-017", async (destructive) => {
        document.title = "";
        const {user} = await renderWithProviders(<ConfirmProbe destructive={destructive}/>, {lang: "ar"});
        await user.click(screen.getByRole("button", {name: "Ask"}));
        const dialog = await screen.findByRole("dialog", {name: "Discard changes?"});
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        await user.keyboard("{Escape}");
        await waitFor(() => expect(document.title).toBe("cancelled"));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});

const Crashing = (): never => {
    throw new Error("render failed");
};

/** Pages under the boundary as a layout mounts them, with links between them. */
const Pages = () => (
    <>
        <Link to="/broken">to broken</Link>
        <Link to="/drugs">to drugs</Link>
        <PageBoundary>
            <Routes>
                <Route path="/broken" element={<Crashing/>}/>
                <Route path="/drugs" element={<p>Drugs page</p>}/>
            </Routes>
        </PageBoundary>
    </>
);

describe("page boundary @area:ux", () => {
    const silenceRenderErrors = () => {
        // React reports the caught error (console, and a window "error" event): expected here
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const silence = (event: ErrorEvent) => event.preventDefault();
        window.addEventListener("error", silence);
        return () => window.removeEventListener("error", silence);
    };

    test("a page crashing while rendering shows «تعذّر تحميل هذه الصفحة.» with «إعادة التحميل», not a blank app @UX-034", async () => {
        const restore = silenceRenderErrors();
        await renderWithProviders(<Pages/>, {lang: "ar", route: "/broken"});
        expect(screen.getByText("تعذّر تحميل هذه الصفحة.")).toBeInTheDocument();
        expect(screen.getByText("تحقّق من الاتصال، ثم أعد تحميل الصفحة.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "إعادة التحميل"})).toBeInTheDocument();
        // The app around the page is still there
        expect(screen.getByRole("link", {name: "to drugs"})).toBeInTheDocument();
        restore();
    });

    test("the crash in English: \"Couldn't load this page.\" @UX-034", async () => {
        const restore = silenceRenderErrors();
        await renderWithProviders(<Pages/>, {lang: "en", route: "/broken"});
        expect(screen.getByText("Couldn't load this page.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reload"})).toBeInTheDocument();
        restore();
    });

    test("from the \"couldn't load\" state, opening another page loads it normally @UX-033", async () => {
        const restore = silenceRenderErrors();
        const {user} = await renderWithProviders(<Pages/>, {lang: "ar", route: "/broken"});
        expect(screen.getByText("تعذّر تحميل هذه الصفحة.")).toBeInTheDocument();
        await user.click(screen.getByRole("link", {name: "to drugs"}));
        expect(await screen.findByText("Drugs page")).toBeInTheDocument();
        expect(screen.queryByText("تعذّر تحميل هذه الصفحة.")).not.toBeInTheDocument();
        restore();
    });
});

describe("app bar icon buttons @area:ux", () => {
    test("the menu button has the tooltip «فتح القائمة» and that accessible name (en: \"Open menu\") @UX-012", async () => {
        server.use(http.get(api("/drugs"), () => HttpResponse.json(aPage([]))));
        const shell = <AppShell homeTo="/" homeLabel="Home" contextLabel="Clinic A" contextTitle="Clinic A" navItems={[]}/>;
        const {unmount} = await renderWithProviders(shell, {lang: "ar"});
        expect(await hoverTooltip(screen.getByRole("button", {name: "فتح القائمة"}))).toBe("فتح القائمة");
        expect(within(screen.getByRole("banner")).getByRole("button", {name: "الحساب"})).toBeInTheDocument();
        unmount();

        await renderWithProviders(shell, {lang: "en"});
        expect(screen.getByRole("button", {name: "Open menu"})).toBeInTheDocument();
    });
});

describe("ⓘ on a touch screen @area:ux", () => {
    test("a quick tap on an ⓘ shows its explanation at once, still shown after 2 s @UX-013", async () => {
        await renderWithProviders(<InfoTip title="شرح الخيار"/>, {lang: "ar"});
        expect(await tapTooltip(screen.getByRole("img", {name: "شرح الخيار"}))).toBe("شرح الخيار");
    });
});
