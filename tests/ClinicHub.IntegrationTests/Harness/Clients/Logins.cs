using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Domain.Identity;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Harness.Clients;

/// <summary>
/// Logged-in clients through the real flow (design D3): <c>POST /auth/otp/request</c> → <c>devCode</c> →
/// <c>POST /auth/otp/verify</c> → context (<c>POST /auth/context</c> when the user has several). Each call is a new
/// browser (own cookie jar): calling it twice for one phone gives two sessions of the same user.
/// <para>
/// The Testing settings use the intended OTP limits (60 s between codes, 5 per hour), so a helper login first deletes
/// the phone's earlier codes: logins in a test never hit the limits. A test that checks the limits requests codes
/// itself (<see cref="ApiClient.RequestOtpAsync"/>) and must not log the same phone in through these helpers meanwhile.
/// </para>
/// <para>
/// By default on the collection's app; <see cref="On"/> gives the same helpers on a variant app (a "restarted" API).
/// </para>
/// </summary>
public sealed class Logins(AppFixture app, ClinicHubFactory factory = null)
{
    private ClinicHubFactory Factory => factory ?? app.Factory;

    /// <summary>The same helpers on <paramref name="variant"/> (<see cref="AppFixture.CreateVariant"/>), e.g. <c>Login.On(variant).SuperAdminAsync()</c>.</summary>
    public Logins On(ClinicHubFactory variant) => new(app, variant);

    /// <summary>The first super admin phone of this app's settings (<c>Platform:SuperAdminPhones</c>), E.164.</summary>
    public string SuperAdminPhone =>
        Factory.Services.GetRequiredService<IPhoneNormalizer>().Normalize(
            Factory.Services.GetRequiredService<PlatformSettings>().SuperAdminPhones[0],
            Factory.Services.GetRequiredService<PlatformSettings>().DefaultRegion);

    /// <summary>A code for <paramref name="phone"/> (its earlier codes deleted first): the <c>devCode</c> of a 200 request.</summary>
    public async Task<string> CodeAsync(ApiClient client, string phone)
    {
        await ClearCodesAsync(phone);
        var response = await (await client.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>();
        response.DevCode.ShouldNotBeNullOrEmpty("Display mode returns the code");
        return response.DevCode;
    }

    /// <summary>The verify response for a fresh code (raw: for the refusals, 403 <c>noAccess</c>, <c>staffInactive</c>…).</summary>
    public async Task<HttpResponseMessage> TryAsync(ApiClient client, string phone)
    {
        client.Phone = phone;
        return await client.VerifyOtpAsync(phone, await CodeAsync(client, phone));
    }

    /// <summary>A new browser logged in as <paramref name="phone"/> (asserts 200); its context is set only when the user has one place.</summary>
    public async Task<ApiClient> AsAsync(string phone)
    {
        var client = new ApiClient(Factory);
        await (await TryAsync(client, phone)).ShouldBeOkAsync();
        return client;
    }

    /// <summary>The test super admin in the platform context (the admin endpoints).</summary>
    public async Task<ApiClient> SuperAdminAsync()
    {
        var client = await AsAsync(SuperAdminPhone);
        await client.EnterPlatformAsync();
        return client;
    }

    /// <summary>The test super admin in the template clinic (editing the default catalog).</summary>
    public async Task<ApiClient> SuperAdminInTemplateAsync()
    {
        var client = await AsAsync(SuperAdminPhone);
        await client.EnterClinicAsync(await app.TemplateClinicIdAsync());
        return client;
    }

    /// <summary>A staff member in their clinic's context (switching when the user has several places).</summary>
    public async Task<ApiClient> StaffAsync(StaffHandle staff)
    {
        var client = await AsAsync(staff.Phone);
        if (client.Auth.Context?.ClinicId != staff.ClinicId)
            await client.EnterClinicAsync(staff.ClinicId);
        return client;
    }

    /// <summary>The clinic's owner (made by the clinic builder) in the clinic.</summary>
    public Task<ApiClient> OwnerAsync(ClinicHandle clinic) => StaffAsync(clinic.Owner);

    /// <summary>A new staff member of <paramref name="clinic"/> with an existing role (e.g. <c>"Assistant"</c>), logged in there.</summary>
    public async Task<ApiClient> WithRoleAsync(ClinicHandle clinic, string roleName) =>
        await StaffAsync(await app.Data.Staff(clinic).WithRole(roleName));

    /// <summary>A new staff member of <paramref name="clinic"/> with a new custom role holding exactly these permissions.</summary>
    public async Task<ApiClient> WithPermissionsAsync(ClinicHandle clinic, params string[] permissions)
    {
        var role = await app.Data.Role(clinic).WithPermissions(permissions);
        return await StaffAsync(await app.Data.Staff(clinic).WithRoles(role.Id));
    }

    /// <summary>
    /// Fast path (opt-in): one session kept for the whole test class under <paramref name="key"/>, never shared with
    /// another class. Only for tests that don't change that session (no logout, switch or refresh on it). Get it
    /// before moving the clock (its token is dated by the clock, and the clock goes back to the real time between
    /// tests): called after <c>Clock.Advance</c>, it throws.
    /// </summary>
    public Task<ApiClient> SharedAsync(string key, Func<Task<ApiClient>> login)
    {
        if (app.Clock.Offset != TimeSpan.Zero)
            throw new InvalidOperationException(
                "Get the shared session before Clock.Advance: a token dated in this test's future is refused in the next test.");
        return app.PerClassAsync($"login:{key}", login);
    }

    /// <summary>The super admin (platform context), one session per test class.</summary>
    public Task<ApiClient> SharedSuperAdminAsync() => SharedAsync("superadmin", SuperAdminAsync);

    /// <summary>Deletes the earlier OTP codes of <paramref name="phone"/> (what the helpers do before each login).</summary>
    public async Task ClearCodesAsync(string phone)
    {
        var services = Factory.Services;
        var normalized = services.GetRequiredService<IPhoneNormalizer>()
            .Normalize(phone, services.GetRequiredService<PlatformSettings>().DefaultRegion);
        if (normalized is null)
            return;
        await app.QueryDbAsync(db => db.Set<OtpCode>().Where(c => c.Phone == normalized).ExecuteDeleteAsync());
    }
}

