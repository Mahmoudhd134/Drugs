using ClinicHub.Application.Common.Settings;
using ClinicHub.Infrastructure.Identity;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;

namespace ClinicHub.IntegrationTests.Harness.Clients;

/// <summary>
/// Access tokens with chosen times without moving the test clock (JwtBearer checks lifetimes against the test clock, so
/// <c>Clock.Advance</c> is the usual way to age a token): made by the app's own <see cref="TokenService"/> with a clock
/// set to <c>issuedAt</c>, for the same user, session and context as a logged-in client (signed with the Testing key).
/// Useful for two tokens of different ages in one test.
/// </summary>
public sealed class AccessTokens(AppFixture app)
{
    /// <summary>The client's current token issued again at <paramref name="issuedAt"/> (expires 15 min later).</summary>
    public async Task<string> ReissueAsync(ApiClient client, DateTimeOffset issuedAt)
    {
        var token = new JsonWebToken(client.AccessToken);
        var userId = int.Parse(token.GetClaim(AuthClaims.UserId).Value);
        var sessionId = Guid.Parse(token.GetClaim(AuthClaims.SessionId).Value);
        int? staffId = token.TryGetClaim(AuthClaims.StaffId, out var staff) ? int.Parse(staff.Value) : null;

        var user = await app.QueryDbAsync(db => db.Users.AsNoTracking().SingleAsync(u => u.Id == userId));
        var session = await app.QueryDbAsync(db => db.Sessions.AsNoTracking().SingleAsync(s => s.Id == sessionId));
        var settings = app.Factory.Services.GetRequiredService<AuthSettings>();
        return new TokenService(settings, new FixedClock(issuedAt)).CreateAccessToken(user, session, staffId).Token;
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
