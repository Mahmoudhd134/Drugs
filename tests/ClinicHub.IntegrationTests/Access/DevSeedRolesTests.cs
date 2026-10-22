using ClinicHub.Application.Common.Abstractions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>
/// The dev seed's roles after M1.7a (design D10; M1.7a contract "Backend": the Viewer role keeps
/// <c>drugs.list</c>, <c>drugs.details</c>, <c>protocols.list</c>, <c>protocols.details</c>). The dev seed runs only on
/// a database without clinics, so this class has one test: it starts on a fresh database (the class reset).
/// </summary>
[Collection(AccessCollection3.Name)]
[Trait("Area", "access")]
public class DevSeedRolesTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ACC-089")]
    public async Task The_dev_seed_stores_no_groups_key_and_the_viewer_keeps_exactly_its_four_keys()
    {
        // The app as in Development (dev phones set), its seeder run with the demo data
        await using var dev = App.CreateVariant(new Dictionary<string, string>
        {
            ["Platform:DevOwnerPhone"] = Unique.Phone(),
            ["Platform:DevAssistantPhone"] = Unique.Phone(),
        });
        dev.Start();
        await using (var scope = dev.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<IStartupSeeder>().SeedAsync(isDevelopment: true);

        var stored = await App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters()
            .SelectMany(r => r.Permissions.Select(p => new { RoleId = r.Id, r.Name, p.Permission }))
            .ToListAsync());

        stored.ShouldNotBeEmpty("the demo clinics' roles");
        stored.Where(r => r.Permission.StartsWith("groups.")).ShouldBeEmpty("groups.* rows");
        var viewers = stored.Where(r => r.Name == "Viewer").GroupBy(r => r.RoleId).ToList();
        viewers.Count.ShouldBe(1, "one Viewer role (Second demo clinic)");
        viewers[0].Select(r => r.Permission)
            .ShouldBe(["drugs.list", "drugs.details", "protocols.list", "protocols.details"], ignoreOrder: true);
    }
}
