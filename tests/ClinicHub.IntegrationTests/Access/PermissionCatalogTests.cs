using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary><c>GET /permissions</c>: the permission catalog (access tech § API).</summary>
[Collection(AccessCollection.Name)]
[Trait("Area", "access")]
public class PermissionCatalogTests(AppFixture app) : IntegrationTest(app)
{
    private static readonly string[] CatalogOrder =
    [
        "drugs.list", "drugs.details", "drugs.create", "drugs.update", "drugs.delete",
        "protocols.list", "protocols.details", "protocols.create", "protocols.update", "protocols.delete",
        "prescriptions.create",
    ];

    [Fact]
    [Trait("Case", "ACC-001")]
    public async Task A_clinic_token_gets_the_11_permissions_in_catalog_order_with_their_fields()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var entries = await ReadCatalogAsync(owner);

        entries.Select(e => (string)e["key"]).ShouldBe(CatalogOrder);
        foreach (var entry in entries)
        {
            entry.Select(p => p.Key).OrderBy(k => k).ShouldBe(["action", "key", "module", "requires", "resource"]);
            entry["requires"].ShouldBeOfType<JsonArray>();
            var key = (string)entry["key"];
            ((string)entry["resource"] + "." + (string)entry["action"]).ShouldBe(key);
        }
    }

    [Fact]
    [Trait("Case", "ACC-002")]
    public async Task The_drug_and_protocol_keys_are_in_the_catalog_module_and_the_prescription_key_in_its_own()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var entries = await ReadCatalogAsync(owner);

        entries.ToDictionary(e => (string)e["key"], e => (string)e["module"]).ShouldBe(new Dictionary<string, string>
        {
            ["drugs.list"] = "catalog", ["drugs.details"] = "catalog", ["drugs.create"] = "catalog",
            ["drugs.update"] = "catalog", ["drugs.delete"] = "catalog",
            ["protocols.list"] = "catalog", ["protocols.details"] = "catalog", ["protocols.create"] = "catalog",
            ["protocols.update"] = "catalog", ["protocols.delete"] = "catalog",
            ["prescriptions.create"] = "prescription",
        }, ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ACC-003")]
    public async Task Requires_lists_only_the_direct_requirements()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var entries = await ReadCatalogAsync(owner);

        var requires = entries.ToDictionary(e => (string)e["key"],
            e => e["requires"].AsArray().Select(r => (string)r).OrderBy(r => r).ToArray());
        requires["drugs.list"].ShouldBeEmpty();
        requires["drugs.details"].ShouldBe(["drugs.list"]);
        requires["drugs.create"].ShouldBe(["drugs.list"]);
        requires["drugs.update"].ShouldBe(["drugs.details"]);
        requires["drugs.delete"].ShouldBe(["drugs.details"]);
        requires["protocols.list"].ShouldBeEmpty();
        requires["protocols.details"].ShouldBe(["protocols.list"]);
        requires["protocols.delete"].ShouldBe(["protocols.list"]);
        requires["protocols.create"].ShouldBe(["drugs.list", "protocols.list"]);
        requires["protocols.update"].ShouldBe(["drugs.list", "protocols.details"]);
        requires["prescriptions.create"].ShouldBe(["drugs.list"]);
    }

    [Fact]
    [Trait("Case", "ACC-004")]
    public async Task A_platform_token_and_a_no_context_token_read_it_too()
    {
        var platform = await Login.SuperAdminAsync();
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);
        var noContext = await Login.AsAsync(phone);
        noContext.Auth.Context.ShouldBeNull();

        (await ReadCatalogAsync(platform)).Count.ShouldBe(11);
        (await ReadCatalogAsync(noContext)).Count.ShouldBe(11);
    }

    [Fact]
    [Trait("Case", "ACC-004")]
    public async Task Without_a_token_it_answers_401()
    {
        var response = await Anonymous().GetAsync("/api/v1/permissions");

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    private static async Task<List<JsonObject>> ReadCatalogAsync(ApiClient client)
    {
        var response = await client.GetAsync("/api/v1/permissions");
        await response.ShouldBeOkAsync();
        return (await response.ReadNodeAsync()).AsArray().Select(n => n.AsObject()).ToList();
    }
}
