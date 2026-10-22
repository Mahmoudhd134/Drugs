using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>
/// One permission per endpoint (access tech § API): a role holding the key (stored alone; its requirements are added)
/// gets a 2xx; a role holding only the key's requirements gets 403 <c>forbidden</c> and nothing changes.
/// </summary>
[Collection(AccessCollection3.Name)]
[Trait("Area", "access")]
public class EndpointGatingTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>What each key needs (access business table; transitive), i.e. a role that has everything but the key.</summary>
    private static readonly Dictionary<string, string[]> RequirementsOf = new()
    {
        [Permissions.Drugs.List] = [],
        [Permissions.Drugs.Details] = [Permissions.Drugs.List],
        [Permissions.Drugs.Create] = [Permissions.Drugs.List],
        [Permissions.Drugs.Update] = [Permissions.Drugs.Details, Permissions.Drugs.List],
        [Permissions.Drugs.Delete] = [Permissions.Drugs.Details, Permissions.Drugs.List],
        [Permissions.Protocols.List] = [],
        [Permissions.Protocols.Details] = [Permissions.Protocols.List],
        [Permissions.Protocols.Create] = [Permissions.Protocols.List, Permissions.Drugs.List],
        [Permissions.Protocols.Update] = [Permissions.Protocols.Details, Permissions.Protocols.List, Permissions.Drugs.List],
        [Permissions.Protocols.Delete] = [Permissions.Protocols.List],
    };

    [Fact]
    [Trait("Case", "ACC-022")]
    public Task Listing_drugs_needs_drugs_list() => ShouldBeGatedAsync("GET /drugs");

    [Fact]
    [Trait("Case", "ACC-023")]
    public Task Opening_a_drug_needs_drugs_details() => ShouldBeGatedAsync("GET /drugs/{id}");

    [Fact]
    [Trait("Case", "ACC-024")]
    public Task A_drugs_groups_need_drugs_details() => ShouldBeGatedAsync("GET /drugs/{id}/groups");

    [Fact]
    [Trait("Case", "ACC-025")]
    public Task Creating_a_drug_needs_drugs_create() => ShouldBeGatedAsync("POST /drugs");

    [Fact]
    [Trait("Case", "ACC-026")]
    public Task Updating_a_drug_needs_drugs_update() => ShouldBeGatedAsync("PUT /drugs/{id}");

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ACC-027")]
    public Task Deleting_a_drug_needs_drugs_delete() => ShouldBeGatedAsync("DELETE /drugs/{id}");

    [Fact]
    [Trait("Case", "ACC-028")]
    public Task Listing_groups_needs_groups_list() => ShouldBeGatedAsync("GET /drug-groups");

    [Fact]
    [Trait("Case", "ACC-029")]
    public Task Opening_a_group_needs_groups_details() => ShouldBeGatedAsync("GET /drug-groups/{id}");

    [Fact]
    [Trait("Case", "ACC-030")]
    public Task Creating_a_group_needs_groups_create() => ShouldBeGatedAsync("POST /drug-groups");

    [Fact]
    [Trait("Case", "ACC-031")]
    public Task Updating_a_group_needs_groups_update() => ShouldBeGatedAsync("PUT /drug-groups/{id}");

    [Fact]
    [Trait("Case", "ACC-032")]
    public Task Deleting_a_group_needs_groups_delete() => ShouldBeGatedAsync("DELETE /drug-groups/{id}");

    [Fact]
    [Trait("Case", "ACC-033")]
    public async Task The_permission_is_checked_before_the_body_or_the_row()
    {
        var clinic = await Data.Clinic();
        var assistant = await Login.WithRoleAsync(clinic, "Assistant");
        var viewer = await Login.WithPermissionsAsync(clinic,
            Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Protocols.List, Permissions.Protocols.Details);

        await (await assistant.DeleteAsync("/api/v1/drugs/2147483000")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await assistant.DeleteAsync("/api/v1/drug-groups/2147483000")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await viewer.PostAsync("/api/v1/drugs", new { name = "" })).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await viewer.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", "{bad json")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await viewer.PostAsync("/api/v1/drug-groups", new { name = "", items = Array.Empty<object>() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    private async Task ShouldBeGatedAsync(string endpoint)
    {
        var clinic = await Data.Clinic();
        var key = CatalogRoutes.PermissionOf[endpoint];
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var holder = await Login.WithPermissionsAsync(clinic, key);
        var without = await Login.WithPermissionsAsync(clinic, RequirementsOf[key]);
        (await without.MeAsync()).Permissions.ShouldNotContain(key);
        var before = await SnapshotAsync(clinic.Id, target);

        var denied = await CatalogRoutes.CallAsync(without, endpoint, target);

        await denied.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await SnapshotAsync(clinic.Id, target)).ShouldBe(before, "a forbidden request changes nothing");

        var allowed = await CatalogRoutes.CallAsync(holder, endpoint, target);

        await allowed.ShouldSucceedAsync();
        if (endpoint.StartsWith("GET"))
            return;
        (await SnapshotAsync(clinic.Id, target)).ShouldNotBe(before, "the allowed request did its change");
    }

    /// <summary>What a write could change: the clinic's drug and group counts, the target's names and lines.</summary>
    private Task<string> SnapshotAsync(int clinicId, CatalogTarget target) => App.QueryDbAsync(async db =>
    {
        var drugs = await db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == clinicId)
            .OrderBy(d => d.Id).Select(d => d.Id + ":" + d.Name).ToListAsync();
        var groups = await db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == clinicId)
            .OrderBy(g => g.Id).Select(g => g.Id + ":" + g.Name).ToListAsync();
        var lines = await db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ProtocolId == target.ProtocolId)
            .OrderBy(i => i.Id).Select(i => i.Id + ":" + i.DrugId).ToListAsync();
        return string.Join("|", drugs) + "#" + string.Join("|", groups) + "#" + string.Join("|", lines);
    });
}
