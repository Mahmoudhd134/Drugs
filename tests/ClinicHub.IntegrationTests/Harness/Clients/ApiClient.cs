using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Identity.Users.Queries.GetMe;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;

namespace ClinicHub.IntegrationTests.Harness.Clients;

/// <summary>
/// One browser: its own cookie jar (the refresh cookie, <c>Secure</c> and scoped to <c>/api/v1/auth</c>, behaves as in a
/// browser: the base address is https) and the access token in memory, sent as <c>Authorization: Bearer</c> on every
/// request while <see cref="AccessToken"/> is set. The auth calls return the raw response and, on 200, keep the new
/// token and <see cref="Auth"/> (like the SPA). Nothing here asserts unless the name says so.
/// </summary>
public sealed class ApiClient : IDisposable
{
    public static readonly Uri BaseAddress = new("https://localhost");
    private static readonly Uri AuthPath = new(BaseAddress, AuthController.RefreshCookiePath + "/");

    private readonly CookieContainerHandler cookies = new();

    public ApiClient(WebApplicationFactory<Program> factory)
    {
        Http = factory.CreateDefaultClient(BaseAddress, cookies);
    }

    /// <summary>The underlying client, for anything unusual (custom headers, raw content).</summary>
    public HttpClient Http { get; }

    /// <summary>Sent on every request while set; set it to null (or another value) to test missing/garbage tokens.</summary>
    public string AccessToken { get; set; }

    /// <summary>The last successful login, refresh or switch.</summary>
    public AuthResult Auth { get; private set; }

    /// <summary>The phone this client logged in with (E.164 as typed by the helper).</summary>
    public string Phone { get; internal set; }

    public CookieContainer Cookies => cookies.Container;

    /// <summary>The refresh cookie's value as the browser holds it (null when none).</summary>
    public string RefreshCookie => Cookies.GetCookies(AuthPath)[AuthController.RefreshCookie]?.Value;

    // ---- Plain HTTP (relative URLs like "/api/v1/drugs") ----

    public Task<HttpResponseMessage> GetAsync(string url) => SendAsync(new HttpRequestMessage(HttpMethod.Get, url));

    public Task<HttpResponseMessage> PostAsync(string url, object body = null) => SendAsync(JsonRequest(HttpMethod.Post, url, body));

    public Task<HttpResponseMessage> PutAsync(string url, object body) => SendAsync(JsonRequest(HttpMethod.Put, url, body));

    public Task<HttpResponseMessage> DeleteAsync(string url) => SendAsync(new HttpRequestMessage(HttpMethod.Delete, url));

    /// <summary>A body sent exactly as given (malformed JSON, wrong types…).</summary>
    public Task<HttpResponseMessage> SendRawAsync(HttpMethod method, string url, string body, string contentType = "application/json") =>
        SendAsync(new HttpRequestMessage(method, url) { Content = new StringContent(body, Encoding.UTF8, contentType) });

    public Task<HttpResponseMessage> SendAsync(HttpRequestMessage request)
    {
        if (AccessToken is not null && request.Headers.Authorization is null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
        return Http.SendAsync(request);
    }

    private static HttpRequestMessage JsonRequest(HttpMethod method, string url, object body) =>
        new(method, url) { Content = body is null ? null : JsonContent.Create(body, options: Json.Options) };

    // ---- Auth endpoints (raw; a 200 keeps the token) ----

    public Task<HttpResponseMessage> RequestOtpAsync(string phone) => PostAsync("/api/v1/auth/otp/request", new { phone });

    public async Task<HttpResponseMessage> VerifyOtpAsync(string phone, string code) =>
        await KeepAuth(await PostAsync("/api/v1/auth/otp/verify", new { phone, code }));

    public async Task<HttpResponseMessage> RefreshAsync() => await KeepAuth(await PostAsync("/api/v1/auth/refresh"));

    /// <param name="type"><c>clinic</c> or <c>platform</c>.</param>
    public async Task<HttpResponseMessage> SwitchContextAsync(string type, int? clinicId = null) =>
        await KeepAuth(await PostAsync("/api/v1/auth/context", new { type, clinicId }));

    /// <summary>Logs out (the access token is kept, as a stale tab would: it stays valid until it expires).</summary>
    public Task<HttpResponseMessage> LogoutAsync() => PostAsync("/api/v1/auth/logout");

    private async Task<HttpResponseMessage> KeepAuth(HttpResponseMessage response)
    {
        if (response.StatusCode == HttpStatusCode.OK)
        {
            Auth = await response.ReadAsync<AuthResult>();
            AccessToken = Auth.AccessToken;
        }
        return response;
    }

    // ---- Asserting shortcuts ----

    /// <summary>Switches to a clinic (asserts 200).</summary>
    public async Task<AuthResult> EnterClinicAsync(int clinicId)
    {
        await (await SwitchContextAsync("clinic", clinicId)).ShouldBeOkAsync();
        return Auth;
    }

    /// <summary>Switches to the platform context (asserts 200).</summary>
    public async Task<AuthResult> EnterPlatformAsync()
    {
        await (await SwitchContextAsync("platform")).ShouldBeOkAsync();
        return Auth;
    }

    /// <summary><c>GET /me</c> (asserts 200).</summary>
    public async Task<MeDto> MeAsync() => await (await GetAsync("/api/v1/me")).ReadAsync<MeDto>();

    public void Dispose() => Http.Dispose();
}
