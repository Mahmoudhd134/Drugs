using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// Who may call the three routes and on which clinics (contract § 1.2): no token 401; any token but a current super
/// admin's platform token 403, checked first; a missing, deleted or template clinic 404, before the body is read.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateAccessTests(AppFixture app) : IntegrationTest(app)
{
    private const int UnknownId = 999_999;
    private const string Malformed = "{bad json";

    private static async Task EveryRouteAnswersAsync(ApiClient client, int clinicId, HttpStatusCode status, string code)
    {
        foreach (var (method, url, body) in TemplateApi.Every(clinicId))
            await (await client.CallAsync(method, url, body)).ShouldBeProblemAsync(status, code);
    }

    private static async Task EveryRouteAnswersForAMalformedBodyAsync(ApiClient client, int clinicId, HttpStatusCode status, string code)
    {
        foreach (var call in client.SendRawToEveryRoute(clinicId, Malformed))
            await (await call).ShouldBeProblemAsync(status, code);
    }

    /// <summary>A clinic with a saved template, and a check that it is exactly as saved (same row, not rewritten).</summary>
    private async Task<(ClinicHandle Clinic, Func<Task> NothingChanged)> ClinicWithATemplateAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L();
        await admin.SaveTemplateAsync(clinic.Id, layout);
        var row = await App.TemplateRowAsync(clinic.Id);
        return (clinic, async () =>
        {
            var after = await App.TemplateRowAsync(clinic.Id);
            after.Id.ShouldBe(row.Id);
            after.Layout.ShouldBe(row.Layout);
            after.UpdatedAt.ShouldBe(row.UpdatedAt);
            (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
        });
    }

    // ---- TPL-007: tokens ----

    [Fact]
    [Trait("Case", "TPL-007")]
    [Trait("Tier", "Smoke")]
    public async Task No_token_gets_401_on_every_template_route_and_nothing_changes()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();

        await EveryRouteAnswersAsync(Anonymous(), clinic.Id, HttpStatusCode.Unauthorized, "unauthorized");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task A_garbage_token_gets_401_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var client = Anonymous();
        client.AccessToken = "abc.def.ghi";

        await EveryRouteAnswersAsync(client, clinic.Id, HttpStatusCode.Unauthorized, "unauthorized");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    [Trait("Tier", "Smoke")]
    public async Task The_owners_clinic_token_gets_403_on_every_template_route_of_their_own_clinic_and_nothing_changes()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var owner = await Login.OwnerAsync(clinic);

        await EveryRouteAnswersAsync(owner, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Theory]
    [Trait("Case", "TPL-007")]
    [InlineData(DefaultRoles.Doctor)]
    [InlineData(DefaultRoles.Assistant)]
    public async Task A_staff_clinic_token_gets_403_on_every_template_route(string role)
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var staff = await Login.WithRoleAsync(clinic, role);

        await EveryRouteAnswersAsync(staff, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task Another_clinics_owner_gets_403_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var other = await Login.OwnerAsync(await Data.Clinic());

        await EveryRouteAnswersAsync(other, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task An_owners_no_context_token_gets_403_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);
        var owner = await Login.AsAsync(phone);
        owner.Auth.Context.ShouldBeNull("two clinics: no context before picking one");

        await EveryRouteAnswersAsync(owner, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task The_super_admin_in_the_template_clinics_context_gets_403_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var inTemplate = await Login.SuperAdminInTemplateAsync();

        await EveryRouteAnswersAsync(inTemplate, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task The_super_admins_no_context_token_gets_403_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var admin = await Login.AsAsync(Login.SuperAdminPhone);
        admin.Auth.Context.ShouldBeNull("platform + template: the login shows the picker");

        await EveryRouteAnswersAsync(admin, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-007")]
    public async Task The_super_admin_in_the_platform_context_is_allowed_on_every_template_route()
    {
        // Control for the refusals above: the same three calls pass
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        await (await admin.PutTemplateAsync(clinic.Id, L())).ShouldBeOkAsync();
        await (await admin.GetAsync(Route(clinic.Id))).ShouldBeOkAsync();
        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    // ---- TPL-008: clinics ----

    [Theory]
    [Trait("Case", "TPL-008")]
    [InlineData(UnknownId)]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task A_missing_clinic_is_notFound_on_every_template_route_and_nothing_is_stored(int clinicId)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var before = await App.TemplateCountAsync();

        await EveryRouteAnswersAsync(admin, clinicId, HttpStatusCode.NotFound, "notFound");

        (await App.TemplateCountAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "TPL-008")]
    [Trait("Tier", "Smoke")]
    public async Task A_deleted_clinic_is_notFound_on_every_template_route_and_nothing_is_written()
    {
        var (clinic, _) = await ClinicWithATemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        await Data.DeleteClinicAsync(clinic);
        var before = (await App.TemplateRowsAsync(clinic.Id)).Select(t => (t.Layout, t.UpdatedAt)).ToList();

        await EveryRouteAnswersAsync(admin, clinic.Id, HttpStatusCode.NotFound, "notFound");

        (await App.TemplateRowsAsync(clinic.Id)).Select(t => (t.Layout, t.UpdatedAt)).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "TPL-008")]
    public async Task The_template_clinic_is_notFound_on_every_template_route_and_never_holds_one()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var templateId = await App.TemplateClinicIdAsync();

        await EveryRouteAnswersAsync(admin, templateId, HttpStatusCode.NotFound, "notFound");

        (await App.TemplateRowsAsync(templateId)).ShouldBeEmpty();
    }

    // ---- TPL-205: the order of the checks ----

    [Theory]
    [Trait("Case", "TPL-205")]
    [InlineData(UnknownId)]
    [InlineData(0)]
    public async Task A_malformed_body_for_a_missing_clinic_is_notFound_on_every_template_route(int clinicId)
    {
        var admin = await Login.SharedSuperAdminAsync();

        await EveryRouteAnswersForAMalformedBodyAsync(admin, clinicId, HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task A_malformed_body_for_a_deleted_clinic_is_notFound_on_every_template_route()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await Data.DeleteClinicAsync(clinic);

        await EveryRouteAnswersForAMalformedBodyAsync(admin, clinic.Id, HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task A_malformed_body_for_the_template_clinic_is_notFound_on_every_template_route()
    {
        var admin = await Login.SharedSuperAdminAsync();

        await EveryRouteAnswersForAMalformedBodyAsync(admin, await App.TemplateClinicIdAsync(), HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task A_malformed_body_with_a_clinic_context_token_is_forbidden_on_every_template_route()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var owner = await Login.OwnerAsync(clinic);

        await EveryRouteAnswersForAMalformedBodyAsync(owner, clinic.Id, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task A_clinic_context_token_is_forbidden_before_a_missing_clinic_is_looked_up_with_any_body()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        await EveryRouteAnswersAsync(owner, UnknownId, HttpStatusCode.Forbidden, "forbidden");
        await EveryRouteAnswersForAMalformedBodyAsync(owner, UnknownId, HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task A_malformed_body_with_no_token_is_unauthorized_on_every_template_route()
    {
        var clinic = await Data.Clinic();

        await EveryRouteAnswersForAMalformedBodyAsync(Anonymous(), clinic.Id, HttpStatusCode.Unauthorized, "unauthorized");
        await EveryRouteAnswersForAMalformedBodyAsync(Anonymous(), UnknownId, HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "TPL-205")]
    public async Task For_an_existing_clinic_a_malformed_body_is_only_a_PUT_problem()
    {
        var (clinic, nothingChanged) = await ClinicWithATemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.PutRawTemplateAsync(clinic.Id, Malformed)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        await nothingChanged();
    }
}
