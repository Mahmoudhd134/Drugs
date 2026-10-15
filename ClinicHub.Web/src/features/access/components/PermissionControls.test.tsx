import {describe, expect, test} from "vitest";
import {screen} from "@testing-library/react";
import {Chip, Menu, Tooltip} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {renderWithProviders} from "../../../test";
import {withPermission} from "../withPermission.tsx";
import {Can} from "./Can.tsx";
import {PermissionButton, PermissionFab, PermissionIconButton, PermissionMenuItem} from "./PermissionControls.tsx";
import {NoPermissionPage, RequirePermission} from "./RequirePermission.tsx";
import {FirstAllowedPage} from "../../../app/FirstAllowedPage.tsx";
import {patientWaits} from "../../../test/fe-access/patience.ts";

// The permission pieces: docs/features/access/tech.md "Frontend (src/features/access)", docs/tech/overview.md
// "Shared components" (Permission pieces); access business.md «الرسائل التي تظهر للمستخدم» («ليست لديك صلاحية»).

patientWaits();

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
                <PermissionFab permission="groups.create" aria-label="New group"><AddIcon/></PermissionFab>
                <GatedChip permission="groups.delete" label="Gated chip"/>
                <GatedChip permission="drugs.list" label="Allowed chip"/>
            </>,
            {lang: "ar", user: {permissions: ["drugs.list"]}},
        );
        expect(screen.queryByRole("button", {name: "Add drug"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Delete drug"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "New group"})).not.toBeInTheDocument();
        expect(screen.queryByText("Gated chip")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "List drugs"})).toBeEnabled();
        expect(screen.getByText("Allowed chip")).toBeInTheDocument();
    });

    test("whenDenied=\"disable\" → disabled, with «ليست لديك صلاحية» on a wrapping span (also replacing an outer tooltip) @ACC-070", async () => {
        const {user} = await renderWithProviders(
            <>
                <PermissionButton permission="drugs.create" whenDenied="disable">Add drug</PermissionButton>
                <Tooltip title="Delete">
                    <PermissionIconButton permission="drugs.delete" whenDenied="disable" aria-label="Delete drug"><AddIcon/></PermissionIconButton>
                </Tooltip>
                <PermissionFab permission="groups.create" whenDenied="disable" aria-label="New group"><AddIcon/></PermissionFab>
            </>,
            {lang: "ar", user: {permissions: ["drugs.list"]}},
        );
        const add = screen.getByRole("button", {name: "Add drug"});
        expect(add).toBeDisabled();
        expect(add.parentElement?.tagName).toBe("SPAN");
        await user.hover(add.parentElement!);
        expect(await screen.findByRole("tooltip")).toHaveTextContent(NO_PERMISSION);
        await user.unhover(add.parentElement!);

        const remove = screen.getByRole("button", {name: "Delete drug"});
        expect(remove).toBeDisabled();
        await user.hover(remove.parentElement!);
        const tooltips = await screen.findAllByRole("tooltip");
        expect(tooltips.map(t => t.textContent)).toContain(NO_PERMISSION);
        expect(tooltips.map(t => t.textContent)).not.toContain("Delete");

        expect(screen.getByRole("button", {name: "New group"})).toBeDisabled();
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
                <PermissionButton anyOf={["drugs.create", "groups.create"]}>anyOf none held</PermissionButton>
                <PermissionButton allOf={["drugs.list", "drugs.update"]}>allOf all held</PermissionButton>
                <PermissionButton allOf={["drugs.list", "drugs.delete"]}>allOf one missing</PermissionButton>
                <PermissionButton permission="drugs.list" anyOf={["groups.list"]}>permission and anyOf, anyOf fails</PermissionButton>
                <Can anyOf={["groups.list", "drugs.update"]}><span>Can anyOf</span></Can>
                <Can allOf={["drugs.update", "groups.list"]} fallback={<span>Can fallback</span>}><span>Can allOf</span></Can>
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

    test("the tooltip in English: \"You don't have permission\" @ACC-070", async () => {
        const {user} = await renderWithProviders(
            <PermissionButton permission="drugs.create" whenDenied="disable">Add drug</PermissionButton>,
            {lang: "en", user: {permissions: []}},
        );
        await user.hover(screen.getByRole("button", {name: "Add drug"}).parentElement!);
        expect(await screen.findByRole("tooltip")).toHaveTextContent("You don't have permission");
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
