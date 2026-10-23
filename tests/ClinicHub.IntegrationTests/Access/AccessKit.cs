using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using ClinicHub.Infrastructure.Identity;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>A clinic's rows the catalog routes act on: a drug to read/edit/delete, a protocol, and a drug for protocol bodies.</summary>
public sealed record CatalogTarget(int DrugId, int ProtocolId, int ProtocolDrugId);

/// <summary>
/// The 11 gated catalog endpoints (access tech § API), named <c>"GET /drugs/{id}"</c>… for theories, with the
/// permission each needs and a valid request on a <see cref="CatalogTarget"/>.
/// </summary>
public static class CatalogRoutes
{
    public static readonly IReadOnlyDictionary<string, string> PermissionOf = new Dictionary<string, string>
    {
        ["GET /drugs"] = Permissions.Drugs.List,
        ["GET /drugs/{id}"] = Permissions.Drugs.Details,
        ["GET /drugs/{id}/protocols"] = Permissions.Drugs.Details,
        ["POST /drugs"] = Permissions.Drugs.Create,
        ["PUT /drugs/{id}"] = Permissions.Drugs.Update,
        ["DELETE /drugs/{id}"] = Permissions.Drugs.Delete,
        ["GET /protocols"] = Permissions.Protocols.List,
        ["GET /protocols/{id}"] = Permissions.Protocols.Details,
        ["POST /protocols"] = Permissions.Protocols.Create,
        ["PUT /protocols/{id}"] = Permissions.Protocols.Update,
        ["DELETE /protocols/{id}"] = Permissions.Protocols.Delete,
    };

    /// <summary>Every endpoint, as theory data.</summary>
    public static TheoryData<string> All => new(PermissionOf.Keys);

    /// <summary>A drug, and a protocol with another drug, in the clinic.</summary>
    public static async Task<CatalogTarget> TargetAsync(TestData data, int clinicId)
    {
        var drug = await data.Drug(clinicId);
        var protocolDrug = await data.Drug(clinicId);
        var protocol = await data.Protocol(clinicId).With(protocolDrug);
        return new CatalogTarget(drug.Id, protocol.Id, protocolDrug.Id);
    }

    public static Task<CatalogTarget> TargetAsync(TestData data, ClinicHandle clinic) => TargetAsync(data, clinic.Id);

    /// <summary>A valid request to <paramref name="endpoint"/> on <paramref name="target"/> (unique names for writes).</summary>
    public static Task<HttpResponseMessage> CallAsync(ApiClient client, string endpoint, CatalogTarget target) => endpoint switch
    {
        "GET /drugs" => client.GetAsync("/api/v1/drugs"),
        "GET /drugs/{id}" => client.GetAsync($"/api/v1/drugs/{target.DrugId}"),
        "GET /drugs/{id}/protocols" => client.GetAsync($"/api/v1/drugs/{target.DrugId}/protocols"),
        "POST /drugs" => client.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = Unique.Name("Drug", "دواء") }),
        "PUT /drugs/{id}" => client.PutAsync($"/api/v1/drugs/{target.DrugId}", new { categoryId = CategoryIds.Eye, name = Unique.Name("Drug", "دواء") }),
        "DELETE /drugs/{id}" => client.DeleteAsync($"/api/v1/drugs/{target.DrugId}"),
        "GET /protocols" => client.GetAsync("/api/v1/protocols"),
        "GET /protocols/{id}" => client.GetAsync($"/api/v1/protocols/{target.ProtocolId}"),
        "POST /protocols" => client.PostAsync("/api/v1/protocols", ProtocolBody(target.ProtocolDrugId)),
        "PUT /protocols/{id}" => client.PutAsync($"/api/v1/protocols/{target.ProtocolId}", ProtocolBody(target.ProtocolDrugId)),
        "DELETE /protocols/{id}" => client.DeleteAsync($"/api/v1/protocols/{target.ProtocolId}"),
        _ => throw new ArgumentOutOfRangeException(nameof(endpoint), endpoint, null),
    };

    public static object ProtocolBody(params int[] drugIds) =>
        new { name = Unique.Name("Protocol", "بروتوكول"), items = drugIds.Select(id => new { drugId = id }).ToArray() };
}

/// <summary>Access tokens forged with the Testing signing key (only possible with the key: the "mismatching ids" cases).</summary>
public static class ForgedTokens
{
    /// <summary>A clinic-context token for exactly these ids (the session id of <paramref name="from"/>, or a new one).</summary>
    public static string Clinic(AppFixture app, int userId, int clinicId, int? staffId, ApiClient from = null)
    {
        var sessionId = from?.AccessToken is { } token
            ? Guid.Parse(new JsonWebToken(token).GetClaim(AuthClaims.SessionId).Value)
            : Guid.NewGuid();
        var settings = app.Factory.Services.GetRequiredService<AuthSettings>();
        return new TokenService(settings, app.Clock).CreateAccessToken(
            new User { Id = userId },
            new Session { Id = sessionId, ContextType = ContextTypes.Clinic, ClinicId = clinicId },
            staffId).Token;
    }
}

/// <summary>
/// Proofs that the access cache holds an answer (a change made by hand, without the app's invalidation, is not seen),
/// so a test that then expects a change to apply at once fails when the app forgets to invalidate
/// (<c>SelfTests/AccessCacheTests</c>). Each proof puts the data back afterwards.
/// </summary>
public static class CacheProofs
{
    /// <summary>The caller's staff entry is cached: the clinic suspended by hand is not seen by <paramref name="url"/>.</summary>
    public static async Task StaffEntryCachedAsync(AppFixture app, ApiClient client, int clinicId, string url = "/api/v1/drugs")
    {
        (await client.GetAsync(url)).IsSuccessStatusCode.ShouldBeTrue();
        await SetClinicStatusAsync(app, clinicId, ClinicStatus.Suspended);
        try
        {
            var response = await client.GetAsync(url);
            response.IsSuccessStatusCode.ShouldBeTrue("the staff entry should be cached: " + await response.Content.ReadAsStringAsync());
        }
        finally
        {
            await SetClinicStatusAsync(app, clinicId, ClinicStatus.Active);
        }
    }

    /// <summary>The role's entry is cached: its permission rows removed by hand are not seen by <paramref name="url"/>.</summary>
    public static async Task RoleEntryCachedAsync(AppFixture app, ApiClient client, int roleId, string url = "/api/v1/drugs")
    {
        (await client.GetAsync(url)).IsSuccessStatusCode.ShouldBeTrue();
        var keys = await app.QueryDbAsync(db =>
            db.Set<RolePermission>().Where(p => p.RoleId == roleId).Select(p => p.Permission).ToListAsync());
        keys.ShouldNotBeEmpty();
        await app.OutsideTheApp.ExecuteAsync("""DELETE FROM "RolePermissions" WHERE "RoleId" = @p0""", roleId);
        try
        {
            var response = await client.GetAsync(url);
            response.IsSuccessStatusCode.ShouldBeTrue("the role entry should be cached: " + await response.Content.ReadAsStringAsync());
        }
        finally
        {
            foreach (var key in keys)
                await app.OutsideTheApp.ExecuteAsync(
                    """INSERT INTO "RolePermissions" ("RoleId", "Permission") VALUES (@p0, @p1)""", roleId, key);
        }
    }

    private static Task SetClinicStatusAsync(AppFixture app, int clinicId, string status) =>
        app.OutsideTheApp.ExecuteAsync("""UPDATE "Clinics" SET "Status" = @p0 WHERE "Id" = @p1""", status, clinicId);
}

/// <summary>Assertion shortcuts of this track.</summary>
public static class AccessAssertions
{
    /// <summary>A 2xx (200, 201 or 204).</summary>
    public static async Task ShouldSucceedAsync(this HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(
            $"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri?.PathAndQuery} answered {(int)response.StatusCode}: {body}");
    }
}
