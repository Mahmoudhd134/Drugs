import {expect, loginViaUi, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {designerOf, layoutL, PT_TEXTS, putTemplate, tabPath} from "../support/print-template.ts";
import {navTo} from "../support/ui.ts";

/**
 * The data router (contract § 3.8 "The router"): `App` moved from `BrowserRouter` to `createBrowserRouter` holding the same
 * routes, so deep links, reloads on a nested route, redirects and the browser's Back and Forward still work, for a clinic user
 * and the super admin. Expected places: the route table of docs/features/platform-admin/tech.md and docs/tech/overview.md.
 */

test.describe("The app's router @area:admin", () => {
    test("a clinic user: deep links and reloads on a nested route, redirects, the browser's Back and Forward @TPL-250 @smoke",
        async ({page, data, t}) => {
            const clinic = await data.clinic();
            const drug = await data.drug(clinic);
            const protocol = await data.protocol(clinic, [drug]);

            // A deep link on a nested route, with its id, then a reload
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
            await page.reload();
            await settled(page);
            await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);

            // A deep link keeps its query
            await page.goto("/drugs?view=list");
            await settled(page);
            await expect(page).toHaveURL(/\/drugs\?view=list$/);
            await expect(page.getByRole("heading", {level: 1, name: t.drugsTitle})).toBeVisible();

            // Redirects: the old URL, an unknown one, the platform's for a clinic user
            await page.goto("/manage");
            await expect(page).toHaveURL(/\/drugs$/);
            await page.goto("/no-such-page");
            await expect(page).toHaveURL(/\/$/);
            await page.goto("/platform");
            await expect(page).toHaveURL(/\/$/);
            await page.goto("/admin");
            await expect(page).toHaveURL(/\/$/);

            // Back and Forward, inside the app
            await navTo(page, t, t.navDrugs);
            await expect(page).toHaveURL(/\/drugs$/);
            await navTo(page, t, t.navProtocols);
            await expect(page).toHaveURL(/\/protocols$/);
            await page.goBack();
            await expect(page).toHaveURL(/\/drugs$/);
            await expect(page.getByRole("heading", {level: 1, name: t.drugsTitle})).toBeVisible();
            await page.goForward();
            await expect(page).toHaveURL(/\/protocols$/);
        });

    test("the super admin: deep links and reloads on a nested route, redirects, the browser's Back and Forward @TPL-250 @smoke",
        async ({page, data, lang, t}) => {
            const clinic = await data.clinic();
            const staffTab = `/admin/clinics/${clinic.id}/staff`;

            // A deep link on a tab, then a reload: the same tab
            await signInSuperAdmin(page, staffTab);
            await expect(page).toHaveURL(new RegExp(`${staffTab}$`));
            await expect(page.getByRole("tab", {name: t.tabStaff, exact: true})).toHaveAttribute("aria-selected", "true");
            await page.reload();
            await settled(page);
            await expect(page).toHaveURL(new RegExp(`${staffTab}$`));
            await expect(page.getByRole("tab", {name: t.tabStaff, exact: true})).toHaveAttribute("aria-selected", "true");

            // The new tab too
            await page.goto(tabPath(clinic));
            await settled(page);
            await expect(page.getByRole("tab", {name: PT_TEXTS[lang].tab, exact: true})).toHaveAttribute("aria-selected", "true");

            // Redirects
            await page.goto("/platform");
            await expect(page).toHaveURL(/\/admin$/);
            await page.goto("/admin/anything");
            await expect(page).toHaveURL(/\/admin$/);
            await page.goto("/");
            await expect(page).toHaveURL(/\/admin$/);

            // Back and Forward, inside the app: the header's Back pushes the list, the browser's returns
            await page.goto(`/admin/clinics/${clinic.id}`);
            await settled(page);
            await page.getByRole("button", {name: t.back, exact: true}).click();
            await expect(page).toHaveURL(/\/admin$/);
            await page.goBack();
            await expect(page).toHaveURL(new RegExp(`/admin/clinics/${clinic.id}$`));
            await expect(page.getByRole("tab", {name: t.tabOverview, exact: true})).toHaveAttribute("aria-selected", "true");
            await page.goForward();
            await expect(page).toHaveURL(/\/admin$/);
        });

    test("logged out: a deep link goes to the login page, and logging in comes back to it @TPL-250",
        async ({page, data, t}) => {
            const clinic = await data.clinic();
            await loginViaUi(page, t, clinic.owner.phone, "/drugs");

            await expect(page).toHaveURL(/\/drugs/);
            await expect(page.getByRole("heading", {level: 1, name: t.drugsTitle})).toBeVisible();
        });

    test("a designer deep link keeps its place on a reload, with a saved template on screen @TPL-250",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the designer is for a computer");
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layoutL());
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await expect(designer.box("m")).toBeVisible();

            await page.reload();
            await settled(page);
            await expect(page).toHaveURL(new RegExp(`${tabPath(clinic)}$`));
            await expect(designer.box("m")).toBeVisible();
        });
});
