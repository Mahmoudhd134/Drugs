import {expect, loginViaUi, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    expectContextLabel,
    expectPicker,
    expectToast,
    logout,
    navTo,
    openAccountMenu,
    openSwitchClinic,
    pickerEntry,
    recordRequests,
    toast, toasts} from "../support/ui.ts";

test.describe("Session: logout, reload, tabs, offline @area:auth", () => {
    test("logout from the account menu opens /login; /drugs afterwards goes to /login @AUTH-156 @smoke", async ({page, t, data, healthy}) => {
        const clinic = await data.clinic();
        await signIn(page, clinic.owner.phone);
        await expectContextLabel(page, clinic.name);

        await logout(page, t);
        await expect(page).toHaveURL(/\/login$/);
        await healthy();
        await page.goto("/drugs");
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
    });

    test("two tabs: one logs out, the other keeps working until its next refresh, which opens /login without a message @AUTH-159",
        async ({page, t, data, newTab}) => {
            const clinic = await data.clinic();
            const drug = await data.drug(clinic);
            await signIn(page, clinic.owner.phone);
            await expectContextLabel(page, clinic.name);
            const other = await newTab();
            await other.goto("/");
            await expectContextLabel(other, clinic.name);

            await logout(other, t);
            await expect(other).toHaveURL(/\/login$/);

            // Still working (its access token lives on, up to 15 min)
            await navTo(page, t, t.navDrugs);
            await expect(page.getByRole("cell", {name: drug.name})).toBeVisible();
            // Its next refresh (the page loaded again) ends there
            await page.reload();
            await expect(page).toHaveURL(/\/login$/);
            await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
            await expect(toasts(page)).toHaveCount(0);
            await expect(page.getByRole("alert")).toHaveText([t.displayModeBanner]);
        });

    test("two tabs: one logs out; the other's next refresh in the middle of its work (its access token expired) opens /login without a message @AUTH-159",
        async ({page, t, data, newTab, allowApiErrors}) => {
            // The 401 the test fakes (an expired access token)
            allowApiErrors({status: 401, method: "GET", path: /^\/api\/v1\/drugs$/});
            const clinic = await data.clinic();
            const drug = await data.drug(clinic);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(page.getByRole("cell", {name: drug.name})).toBeVisible();
            const other = await newTab();
            await other.goto("/");
            await expectContextLabel(other, clinic.name);
            await logout(other, t);
            await expect(other).toHaveURL(/\/login$/);

            // The page's access token has expired by now: its next API answer is a 401, so it refreshes (no reload)
            const term = `zz${unique()}`;
            await page.route(`**/api/v1/drugs?*search=${term}*`, route =>
                route.fulfill({status: 401, contentType: "application/problem+json", json: {status: 401, code: "unauthorized"}}));
            const refreshes: number[] = [];
            page.on("response", response => {
                if (new URL(response.url()).pathname === "/api/v1/auth/refresh") refreshes.push(response.status());
            });
            await page.evaluate(() => { (window as unknown as { sameLoad: boolean }).sameLoad = true; });
            await page.getByPlaceholder(t.searchDrugs).fill(term);

            await expect(page).toHaveURL(/\/login$/);
            await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
            expect(refreshes, "one refresh, refused (the session ended in the other tab)").toEqual([401]);
            expect(await page.evaluate(() => (window as unknown as { sameLoad?: boolean }).sameLoad ?? false), "no page load").toBe(true);
            await expect(toasts(page)).toHaveCount(0);
            await expect(page.getByRole("alert")).toHaveText([t.displayModeBanner]);
        });

    test("a reload, or a new page after closing, keeps the user logged in, in the same clinic @AUTH-160 @smoke", async ({page, t, data, context}) => {
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const staff = await data.staff(a);
        await data.staff(b, {phone: staff.phone});
        await signIn(page, staff.phone, {clinicId: b.id});
        await navTo(page, t, t.navDrugs);
        await expect(page).toHaveURL(/\/drugs$/);

        await page.reload();
        await expect(page).toHaveURL(/\/drugs$/);
        await expectContextLabel(page, b.name);

        // The browser closed and opened again (same profile: the cookie stays)
        await page.close();
        const again = await context.newPage();
        await again.goto("/");
        await expect(again).toHaveURL(/\/$/);
        await expectContextLabel(again, b.name);
        await expect(again.getByRole("heading", {level: 1, name: t.navPrescription})).toBeVisible();
    });

    test("a new tab of the app is logged in too (shared cookie) @AUTH-161", async ({page, data, newTab}) => {
        const clinic = await data.clinic();
        await signIn(page, clinic.owner.phone);
        await expectContextLabel(page, clinic.name);

        const other = await newTab();
        await other.goto("/drugs");
        await expect(other).toHaveURL(/\/drugs$/);
        await expectContextLabel(other, clinic.name);
    });

    test("the browser storage holds only language and prescription lines, never a token @AUTH-162", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const tokens: string[] = [];
        page.on("response", async response => {
            if (/\/api\/v1\/auth\/(refresh|context|otp\/verify)$/.test(new URL(response.url()).pathname) && response.ok()) {
                tokens.push((await response.json() as { accessToken: string }).accessToken);
            }
        });
        await loginViaUi(page, t, clinic.owner.phone);
        await expectContextLabel(page, clinic.name);
        await navTo(page, t, t.navDrugs);
        await page.reload();
        await expectContextLabel(page, clinic.name);
        expect(tokens.length).toBeGreaterThan(0);

        const storage = await page.evaluate(() => ({
            local: Object.entries(localStorage),
            session: Object.entries(sessionStorage),
        }));
        for (const [key] of storage.local) expect(key).toMatch(/^(language|prescription\.lines\.\d+)$/);
        expect(storage.local.map(([key]) => key)).toContain("language");
        const values = [...storage.local, ...storage.session].map(([, value]) => value).join("\n");
        for (const token of tokens) expect(values).not.toContain(token);
    });

    test("anonymous: every app route opens /login @AUTH-168 @smoke", async ({page, t}) => {
        for (const path of ["/", "/drugs", "/groups/1", "/admin", "/select-clinic"]) {
            await page.goto(path);
            await expect(page, path).toHaveURL(/\/login$/);
            await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
        }
    });

    test("anonymous on /drugs: after a login that lands in a clinic, /drugs opens @AUTH-169", async ({page, t, data}) => {
        const clinic = await data.clinic();
        await page.goto("/drugs");
        await expect(page).toHaveURL(/\/login$/);
        await page.getByRole("textbox", {name: t.phone}).fill(clinic.owner.phone);
        await page.getByRole("button", {name: t.sendCode}).click();

        await expect(page).toHaveURL(/\/drugs$/);
        await expectContextLabel(page, clinic.name);
    });

    test("each context opens only its own pages: clinic → no admin, platform → /admin, no context → the picker @AUTH-171",
        async ({page, data, newBrowser}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});

            // A clinic context: the admin pages go to "/", nothing of the admin is shown or asked
            await signIn(page, staff.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);
            const adminCalls = recordRequests(page, "GET", /\/api\/v1\/admin\//);
            for (const path of ["/admin", "/admin/clinics/new", `/admin/clinics/${a.id}`]) {
                await page.goto(path);
                await expect(page, path).toHaveURL(/\/$/);
                await expectContextLabel(page, a.name);
            }
            expect(adminCalls).toHaveLength(0);

            // No context yet (several clinics, none picked): "/" → the picker
            const fresh = await newBrowser();
            await signIn(fresh.page, staff.phone, "asIs", "/");
            await expect(fresh.page).toHaveURL(/\/select-clinic$/);

            // The platform: /drugs → /admin
            const admin = await newBrowser();
            await signInSuperAdmin(admin.page, "/drugs");
            await expect(admin.page).toHaveURL(/\/admin$/);
        });

    test("API unreachable on page load: «تعذّر الاتصال بالخادم» with «إعادة المحاولة»; once it is back, Retry restores the session in the same clinic @AUTH-173 @AUTH-174",
        async ({page, t, data, healthy, allowNetworkErrors}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, {clinicId: b.id});
            await expectContextLabel(page, b.name);

            // The API unreachable: its "net::ERR_…" console lines are expected
            allowNetworkErrors();
            await page.route("**/api/v1/**", route => route.abort("connectionrefused"));
            await page.reload();
            await expect(page.getByText(t.network, {exact: true})).toBeVisible();
            const retry = page.getByRole("button", {name: t.retry});
            await expect(retry).toBeVisible();
            await expect(page).not.toHaveURL(/\/login$/);
            await expect(page.getByRole("textbox", {name: t.phone})).toHaveCount(0);
            await healthy();

            await page.unroute("**/api/v1/**");
            await retry.click();
            await expectContextLabel(page, b.name);
            await expect(page.getByRole("heading", {level: 1, name: t.navPrescription})).toBeVisible();
        });
});

test.describe("Several tabs and sessions @area:auth", () => {
    test("logged out in one tab and in again in another: the stale tab's switch gets 401, the new session's cookie survives and still refreshes @AUTH-151",
        async ({page, t, data, newTab, allowApiErrors}) => {
            // The stale tab's switch refused: the test's subject
            allowApiErrors({status: 401, method: "POST", path: /^\/api\/v1\/auth\/context$/});
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);
            await openSwitchClinic(page, t);

            // Tab 2: log out, log in again (a new session), pick B
            const other = await newTab();
            await other.goto("/");
            await expectContextLabel(other, a.name);
            await logout(other, t);
            await expect(other).toHaveURL(/\/login$/);
            await loginViaUi(other, t, staff.phone);
            await expectPicker(other, t);
            await pickerEntry(other, b.name).click();
            await expectContextLabel(other, b.name);

            // Tab 1 (the ended session's access token) switches
            const answers: number[] = [];
            page.on("response", response => {
                if (new URL(response.url()).pathname === "/api/v1/auth/context") answers.push(response.status());
            });
            await pickerEntry(page, b.name).click();
            await expect.poll(() => answers[0], {message: "the stale switch is refused"}).toBe(401);
            await expectContextLabel(page, b.name);

            // The live session's cookie was kept: it still refreshes
            await other.reload();
            await expectContextLabel(other, b.name);
            await expect(other).not.toHaveURL(/\/login$/);
        });

    test("two tabs in A, tab 1 switches to B: tab 2's next refresh moves it to B and never shows A's data under B's name @AUTH-197",
        async ({page, t, data, newTab}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const drugA = await data.drug(a, `Drug A ${u}`);
            const drugB = await data.drug(b, `Drug B ${u}`);
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);

            const other = await newTab();
            await other.goto("/drugs");
            await expect(other.getByRole("cell", {name: drugA.name})).toBeVisible();
            // From the next load on: A's drug and B's name never on screen together
            await other.addInitScript(([forbidden, under]) => {
                const check = () => {
                    const text = document.body?.innerText ?? "";
                    if (text.includes(forbidden) && text.includes(under)) (window as unknown as { leak: boolean }).leak = true;
                };
                new MutationObserver(check).observe(document, {subtree: true, childList: true, characterData: true});
            }, [drugA.name, b.name]);

            await openSwitchClinic(page, t);
            await pickerEntry(page, b.name).click();
            await expectContextLabel(page, b.name);

            await other.reload();
            await expectContextLabel(other, b.name);
            await expect(other.getByRole("cell", {name: drugB.name})).toBeVisible();
            await expect(other.getByRole("cell", {name: drugA.name})).toHaveCount(0);
            expect(await other.evaluate(() => (window as unknown as { leak?: boolean }).leak ?? false)).toBe(false);
        });

    test("tab 1 switched to B: tab 2's request that needs a refresh fails instead of being replayed in B, without a clinic-lost message @AUTH-194",
        async ({page, t, data, newTab, allowApiErrors}) => {
            // The 401 the test fakes (an expired access token)
            allowApiErrors({status: 401, method: "GET", path: /^\/api\/v1\/drugs$/});
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const drugA = await data.drug(a, `Drug A ${u}`);
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);
            const other = await newTab();
            await other.goto("/drugs");
            await expect(other.getByRole("cell", {name: drugA.name})).toBeVisible();

            await openSwitchClinic(page, t);
            await pickerEntry(page, b.name).click();
            await expectContextLabel(page, b.name);

            // Tab 2's access token has expired by now (its next API answer is a 401): its search needs a refresh
            const term = `zz${u}`;
            let refused = false;
            await other.route(`**/api/v1/drugs?*search=${term}*`, async route => {
                if (refused) return route.continue();
                refused = true;
                await route.fulfill({status: 401, contentType: "application/problem+json", json: {status: 401, code: "unauthorized"}});
            });
            const searches = recordRequests(other, "GET", /\/api\/v1\/drugs$/);
            const lost = toast(other, t.clinicLostChoose(a.name).slice(0, 12));
            await other.getByPlaceholder(t.searchDrugs).fill(term);

            await expect.poll(() => refused).toBe(true);
            // The refresh brought B: tab 2 follows it, the A request is not sent again in B
            await expectContextLabel(other, b.name);
            await expect(other.getByRole("cell", {name: drugA.name})).toHaveCount(0);
            expect(searches.filter(r => r.url().includes(term))).toHaveLength(1);
            await expect(lost).toHaveCount(0);
            await expect(toasts(other).filter({hasText: a.name})).toHaveCount(0);
        });

    test("a stale tab on the picker after another user signed in elsewhere: it follows that user, says so, sends the switch once, shows none of the old user's data @AUTH-199 @AUTH-201",
        async ({page, t, data, newTab, allowApiErrors}) => {
            // The stale tab's switch refused (another user's session now): the test's subject
            allowApiErrors({status: 401, method: "POST", path: /^\/api\/v1\/auth\/context$/});
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const c = await data.clinic({name: `C ${u}`});
            const first = await data.staff(a, {fullName: `First ${u}`});
            await data.staff(b, {phone: first.phone});
            const second = await data.staff(c, {fullName: `Second ${u}`});

            await loginViaUi(page, t, first.phone);
            await expectPicker(page, t);

            const other = await newTab();
            await other.goto("/select-clinic");
            await expectPicker(other, t);
            await other.getByRole("button", {name: t.logout}).click();
            await expect(other).toHaveURL(/\/login$/);
            await loginViaUi(other, t, second.phone);
            await expectContextLabel(other, c.name);

            const switches = recordRequests(page, "POST", /\/api\/v1\/auth\/context$/);
            await pickerEntry(page, a.name).click();

            await expectToast(page, t.otherUserSignedIn);
            await expect(page).toHaveURL(/\/$/);
            await expectContextLabel(page, c.name);
            expect(switches).toHaveLength(1);
            await expect(toasts(page)).toHaveCount(1);

            // Only the second user's name and data from now on (AUTH-201)
            await openAccountMenu(page, t);
            await expect(page.getByRole("menu")).toContainText(second.fullName);
            await expect(page.getByRole("menu")).not.toContainText(first.fullName);
            await page.keyboard.press("Escape");
            await expect(page.getByText(a.name)).toHaveCount(0);
        });
});
