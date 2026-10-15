using System.Net;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Domain.Identity;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.Net.Http.Headers;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// Small helpers of the Auth tests (local to this folder): the refresh cookie as the response sets it, a browser
/// holding a chosen cookie value (an old, rotated one; another session's), a token's claims, a wrong code.
/// </summary>
internal static class AuthKit
{
    private static readonly Uri AuthUri = new(ApiClient.BaseAddress, AuthController.RefreshCookiePath + "/");

    /// <summary>The response's <c>Set-Cookie</c> for the refresh cookie (null when it sets none).</summary>
    public static SetCookieHeaderValue RefreshSetCookie(this HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.Select(v => SetCookieHeaderValue.Parse(v)).SingleOrDefault(c => c.Name.Value == AuthController.RefreshCookie)
            : null;

    /// <summary>Asserts the response sets a new refresh cookie value; returns the header.</summary>
    public static SetCookieHeaderValue ShouldSetRefreshCookie(this HttpResponseMessage response)
    {
        var cookie = response.RefreshSetCookie();
        cookie.ShouldNotBeNull("expected a Set-Cookie for the refresh cookie");
        cookie.Value.Value.ShouldNotBeNullOrEmpty();
        return cookie;
    }

    /// <summary>Asserts the response clears the refresh cookie (empty value, expired, same path).</summary>
    public static void ShouldClearRefreshCookie(this HttpResponseMessage response)
    {
        var cookie = response.RefreshSetCookie();
        cookie.ShouldNotBeNull("expected the refresh cookie to be cleared");
        cookie.Value.Value.ShouldBeEmpty();
        cookie.Expires.ShouldNotBeNull();
        cookie.Expires.Value.ShouldBeLessThan(DateTimeOffset.UtcNow);
        cookie.Path.Value.ShouldBe(AuthController.RefreshCookiePath);
    }

    /// <summary>Asserts the response neither sets nor clears the refresh cookie (the browser keeps its cookie).</summary>
    public static void ShouldKeepRefreshCookie(this HttpResponseMessage response) =>
        response.RefreshSetCookie().ShouldBeNull("the refresh cookie must not be touched");

    /// <summary>Puts <paramref name="value"/> in the browser's jar as the refresh cookie (replacing any).</summary>
    public static ApiClient WithRefreshCookie(this ApiClient client, string value)
    {
        client.Cookies.Add(AuthUri, new Cookie(AuthController.RefreshCookie, value, AuthController.RefreshCookiePath)
        {
            Secure = true,
            HttpOnly = true,
        });
        return client;
    }

    /// <summary>Removes the refresh cookie from the browser's jar.</summary>
    public static ApiClient WithoutRefreshCookie(this ApiClient client)
    {
        var cookie = client.Cookies.GetCookies(AuthUri)[AuthController.RefreshCookie];
        if (cookie is not null)
            cookie.Expired = true;
        return client;
    }

    /// <summary>A new browser on <paramref name="factory"/> holding this refresh cookie (and, optionally, an access token).</summary>
    public static ApiClient Browser(ClinicHubFactory factory, string refreshCookie, string accessToken = null)
    {
        var client = new ApiClient(factory) { AccessToken = accessToken };
        return refreshCookie is null ? client : client.WithRefreshCookie(refreshCookie);
    }

    /// <summary>The access token's claims (read without validation).</summary>
    public static JsonWebToken Claims(string accessToken) => new(accessToken);

    public static bool Has(this JsonWebToken token, string claim) => token.TryGetClaim(claim, out _);

    public static string Claim(this JsonWebToken token, string claim) =>
        token.TryGetClaim(claim, out var value) ? value.Value : throw new ShouldAssertException($"no '{claim}' claim");

    /// <summary>A 6-digit code that is not <paramref name="code"/>.</summary>
    public static string WrongCode(string code) => code == "123456" ? "654321" : "123456";

    /// <summary>The session row of an access token (<c>sid</c>).</summary>
    public static Task<Session> SessionOfAsync(this AppFixture app, string accessToken)
    {
        var id = Guid.Parse(Claims(accessToken).Claim("sid"));
        return app.QueryDbAsync(db => db.Sessions.AsNoTracking().SingleAsync(s => s.Id == id));
    }

    /// <summary>The phone's latest OTP code row (null when none).</summary>
    public static Task<OtpCode> LatestCodeAsync(this AppFixture app, string e164) =>
        app.QueryDbAsync(db => db.OtpCodes.AsNoTracking().Where(c => c.Phone == e164)
            .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id).FirstOrDefaultAsync());
}
