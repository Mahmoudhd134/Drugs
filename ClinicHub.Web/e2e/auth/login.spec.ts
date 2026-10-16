import type {Page} from "@playwright/test";
import {expect, loginViaUi, test} from "../support/fixtures.ts";
import {uniquePhone} from "../support/phones.ts";
import {UX_TEXTS} from "../support/texts-ux.ts";
import {expectContextLabel, navTo} from "../support/ui.ts";

/**
 * As if codes went by SMS: the request's answer reaches the page without `devCode`, so the code step waits for the
 * user to type the code. Returns the real code (taken from the API's answer).
 */
const withoutDisplayedCode = async (page: Page) => {
    const codes: string[] = [];
    await page.route("**/api/v1/auth/otp/request", async route => {
        const response = await route.fetch();
        const body = await response.json() as { devCode?: string };
        if (body.devCode) codes.push(body.devCode);
        delete body.devCode;
        await route.fulfill({response, json: body});
    });
    return codes;
};

const countRequests = (page: Page, path: string) => {
    const sent: string[] = [];
    page.on("request", request => {
        if (request.method() === "POST" && new URL(request.url()).pathname === path) sent.push(request.url());
    });
    return sent;
};

test.describe("Login page @area:auth", () => {
    test("display mode: the banner shows before any code is requested; the language menu is there and the page fits (375 px: no horizontal scroll) @AUTH-002 @AUTH-091",
        async ({page, t, lang, healthy}) => {
            await page.goto("/login");
            await expect(page.getByRole("alert").filter({hasText: t.displayModeBanner})).toHaveText(t.displayModeBanner);
            await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
            await expect(page.getByRole("button", {name: UX_TEXTS[lang].language}), "the language menu").toBeVisible();
            // dir/lang, no horizontal scroll (the phone project is 375 px), axe
            await healthy();
        });

    test("a staff member of one clinic logs in: the code is shown, filled in and sent for them, and the clinic opens @AUTH-004 @AUTH-089 @AUTH-177 @smoke",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            const staff = await data.staff(clinic, {roles: ["Doctor"]});
            // Hold the automatic verify until the code step has been looked at
            let release!: () => void;
            const held = new Promise<void>(resolve => { release = resolve; });
            let verifies = 0;
            await page.route("**/api/v1/auth/otp/verify", async route => {
                verifies++;
                await held;
                await route.continue();
            });

            await loginViaUi(page, t, staff.phone);

            const codeAlert = page.getByRole("alert").filter({hasText: t.devCode});
            await expect(codeAlert).toHaveText(new RegExp(`^${t.devCode}\\s*\\d{6}$`));
            const shown = (await codeAlert.textContent())!.replace(/\D/g, "");
            await expect(page.getByRole("textbox", {name: t.code})).toHaveValue(shown);
            await expect.poll(() => verifies, {message: "the code is sent without typing"}).toBe(1);
            release();

            await expect(page).toHaveURL(/\/$/);
            await expect(page.getByRole("heading", {level: 1, name: t.navPrescription})).toBeVisible();
            await expect(page.getByRole("banner")).toContainText(clinic.name);
            await healthy();
            // The clinic's name stays in the app bar on the clinic's other pages
            for (const [entry, path] of [[t.navDrugs, /\/drugs$/], [t.navGroups, /\/groups$/]] as const) {
                await navTo(page, t, entry);
                await expect(page).toHaveURL(path);
                await expectContextLabel(page, clinic.name);
            }
        });

    test("an invalid phone is refused on the phone step @AUTH-017", async ({page, t, healthy, allowApiErrors}) => {
        // An invalid phone refused: the test's subject
        allowApiErrors({status: 400, method: "POST", path: /^\/api\/v1\/auth\/otp\/request$/});
        await page.goto("/login");
        const phone = page.getByRole("textbox", {name: t.phone});
        await phone.fill("0123");
        await page.getByRole("button", {name: t.sendCode}).click();

        await expect(page.getByRole("alert").filter({hasText: t.invalidPhone})).toHaveText(t.invalidPhone);
        await expect(phone).toBeVisible();
        await expect(phone).toHaveValue("0123");
        await expect(page.getByRole("textbox", {name: t.code})).toHaveCount(0);
        await healthy();
    });

    test("too many codes for a phone: the 429 is explained @AUTH-030", async ({page, t, allowApiErrors}) => {
        // The code request over the hourly limit: the test's subject
        allowApiErrors({status: 429, method: "POST", path: /^\/api\/v1\/auth\/otp\/request$/});
        const phone = uniquePhone();
        // The hour's 5 codes (Testing: 5 per phone per hour)
        for (let i = 0; i < 5; i++) {
            const response = await page.request.post("/api/v1/auth/otp/request", {data: {phone}});
            expect(response.status()).toBe(200);
        }
        await page.goto("/login");
        await page.getByRole("textbox", {name: t.phone}).fill(phone);
        await page.getByRole("button", {name: t.sendCode}).click();

        await expect(page.getByRole("alert").filter({hasText: t.tooManyRequests})).toHaveText(t.tooManyRequests);
        await expect(page.getByRole("textbox", {name: t.phone})).toBeVisible();
    });

    test("a double click on «إرسال الكود» sends one code request @AUTH-035", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const requests = countRequests(page, "/api/v1/auth/otp/request");
        await page.goto("/login");
        await page.getByRole("textbox", {name: t.phone}).fill(clinic.owner.phone);
        await page.getByRole("button", {name: t.sendCode}).dblclick();

        await expect(page.getByRole("banner")).toContainText(clinic.name);
        expect(requests).toHaveLength(1);
    });

    test("a right code for a phone with no access: the generic refusal @AUTH-074", async ({page, t, healthy, allowApiErrors}) => {
        // The login refused: the test's subject
        allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/auth\/otp\/verify$/});
        await loginViaUi(page, t, uniquePhone());
        await expect(page.getByRole("alert").filter({hasText: t.noAccess})).toHaveText(t.noAccess);
        await expect(page).toHaveURL(/\/login$/);
        await healthy();
    });

    test("a right code for staff deactivated in their only clinic: the clinic is named @AUTH-075", async ({page, t, data, allowApiErrors}) => {
        // The login refused: the test's subject
        allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/auth\/otp\/verify$/});
        const clinic = await data.clinic();
        const staff = await data.staff(clinic);
        await data.deactivate(staff);

        await loginViaUi(page, t, staff.phone);
        const message = t.staffInactiveNamed(clinic.name);
        await expect(page.getByRole("alert").filter({hasText: message})).toHaveText(message);
        await expect(page).toHaveURL(/\/login$/);
    });

    test("a right code for staff of a suspended clinic only: the clinic is named @AUTH-078", async ({page, t, data, allowApiErrors}) => {
        // The login refused: the test's subject
        allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/auth\/otp\/verify$/});
        const clinic = await data.clinic();
        const staff = await data.staff(clinic);
        await data.suspend(clinic);

        await loginViaUi(page, t, staff.phone);
        const message = t.clinicSuspendedNamed(clinic.name);
        await expect(page.getByRole("alert").filter({hasText: message})).toHaveText(message);
        await expect(page).toHaveURL(/\/login$/);
    });

    test("a wrong code is refused with its message @AUTH-081", async ({page, t, data, healthy, allowApiErrors}) => {
        // A wrong code refused: the test's subject
        allowApiErrors({status: 400, method: "POST", path: /^\/api\/v1\/auth\/otp\/verify$/});
        const clinic = await data.clinic();
        const codes = await withoutDisplayedCode(page);
        await loginViaUi(page, t, clinic.owner.phone);

        const code = page.getByRole("textbox", {name: t.code});
        await expect(code).toBeVisible();
        const real = codes[0];
        const wrong = `${(Number(real[0]) + 1) % 10}${real.slice(1)}`;
        await code.fill(wrong);
        await page.getByRole("button", {name: t.verify}).click();

        await expect(page.getByRole("alert").filter({hasText: t.invalidCode})).toHaveText(t.invalidCode);
        await expect(page).toHaveURL(/\/login$/);
        await healthy();
    });

    test("a double click on «دخول» sends one verify @AUTH-088", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const codes = await withoutDisplayedCode(page);
        const verifies = countRequests(page, "/api/v1/auth/otp/verify");
        await loginViaUi(page, t, clinic.owner.phone);

        const code = page.getByRole("textbox", {name: t.code});
        await expect(code).toBeVisible();
        await code.fill(codes[0]);
        await page.getByRole("button", {name: t.verify}).dblclick();

        await expect(page.getByRole("banner")).toContainText(clinic.name);
        expect(verifies).toHaveLength(1);
    });
});
