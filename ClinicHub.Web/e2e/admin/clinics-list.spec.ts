import type {Page} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import type {Data} from "../support/data.ts";
import {unique} from "../support/phones.ts";
import type {Texts} from "../support/texts.ts";
import {expectContextLabel, openSidebar, recordRequests, sidebarEntries} from "../support/ui.ts";

const rows = (page: Page) => page.locator("tbody tr");

/** `count` clinics named "<token> nn" (two-digit order), the first `suspended` of them disabled. */
const clinics = async (data: Data, token: string, count: number, suspended = 0) => {
    const made = [];
    for (let i = 1; i <= count; i++) {
        const clinic = await data.clinic({name: `${token} ${String(i).padStart(2, "0")}`});
        if (i <= suspended) await data.suspend(clinic);
        made.push(clinic);
    }
    return made;
};

const chooseStatus = async (page: Page, t: Texts, label: string) => {
    await page.getByRole("combobox", {name: t.statusFilter}).click();
    await page.getByRole("option", {name: label, exact: true}).click();
};

test.describe("Platform admin: the clinics list @area:admin", () => {
    test("the platform context: «إدارة المنصة» in the app bar, «العيادات» and «تعديل العيادة النموذجية» in the sidebar @ADM-010 @smoke",
        async ({page, t, healthy}) => {
            await signInSuperAdmin(page);
            await expectContextLabel(page, t.platform);
            expect(await sidebarEntries(page, t)).toEqual([t.adminClinics]);
            const {nav} = await openSidebar(page, t);
            await expect(nav.getByRole("button", {name: t.editTemplate})).toBeVisible();
            await healthy();
        });

    test("«تعديل العيادة النموذجية» (double click): one switch, the template's drugs page with its banner @ADM-142",
        async ({page, t}) => {
            await signInSuperAdmin(page);
            const switches = recordRequests(page, "POST", /\/api\/v1\/auth\/context$/);
            const {nav} = await openSidebar(page, t);
            await nav.getByRole("button", {name: t.editTemplate}).dblclick();

            await expect(page).toHaveURL(/\/drugs$/);
            await expectContextLabel(page, t.template);
            await expect(page.getByRole("alert").filter({hasText: t.templateBanner})).toBeVisible();
            expect(switches).toHaveLength(1);
        });

    test("the status filter: Disabled shows only the disabled clinics, All shows both @ADM-036", async ({page, t, data, healthy}) => {
        const token = `F${unique()}`;
        await clinics(data, token, 2, 1);
        await signInSuperAdmin(page, `/admin?search=${token}`);
        await expect(rows(page)).toHaveCount(2);

        await chooseStatus(page, t, t.statusDisabled);
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(`${token} 01`);
        await expect(rows(page).first()).toContainText(t.statusDisabled);
        await healthy();

        await chooseStatus(page, t, t.statusActive);
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(`${token} 02`);

        await chooseStatus(page, t, t.allStatuses);
        await expect(rows(page)).toHaveCount(2);
    });

    test("22 clinics: page 2, and the rows per page (10/20/50; not offered on a phone) change the rows @ADM-037", async ({page, t, data, isMobile}) => {
        const token = `P${unique()}`;
        // Many pages, scans or clinics: three times the usual time
        test.slow();
        await clinics(data, token, 22);
        await signInSuperAdmin(page, `/admin?search=${token}`);
        await expect(rows(page)).toHaveCount(20);
        await expect(rows(page).first()).toContainText(`${token} 01`);

        await page.getByRole("button", {name: t.nextPage}).click();
        await expect(rows(page)).toHaveCount(2);
        await expect(rows(page).first()).toContainText(`${token} 21`);
        await expect(page).toHaveURL(/page=2/);

        const perPage = page.getByRole("combobox", {name: t.rowsPerPage});
        if (isMobile) {
            // Hidden below sm so the pagination fits a phone (tech overview, ListPagination)
            await expect(perPage).toHaveCount(0);
            return;
        }
        await page.getByRole("button", {name: t.prevPage}).click();
        for (const [size, count] of [[10, 10], [50, 22], [20, 20]] as const) {
            await perPage.click();
            await page.getByRole("option", {name: String(size), exact: true}).click();
            await expect(rows(page), `${size} per page`).toHaveCount(count);
            await expect(rows(page).first()).toContainText(`${token} 01`);
        }
        await perPage.click();
        await page.getByRole("option", {name: "10", exact: true}).click();
        await page.getByRole("button", {name: t.nextPage}).click();
        await expect(rows(page)).toHaveCount(10);
        await expect(rows(page).first()).toContainText(`${token} 11`);
    });

    test("search, filter and page 2 are kept when coming back from a clinic (the page's Back and the browser's) @ADM-038",
        async ({page, t, data}) => {
            const token = `B${unique()}`;
            // Many pages, scans or clinics: three times the usual time
            test.slow();
            await clinics(data, token, 22, 22);
            await data.clinic({name: `${token} active`});
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await expect(rows(page)).toHaveCount(20);
            await chooseStatus(page, t, t.statusDisabled);
            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(rows(page)).toHaveCount(2);
            const listUrl = page.url();
            expect(listUrl).toMatch(/search=/);
            expect(listUrl).toMatch(/status=suspended/);
            expect(listUrl).toMatch(/page=2/);

            for (const back of ["page", "browser"] as const) {
                await rows(page).first().getByRole("link").click();
                await expect(page.getByRole("heading", {level: 1})).toContainText(`${token} 21`);
                if (back === "page") await page.getByRole("button", {name: t.back}).first().click();
                else await page.goBack();
                await expect(page, back).toHaveURL(listUrl);
                await expect(rows(page)).toHaveCount(2);
                await expect(rows(page).first()).toContainText(`${token} 21`);
                await expect(page.getByPlaceholder(t.searchClinics)).toHaveValue(token);
                await expect(page.getByRole("combobox", {name: t.statusFilter})).toHaveText(t.statusDisabled);
            }
        });

    test("a search typed key by key, a filter and page 2: one URL, no history entry per key, and a reload shows the same list @ADM-039",
        async ({page, t, data}) => {
            const token = `Q${unique()}`;
            test.slow();
            // 13 clinics, 2 disabled: the 11 active ones make 2 pages of 10
            await clinics(data, token, 13, 2);
            await signInSuperAdmin(page, "/admin?pageSize=10");
            await expect(rows(page).first()).toBeVisible();
            const before = await page.evaluate(() => history.length);

            // Each key after the search's pause (300 ms), so a list that wrote each one as a history entry would show it
            await page.getByPlaceholder(t.searchClinics).pressSequentially(token, {delay: 450});
            await expect(page).toHaveURL(new RegExp(`search=${token}`));
            await expect(rows(page)).toHaveCount(10);
            await chooseStatus(page, t, t.statusActive);
            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(rows(page)).toHaveCount(1);
            await expect(rows(page).first()).toContainText(`${token} 13`);
            expect(await page.evaluate(() => history.length) - before, "no history entry per key").toBeLessThanOrEqual(1);
            const listUrl = page.url();
            expect(listUrl).toMatch(/status=active/);
            expect(listUrl).toMatch(/page=2/);

            await page.reload();
            await expect(page).toHaveURL(listUrl);
            await expect(rows(page)).toHaveCount(1);
            await expect(rows(page).first()).toContainText(`${token} 13`);
            await expect(page.getByPlaceholder(t.searchClinics)).toHaveValue(token);
            await expect(page.getByRole("combobox", {name: t.statusFilter})).toHaveText(t.statusActive);
        });

    test("on a phone the created-date column and the rows-per-page choice are hidden (a desktop shows both) @ADM-045",
        async ({page, t, data, isMobile, healthy}) => {
            const token = `C${unique()}`;
            await clinics(data, token, 1);
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await expect(rows(page)).toHaveCount(1);
            const created = page.getByRole("columnheader", {name: t.createdColumn});
            // The row's cells: name, status, staff count, and the created date on a desktop only
            const shownCells = () => rows(page).first().locator("td").filter({visible: true}).count();
            if (isMobile) {
                await expect(created).toBeHidden();
                await expect(page.getByRole("combobox", {name: t.rowsPerPage})).toHaveCount(0);
                expect(await shownCells()).toBe(3);
            } else {
                await expect(created).toBeVisible();
                await expect(page.getByRole("combobox", {name: t.rowsPerPage})).toBeVisible();
                expect(await shownCells()).toBe(4);
            }
            // No horizontal scroll (and the rest of the page checks)
            await healthy();
        });

    test("left for a clinic's page, renamed and disabled there: Back shows the new state at once, never the old row @ADM-279",
        async ({page, t, data}) => {
            const token = `R${unique()}`;
            const [clinic] = await clinics(data, token, 1);
            const renamed = `${token} renamed`;
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await expect(rows(page)).toHaveCount(1);
            await rows(page).first().getByRole("link").click();
            await expect(page.getByRole("heading", {level: 1})).toContainText(clinic.name);

            await page.getByRole("button", {name: t.rename}).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("textbox", {name: t.clinicName}).fill(renamed);
            await dialog.getByRole("button", {name: t.save}).click();
            await expect(dialog).toHaveCount(0);
            await page.getByRole("button", {name: t.disable}).click();
            await page.getByRole("dialog").getByRole("button", {name: t.disable}).click();
            await expect(page.getByRole("button", {name: t.enable})).toBeVisible();

            // From now on, the old row (old name, or the new name still active) on screen is stale data
            await page.evaluate(([oldName, newName, active]) => {
                const flags = window as unknown as { stale?: string };
                new MutationObserver(() => {
                    for (const row of document.querySelectorAll("tbody tr")) {
                        const text = (row as HTMLElement).innerText;
                        if (text.includes(oldName)) flags.stale = text;
                        if (text.includes(newName) && text.includes(active)) flags.stale = text;
                    }
                }).observe(document, {subtree: true, childList: true, characterData: true});
            }, [`${clinic.name}\n`, renamed, t.statusActive]);
            await page.getByRole("button", {name: t.back}).first().click();

            await expect(page).toHaveURL(/\/admin\?/);
            await expect(rows(page)).toHaveCount(1);
            await expect(rows(page).first()).toContainText(renamed);
            await expect(rows(page).first()).toContainText(t.statusDisabled);
            expect(await page.evaluate(() => (window as unknown as { stale?: string }).stale ?? null)).toBeNull();
        });
});
