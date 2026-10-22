import {afterEach, describe, expect, test, vi} from "vitest";
import {act, fireEvent, screen} from "@testing-library/react";
import {Chip, Menu, Tooltip} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {hoverTooltip, leaveTooltip, renderWithProviders} from "../../../test";
import {withPermission} from "../withPermission.tsx";
import {Can} from "./Can.tsx";
import {PermissionButton, PermissionFab, PermissionIconButton, PermissionMenuItem} from "./PermissionControls.tsx";
import {NoPermissionPage, RequirePermission} from "./RequirePermission.tsx";
import {FirstAllowedPage} from "../../../app/FirstAllowedPage.tsx";

// The permission pieces: docs/features/access/tech.md "Frontend (src/features/access)", docs/tech/overview.md
// "Shared components" (Permission pieces); access business.md «الرسائل التي تظهر للمستخدم» («ليست لديك صلاحية»).


const NO_PERMISSION = "ليست لديك صلاحية";

/** A chip that takes `disabled`: any component can be gated with withPermission. */
const GatedChip = withPermission(Chip);

describe("gated controls @area:access", () => {
    test("denied → hidden by default; allowed → shown and usable @ACC-070", async () => {
        await renderWithProviders(
            <>
                <PermissionButton permission="drugs.create">Add drug</PermissionButton>
                <PermissionButton permission="drugs.list">List drugs</PermissionButton>
                <PermissionIconButton permission="drugs.delete" aria-label="Delete drug"><AddIcon/></PermissionIconButton>
                <PermissionFab permission="protocols.create" aria-label="New protocol"><AddIcon/></PermissionFab>
                <GatedChip permission="protocols.delete" label="Gated chip"/>
                <GatedChip permission="drugs.list" label="Allowed chip"/>
            </>,
            {lang: "ar", user: {permissions: ["drugs.list"]}},
        );
        expect(screen.queryByRole("button", {name: "Add drug"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Delete drug"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "New protocol"})).not.toBeInTheDocument();
        expect(screen.queryByText("Gated chip")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "List drugs"})).toBeEnabled();
        expect(screen.getByText("Allowed chip")).toBeInTheDocument();
    });

    test("whenDenied=\"disable\" → disabled, with «ليست لديك صلاحية» on a wrapping span (also replacing an outer tooltip) @ACC-070", async () => {
        await renderWithProviders(
            <>
                <PermissionButton permission="drugs.create" whenDenied="disable">Add drug</PermissionButton>
                <Tooltip title="Delete">
                    <PermissionIconButton permission="drugs.delete" whenDenied="disable" aria-label="Delete drug"><AddIcon/></PermissionIconButton>
                </Tooltip>
                <PermissionFab permission="protocols.create" whenDenied="disable" aria-label="New protocol"><AddIcon/></PermissionFab>
            </>,
            {lang: "ar", user: {permissions: ["drugs.list"]}},
        );
        const add = screen.getByRole("button", {name: "Add drug"});
        expect(add).toBeDisabled();
        expect(add.parentElement?.tagName).toBe("SPAN");
        expect(await hoverTooltip(add.parentElement!)).toBe(NO_PERMISSION);
        await leaveTooltip(add.parentElement!);

        const remove = screen.getByRole("button", {name: "Delete drug"});
        expect(remove).toBeDisabled();
        // The permission's tooltip replaces the button's own ("Delete")
        expect(await hoverTooltip(remove.parentElement!)).toBe(NO_PERMISSION);
        expect(screen.getAllByRole("tooltip")).toHaveLength(1);

        expect(screen.getByRole("button", {name: "New protocol"})).toBeDisabled();
    });

    test("PermissionMenuItem: hidden, or disabled with whenDenied=\"disable\" @ACC-070", async () => {
        await renderWithProviders(
            <Menu open anchorEl={document.body}>
                <PermissionMenuItem permission="drugs.update">Edit</PermissionMenuItem>
                <PermissionMenuItem permission="drugs.delete" whenDenied="disable">Delete</PermissionMenuItem>
                <PermissionMenuItem permission="drugs.list">Open</PermissionMenuItem>
            </Menu>,
            {lang: "ar", user: {permissions: ["drugs.list"]}},
        );
        expect(screen.queryByRole("menuitem", {name: "Edit"})).not.toBeInTheDocument();
        expect(screen.getByRole("menuitem", {name: "Delete"})).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", {name: "Open"})).not.toHaveAttribute("aria-disabled");
    });

    test("anyOf needs one of the permissions, allOf needs all; every given condition must hold @ACC-070", async () => {
        await renderWithProviders(
            <>
                <PermissionButton anyOf={["drugs.update", "drugs.delete"]}>anyOf one held</PermissionButton>
                <PermissionButton anyOf={["drugs.create", "protocols.create"]}>anyOf none held</PermissionButton>
                <PermissionButton allOf={["drugs.list", "drugs.update"]}>allOf all held</PermissionButton>
                <PermissionButton allOf={["drugs.list", "drugs.delete"]}>allOf one missing</PermissionButton>
                <PermissionButton permission="drugs.list" anyOf={["protocols.list"]}>permission and anyOf, anyOf fails</PermissionButton>
                <Can anyOf={["protocols.list", "drugs.update"]}><span>Can anyOf</span></Can>
                <Can allOf={["drugs.update", "protocols.list"]} fallback={<span>Can fallback</span>}><span>Can allOf</span></Can>
                <Can permission="drugs.update"><span>Can permission</span></Can>
            </>,
            {lang: "ar", user: {permissions: ["drugs.list", "drugs.details", "drugs.update"]}},
        );
        expect(screen.getByRole("button", {name: "anyOf one held"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "anyOf none held"})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "allOf all held"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "allOf one missing"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /anyOf fails/})).not.toBeInTheDocument();
        expect(screen.getByText("Can anyOf")).toBeInTheDocument();
        expect(screen.queryByText("Can allOf")).not.toBeInTheDocument();
        expect(screen.getByText("Can fallback")).toBeInTheDocument();
        expect(screen.getByText("Can permission")).toBeInTheDocument();
    });

    describe("on a touch screen", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        /** Moves the fake clock `ms` in 100 ms steps, each in its own act() (a timer set by a re-render exists only after it). */
        const advance = (ms: number) => {
            for (let passed = 0; passed < ms; passed += 100) {
                act(() => {
                    vi.advanceTimersByTime(100);
                });
            }
        };

        test("a quick tap on the disabled control shows «ليست لديك صلاحية» at once, and it hides again ~5 s later @ACC-066", async () => {
            await renderWithProviders(
                <PermissionIconButton permission="protocols.delete" whenDenied="disable" aria-label="Delete protocol"><AddIcon/></PermissionIconButton>,
                {lang: "ar", user: {permissions: ["protocols.list"]}},
            );
            const wrapper = screen.getByRole("button", {name: "Delete protocol"}).parentElement!;
            vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});

            // A quick finger tap: touchend right after touchstart, before any timer runs (MUI's default needs a 700 ms long press)
            fireEvent.touchStart(wrapper);
            fireEvent.touchEnd(wrapper);
            advance(500);
            expect(screen.getByRole("tooltip")).toHaveTextContent(NO_PERMISSION);

            // Still there to be read after MUI's default 1.5 s, gone after 5 s
            advance(2500);
            expect(screen.getByRole("tooltip")).toHaveTextContent(NO_PERMISSION);
            advance(3000);
            expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        });
    });

    test("the tooltip in English: \"You don't have permission\" @ACC-070", async () => {
        await renderWithProviders(
            <PermissionButton permission="drugs.create" whenDenied="disable">Add drug</PermissionButton>,
            {lang: "en", user: {permissions: []}},
        );
        expect(await hoverTooltip(screen.getByRole("button", {name: "Add drug"}).parentElement!)).toBe("You don't have permission");
    });
});

describe("route guards @area:access", () => {
    test("while /me loads, a gated route shows a spinner, not the page nor «لا توجد صلاحية» @ACC-071", async () => {
        await renderWithProviders(
            <RequirePermission permission="drugs.list"><p>Drugs page</p></RequirePermission>,
            {lang: "ar", auth: {me: null, meReady: false}},
        );
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
        expect(screen.queryByText("Drugs page")).not.toBeInTheDocument();
        expect(screen.queryByText("لا توجد صلاحية")).not.toBeInTheDocument();
    });

    test("a role that can open no page: `/` shows the no-permission page without its home link @ACC-059", async () => {
        await renderWithProviders(<FirstAllowedPage/>, {lang: "ar", user: {permissions: []}});
        expect(screen.getByText("لا توجد صلاحية")).toBeInTheDocument();
        expect(screen.getByText("ليست لديك صلاحية لفتح هذه الصفحة. اطلبها من مالك العيادة إن احتجت إليها.")).toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "الذهاب إلى صفحة البداية"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    test("the no-permission page of any other page keeps its link to `/`", async () => {
        await renderWithProviders(<NoPermissionPage/>, {lang: "ar"});
        expect(screen.getByRole("link", {name: "الذهاب إلى صفحة البداية"})).toHaveAttribute("href", "/");
    });
});
