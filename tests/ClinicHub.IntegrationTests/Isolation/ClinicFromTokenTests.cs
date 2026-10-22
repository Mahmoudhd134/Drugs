using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Isolation;

/// <summary>The request's clinic comes only from the access token's <c>clinic_id</c> (tech overview § Conventions).</summary>
[Collection(IsolationCollection2.Name)]
[Trait("Area", "isolation")]
public class ClinicFromTokenTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ISO-019")]
    public async Task A_clinic_id_in_the_body_is_ignored()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var owner = await Login.OwnerAsync(a);

        var created = await (await owner.PostAsync("/api/v1/drugs", new { name = Unique.Name("Tobradex", "توبرادكس"), clinicId = b.Id }))
            .ReadAsync<DrugDto>();
        await (await owner.PutAsync($"/api/v1/drugs/{created.Id}", new { name = Unique.Name("Tobradex", "توبرادكس"), clinicId = b.Id }))
            .ShouldBeOkAsync();

        (await ClinicOfDrugAsync(created.Id)).ShouldBe(a.Id);
        await (await owner.GetAsync($"/api/v1/drugs/{created.Id}")).ShouldBeOkAsync();
        await (await (await Login.OwnerAsync(b)).GetAsync($"/api/v1/drugs/{created.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-020")]
    public async Task A_clinic_id_in_the_query_string_is_ignored()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var aDrug = await Data.Drug(a);
        var bDrug = await Data.Drug(b);
        var owner = await Login.OwnerAsync(a);

        var page = await (await owner.GetAsync($"/api/v1/drugs?clinicId={b.Id}&pageSize=100")).ReadAsync<PagedResult<DrugDto>>();

        page.Items.ShouldContain(d => d.Id == aDrug.Id);
        page.Items.ShouldNotContain(d => d.Id == bDrug.Id);
        await (await owner.GetAsync($"/api/v1/drugs/{bDrug.Id}?clinicId={b.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-021")]
    public async Task The_old_dev_clinic_header_is_ignored()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var aDrug = await Data.Drug(a);
        var bDrug = await Data.Drug(b);
        var owner = await Login.OwnerAsync(a);

        var list = new HttpRequestMessage(HttpMethod.Get, "/api/v1/drugs?pageSize=100");
        list.Headers.Add("X-Dev-Clinic-Id", b.Id.ToString());
        var page = await (await owner.SendAsync(list)).ReadAsync<PagedResult<DrugDto>>();
        var one = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/drugs/{bDrug.Id}");
        one.Headers.Add("X-Dev-Clinic-Id", b.Id.ToString());

        page.Items.ShouldContain(d => d.Id == aDrug.Id);
        page.Items.ShouldNotContain(d => d.Id == bDrug.Id);
        await (await owner.SendAsync(one)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-021")]
    public async Task The_old_dev_clinic_header_is_ignored_in_development_too()
    {
        // A and B first: the Development startup seed only fills an empty database
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var aDrug = await Data.Drug(a);
        var bDrug = await Data.Drug(b);
        // The same app in the Development environment, where the old header used to switch the clinic
        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["environment"] = "Development" });
        variant.Start();
        var owner = await Login.On(variant).OwnerAsync(a);

        var list = new HttpRequestMessage(HttpMethod.Get, "/api/v1/drugs?pageSize=100");
        list.Headers.Add("X-Dev-Clinic-Id", b.Id.ToString());
        var page = await (await owner.SendAsync(list)).ReadAsync<PagedResult<DrugDto>>();
        var one = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/drugs/{bDrug.Id}");
        one.Headers.Add("X-Dev-Clinic-Id", b.Id.ToString());

        page.Items.ShouldContain(d => d.Id == aDrug.Id);
        page.Items.ShouldNotContain(d => d.Id == bDrug.Id);
        await (await owner.SendAsync(one)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-022")]
    public async Task After_a_switch_the_old_token_still_reads_its_own_clinic_only()
    {
        var phone = Unique.Phone();
        var a = await Data.Clinic().OwnedBy(phone);
        var b = await Data.Clinic().OwnedBy(phone);
        var aDrug = await Data.Drug(a);
        var bDrug = await Data.Drug(b);
        var user = await Login.AsAsync(phone);
        await user.EnterClinicAsync(a.Id);
        var aToken = user.AccessToken;

        await user.EnterClinicAsync(b.Id);
        var bPage = await (await user.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();
        user.AccessToken = aToken;
        var aPage = await (await user.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();

        bPage.Items.ShouldContain(d => d.Id == bDrug.Id);
        bPage.Items.ShouldNotContain(d => d.Id == aDrug.Id);
        aPage.Items.ShouldContain(d => d.Id == aDrug.Id);
        aPage.Items.ShouldNotContain(d => d.Id == bDrug.Id);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-023")]
    public async Task A_forged_token_with_another_clinic_and_an_own_staff_id_gets_no_access_and_no_data()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var bDrug = await Data.Drug(b);
        var staff = await Data.Staff(a).WithRole("Doctor");
        var real = await Login.StaffAsync(staff);
        using var forged = new ApiClient(App.Factory) { AccessToken = ForgedTokens.Clinic(App, staff.UserId, b.Id, staff.Id, real) };

        await (await forged.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await forged.GetAsync($"/api/v1/drugs/{bDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await forged.DeleteAsync($"/api/v1/drugs/{bDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ClinicOfDrugAsync(bDrug.Id)).ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "ISO-024")]
    public async Task A_forged_staff_less_token_of_a_user_who_is_not_super_admin_gets_no_access()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        using var forged = new ApiClient(App.Factory) { AccessToken = ForgedTokens.Clinic(App, a.Owner.UserId, b.Id, staffId: null) };

        await (await forged.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await forged.PostAsync("/api/v1/drugs", new { name = "Hijacked " + Guid.NewGuid() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    private Task<int> ClinicOfDrugAsync(int drugId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drugId).Select(d => d.ClinicId.Value).SingleAsync());
}
