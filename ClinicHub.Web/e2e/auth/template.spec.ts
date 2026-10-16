import {expect, signIn, superAdminPhone, test} from "../support/fixtures.ts";
import {expectContextLabel, recordRequests} from "../support/ui.ts";

test.describe("The template clinic (super admin) @area:auth", () => {
    test("in the template: the warning banner, and «العودة إلى إدارة المنصة» switches to the platform and opens /admin @AUTH-180",
        async ({page, t, healthy}) => {
            await signIn(page, superAdminPhone(), "template", "/drugs");
            await expectContextLabel(page, t.template);
            const banner = page.getByRole("alert").filter({hasText: t.templateBanner});
            await expect(banner).toBeVisible();
            await healthy();

            const switches = recordRequests(page, "POST", /\/api\/v1\/auth\/context$/);
            await banner.getByRole("button", {name: t.backToAdmin}).click();
            await expect(page).toHaveURL(/\/admin$/);
            await expectContextLabel(page, t.platform);
            expect(switches).toHaveLength(1);
            expect(switches[0].postDataJSON()).toEqual({type: "platform"});
        });
});
