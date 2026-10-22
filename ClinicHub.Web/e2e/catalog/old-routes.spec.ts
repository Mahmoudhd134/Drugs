import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createProtocol} from "../support/catalog.ts";

/**
 * Old bookmarks after groups became protocols (design M1.7 D10; M1.7a contract "SPA routes and redirects"): every
 * `/groups…` address lands on the matching `/protocols…` one with the same id, query and hash, replacing it in the
 * history.
 */
test.describe("Old /groups bookmarks @area:catalog", () => {
    test("/groups, /groups/new, /groups/{id} and /groups?search=x&page=2 land on the matching /protocols… page @GRP-100",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Bookmarked ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/groups");

            await test.step("/groups → /protocols", async () => {
                await expect(page).toHaveURL(/\/protocols$/);
                await expect(page.getByRole("heading", {level: 1, name: t.protocolsTitle})).toBeVisible();
                await settled(page);
                await healthy();
            });

            await test.step("/groups/new → /protocols/new", async () => {
                await page.goto("/groups/new");
                await expect(page).toHaveURL(/\/protocols\/new$/);
                await expect(page.getByRole("heading", {level: 1, name: t.newProtocol})).toBeVisible();
                await settled(page);
                await healthy();
            });

            await test.step("/groups/{id} → /protocols/{id}", async () => {
                await page.goto(`/groups/${protocol.id}`);
                await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
                await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
                await settled(page);
                await healthy();
            });

            await test.step("/groups?search=x&page=2 → /protocols?search=x&page=2", async () => {
                await page.goto("/groups?search=x&page=2");
                await expect(page).toHaveURL(/\/protocols\?search=x&page=2$/);
                await expect(page.getByRole("heading", {level: 1, name: t.protocolsTitle})).toBeVisible();
                await settled(page);
                await healthy();
            });
        });

    test("the redirect replaces the old address: Back from /protocols/{id}?x=1 returns to the page before, never to /groups @GRP-100",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Bookmarked ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await settled(page);

            await page.goto(`/groups/${protocol.id}?x=1`);
            await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}\\?x=1$`));
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(protocol.name);
            await page.goBack();
            await expect(page).toHaveURL(/\/drugs$/);
        });
});
