using System.Net;
using System.Text;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.IntegrationTests.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Shouldly;

namespace ClinicHub.IntegrationTests.Errors;

/// <summary>One ProblemDetails shape for every error (tech overview § Errors, architecture § 6).</summary>
[Collection(ErrorsCollection.Name)]
[Trait("Area", "errors")]
public class ProblemShapeTests(AppFixture app) : IntegrationTest(app)
{
    [Theory]
    [InlineData(400, "nameRequired")]
    [InlineData(401, "unauthorized")]
    [InlineData(403, "forbidden")]
    [InlineData(404, "notFound")]
    [InlineData(405, "methodNotAllowed")]
    [InlineData(409, "roleNameTaken")]
    [InlineData(429, "tooManyRequests")]
    [Trait("Case", "ERR-001")]
    [Trait("Case", "ERR-003")]
    public async Task Every_error_status_answers_the_same_problem_shape(int status, string code)
    {
        var (response, path) = await ProduceAsync(status);

        var problem = await response.ShouldBeProblemAsync((HttpStatusCode)status, code);

        ProblemShape.ShouldHaveTheShape(problem.Body, (HttpStatusCode)status, code, path);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ERR-002")]
    public async Task A_validation_error_lists_every_failure_in_order_with_its_field()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var response = await owner.PostAsync("/api/v1/drugs", new { name = "", defaultDosing = new { doseUnit = "bucket" } });

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("nameRequired", "name"), ("invalidDosing", "defaultDosing")]);
        problem.Errors.ShouldAllBe(e => !string.IsNullOrWhiteSpace(e.Description));
        problem.Detail.ShouldBe(problem.Errors[0].Description);
    }

    [Fact]
    [Trait("Case", "ERR-004")]
    public async Task Two_failing_requests_have_different_trace_ids()
    {
        var anonymous = Anonymous();

        var first = await (await anonymous.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        var second = await (await anonymous.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");

        first.TraceId.ShouldNotBeNullOrWhiteSpace();
        second.TraceId.ShouldNotBeNullOrWhiteSpace();
        first.TraceId.ShouldNotBe(second.TraceId);
    }

    [Fact]
    [Trait("Case", "ERR-005")]
    public async Task A_successful_answer_is_plain_data()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic).WithDosing(Dosings.Drops());
        var owner = await Login.OwnerAsync(clinic);

        var response = await owner.GetAsync($"/api/v1/drugs/{drug.Id}");

        await response.ShouldBeOkAsync();
        response.Content.Headers.ContentType!.MediaType.ShouldBe("application/json");
        var body = (await response.ReadNodeAsync()).AsObject();
        body.Select(p => p.Key).ShouldBe(["id", "name", "description", "defaultDosing"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ERR-006")]
    public async Task A_created_answer_has_a_lowercase_location()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var owner = await Login.OwnerAsync(clinic);

        var drugResponse = await owner.PostAsync("/api/v1/drugs", new { name = Unique.Name("Tobradex", "توبرادكس") });
        var protocolResponse = await owner.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(drug.Id));

        await drugResponse.ShouldBeAsync(HttpStatusCode.Created);
        var created = await drugResponse.ReadAsync<DrugDto>();
        drugResponse.Headers.Location.ShouldNotBeNull();
        LocationPath(drugResponse).ShouldBe($"/api/v1/drugs/{created.Id}");
        await protocolResponse.ShouldBeAsync(HttpStatusCode.Created);
        var protocol = await protocolResponse.ReadAsync<ProtocolDto>();
        LocationPath(protocolResponse).ShouldBe($"/api/v1/protocols/{protocol.Id}");
    }

    [Theory]
    [InlineData("none")]
    [InlineData("garbage")]
    [InlineData("expired")]
    [InlineData("other key")]
    [Trait("Case", "ERR-007")]
    public async Task A_missing_or_invalid_token_answers_401_unauthorized_in_the_same_shape(string token)
    {
        var client = token == "none" ? Anonymous() : await Login.OwnerAsync(await Data.Clinic());
        switch (token)
        {
            case "garbage":
                client.AccessToken = "not.a.token";
                break;
            case "expired":
                Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(31));
                break;
            case "other key":
                client.AccessToken = SignedWithAnotherKey(client.AccessToken);
                break;
        }

        var response = await client.GetAsync("/api/v1/drugs");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        ProblemShape.ShouldHaveTheShape(problem.Body, HttpStatusCode.Unauthorized, "unauthorized", "/api/v1/drugs");
    }

    [Fact]
    [Trait("Case", "ERR-008")]
    public async Task Login_refusals_for_a_suspended_clinic_or_a_deactivated_account_name_the_clinic()
    {
        var suspended = await Data.Clinic().Suspended();
        var active = await Data.Clinic();
        var inactive = await Data.Staff(active).Inactive();

        var suspendedLogin = await Login.TryAsync(Anonymous(), suspended.Owner.Phone);
        var inactiveLogin = await Login.TryAsync(Anonymous(), inactive.Phone);

        var first = await suspendedLogin.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        ProblemShape.ShouldHaveTheShape(first.Body, HttpStatusCode.Forbidden, "clinicSuspended", "/api/v1/auth/otp/verify", "clinicNames");
        first.ClinicNames.ShouldBe([suspended.Name]);
        var second = await inactiveLogin.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "staffInactive");
        ProblemShape.ShouldHaveTheShape(second.Body, HttpStatusCode.Forbidden, "staffInactive", "/api/v1/auth/otp/verify", "clinicNames");
        second.ClinicNames.ShouldBe([active.Name]);
    }

    [Fact]
    [Trait("Case", "ERR-008")]
    public async Task Picker_refusals_for_a_suspended_clinic_or_a_deactivated_account_name_the_picked_clinic()
    {
        var phone = Unique.Phone();
        var home = await Data.Clinic().OwnedBy(phone);
        var suspended = await Data.Clinic().OwnedBy(phone);
        var other = await Data.Clinic();
        var inactive = await Data.Staff(other).WithPhone(phone);
        var user = await Login.AsAsync(phone);
        await user.EnterClinicAsync(home.Id);
        await Data.SuspendClinicAsync(suspended);
        await Data.DeactivateStaffAsync(inactive);

        var toSuspended = await user.SwitchContextAsync("clinic", suspended.Id);
        var toInactive = await user.SwitchContextAsync("clinic", other.Id);

        var first = await toSuspended.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        ProblemShape.ShouldHaveTheShape(first.Body, HttpStatusCode.Forbidden, "clinicSuspended", "/api/v1/auth/context", "clinicNames");
        first.ClinicNames.ShouldBe([suspended.Name]);
        var second = await toInactive.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "staffInactive");
        ProblemShape.ShouldHaveTheShape(second.Body, HttpStatusCode.Forbidden, "staffInactive", "/api/v1/auth/context", "clinicNames");
        second.ClinicNames.ShouldBe([other.Name]);
    }

    [Fact]
    [Trait("Case", "ERR-008")]
    public async Task No_access_and_clinic_suspended_inside_a_clinic_have_no_clinic_names()
    {
        var unknownLogin = await Login.TryAsync(Anonymous(), Unique.Phone());
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        await Data.SuspendClinicAsync(clinic);

        var inside = await owner.GetAsync("/api/v1/drugs");

        var noAccess = await unknownLogin.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        ProblemShape.ShouldHaveTheShape(noAccess.Body, HttpStatusCode.Forbidden, "noAccess", "/api/v1/auth/otp/verify");
        var suspended = await inside.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        ProblemShape.ShouldHaveTheShape(suspended.Body, HttpStatusCode.Forbidden, "clinicSuspended", "/api/v1/drugs");
    }

    /// <summary>A response with <paramref name="status"/> from its usual source, and the request path.</summary>
    private async Task<(HttpResponseMessage, string)> ProduceAsync(int status)
    {
        switch (status)
        {
            case 400:
            {
                var owner = await Login.OwnerAsync(await Data.Clinic());
                return (await owner.PostAsync("/api/v1/drugs", new { name = "" }), "/api/v1/drugs");
            }
            case 401:
                return (await Anonymous().GetAsync("/api/v1/drugs"), "/api/v1/drugs");
            case 403:
                return (await (await Login.SuperAdminAsync()).GetAsync("/api/v1/drugs"), "/api/v1/drugs");
            case 404:
            {
                var owner = await Login.OwnerAsync(await Data.Clinic());
                return (await owner.GetAsync("/api/v1/drugs/2147483000"), "/api/v1/drugs/2147483000");
            }
            case 405:
            {
                var owner = await Login.OwnerAsync(await Data.Clinic());
                return (await owner.SendAsync(new HttpRequestMessage(HttpMethod.Patch, "/api/v1/drugs/1")), "/api/v1/drugs/1");
            }
            case 409:
            {
                var clinic = await Data.Clinic();
                var admin = await Login.SuperAdminAsync();
                var path = $"/api/v1/admin/clinics/{clinic.Id}/roles";
                return (await admin.PostAsync(path, new { name = "Doctor", permissions = new[] { "drugs.list" } }), path);
            }
            case 429:
            {
                var browser = Anonymous();
                var phone = Unique.Phone();
                await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();
                return (await browser.RequestOtpAsync(phone), "/api/v1/auth/otp/request");
            }
            default:
                throw new ArgumentOutOfRangeException(nameof(status));
        }
    }

    private static string LocationPath(HttpResponseMessage response) =>
        response.Headers.Location!.IsAbsoluteUri ? response.Headers.Location.AbsolutePath : response.Headers.Location.OriginalString;

    /// <summary>The same claims, signed with a key the app doesn't know.</summary>
    private static string SignedWithAnotherKey(string token)
    {
        var original = new JsonWebToken(token);
        string[] registered = ["iss", "aud", "exp", "nbf", "iat"];
        var claims = original.Claims.Where(c => !registered.Contains(c.Type))
            .GroupBy(c => c.Type).ToDictionary(g => g.Key, g => (object)g.First().Value);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("another-signing-key-that-the-app-does-not-know-1234"));
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = original.Issuer,
            Audience = original.Audiences.First(),
            IssuedAt = original.IssuedAt,
            NotBefore = original.ValidFrom,
            Expires = original.ValidTo,
            Claims = claims,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        });
    }
}
