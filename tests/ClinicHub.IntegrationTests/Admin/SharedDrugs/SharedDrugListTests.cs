using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Admin.SharedDrugs;

/// <summary>
/// <c>GET /admin/drugs</c> (design M1.7 D7, D8, § 6): shared drugs only, the status filter, the list order, and own drugs
/// never found. No test of this class creates a drug matching "tobra" (CAT-183's exact count).
/// </summary>
[Collection(SharedDrugsCollection.Name)]
[Trait("Area", "admin")]
public class SharedDrugListTests(AppFixture app) : IntegrationTest(app)
{
    private Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    [Fact]
    [Trait("Case", "CAT-182")]
    public async Task The_admin_list_holds_only_shared_drugs_active_by_default_withdrawn_or_all_on_request()
    {
        var admin = await AdminAsync();
        var token = $"Qz{Unique.Next()}k";
        var active = await Data.SharedDrug().Named($"ACTIVE {token} 10 MG");
        var withdrawn = await Data.SharedDrug().Named($"DISABLED {token} 10 MG").Withdrawn();
        var clinic = await Data.Clinic();
        await Data.Drug(clinic).Named($"OWN {token}");

        (await admin.SearchAdminDrugsAsync(token)).Items.Select(d => d.Id).ShouldBe([active.Id]);
        (await admin.SearchAdminDrugsAsync(token, "&status=active")).Items.Select(d => d.Id).ShouldBe([active.Id]);
        var disabled = await admin.SearchAdminDrugsAsync(token, "&status=withdrawn");
        disabled.Items.Select(d => d.Id).ShouldBe([withdrawn.Id]);
        disabled.Items.ShouldAllBe(d => d.Withdrawn && d.WithdrawnAt != null);
        var all = await admin.SearchAdminDrugsAsync(token, "&status=all");
        all.Items.Select(d => d.Id).ShouldBe([active.Id, withdrawn.Id]);
        all.TotalCount.ShouldBe(2);

        var activeShared = await App.ActiveSharedCountAsync();
        var withdrawnShared = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == null && d.IsWithdrawn));
        var noSearch = await admin.AdminDrugsAsync("pageSize=100");
        noSearch.TotalCount.ShouldBe(activeShared);
        noSearch.Items.ShouldAllBe(d => !d.Withdrawn);
        var withdrawnList = await admin.AdminDrugsAsync("status=withdrawn&pageSize=100");
        withdrawnList.TotalCount.ShouldBe(withdrawnShared);
        withdrawnList.Items.ShouldAllBe(d => d.Withdrawn);
        (await admin.AdminDrugsAsync("status=all&pageSize=1")).TotalCount.ShouldBe(activeShared + withdrawnShared);
    }

    [Theory]
    [Trait("Case", "CAT-182")]
    [InlineData("bogus")]
    [InlineData("Active")]
    [InlineData("WITHDRAWN")]
    [InlineData("1")]
    public async Task An_unknown_status_is_400_invalidRequest_on_status(string status)
    {
        var admin = await AdminAsync();

        var problem = await (await admin.GetAsync($"{AdminDrugs}?status={Uri.EscapeDataString(status)}"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError("status", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "CAT-183")]
    public async Task Searching_tobra_lists_the_34_shared_matches_those_starting_with_it_first_then_by_name()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic).Named("Tobradex");

        var page = await admin.SearchAdminDrugsAsync("tobra");

        page.TotalCount.ShouldBe(34);
        page.Items.Count.ShouldBe(34);
        page.Items.ShouldNotContain(d => d.Id == own.Id);
        var starting = page.Items.Take(9).ToList();
        var others = page.Items.Skip(9).ToList();
        starting.ShouldAllBe(d => d.Name.StartsWith("TOBRA", StringComparison.OrdinalIgnoreCase));
        others.ShouldAllBe(d => !d.Name.StartsWith("TOBRA", StringComparison.OrdinalIgnoreCase));
        starting[0].Name.ShouldBe("TOBRA-ALEX 20MG/2ML 5 AMP.");
        starting[8].Name.ShouldBe("TOBRAL 0.3% EYE DROPS 5 ML");
        starting.Select(d => d.Id).ShouldBe(await InNameOrderAsync(starting.Select(d => d.Id)));
        others.Select(d => d.Id).ShouldBe(await InNameOrderAsync(others.Select(d => d.Id)));
    }

    [Fact]
    [Trait("Case", "CAT-183")]
    public async Task Without_a_search_every_active_shared_drug_is_listed_by_name_then_id()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        await Data.Drug(clinic).Named("Aaa own first in a clinic");

        var first = await admin.AdminDrugsAsync("pageSize=100");
        var third = await admin.AdminDrugsAsync("page=3&pageSize=100");

        var expected = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.ClinicId == null && !d.IsWithdrawn)
            .OrderBy(d => d.Name).ThenBy(d => d.Id).Select(d => d.Id).Take(300).ToListAsync());
        first.Items.Select(d => d.Id).ShouldBe(expected.Take(100));
        third.Items.Select(d => d.Id).ShouldBe(expected.Skip(200).Take(100));
        first.TotalCount.ShouldBe(await App.ActiveSharedCountAsync());
    }

    [Fact]
    [Trait("Case", "ISO-046")]
    public async Task The_admin_search_never_finds_a_clinics_own_drug()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var name = $"Ownonly {Unique.Next()} دواء";
        await Data.Drug(clinic).Named(name);

        foreach (var status in new[] { "", "&status=active", "&status=withdrawn", "&status=all" })
        {
            var page = await admin.SearchAdminDrugsAsync(name, status);
            page.TotalCount.ShouldBe(0, status);
            page.Items.ShouldBeEmpty(status);
        }
        (await (await Login.OwnerAsync(clinic)).SearchClinicDrugsAsync(name)).TotalCount.ShouldBe(1, "the clinic finds its own drug");
    }

    /// <summary>The ids in the list order without a search's start tier: <c>Name</c> (database collation), then <c>Id</c>.</summary>
    private Task<List<int>> InNameOrderAsync(IEnumerable<int> ids)
    {
        var set = ids.ToList();
        return App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => set.Contains(d.Id))
            .OrderBy(d => d.Name).ThenBy(d => d.Id).Select(d => d.Id).ToListAsync());
    }
}
