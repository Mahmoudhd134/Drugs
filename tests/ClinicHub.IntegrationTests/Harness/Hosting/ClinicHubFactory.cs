using System.Data.Common;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Databases;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;

namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The app in memory (the real <c>Program</c>: settings validation, migrations, startup seeder, middleware), in the
/// <c>Testing</c> environment (<c>appsettings.Testing.json</c>: intended OTP limits, Display mode, test keys, a test
/// super admin, no dev seed), on one guarded test database, with its own <see cref="TestClock"/> and its own
/// in-memory caches (each factory is its own service provider).
/// <para>
/// Test substitutions (nothing else differs from production): <see cref="TimeProvider"/> is the <see cref="Clock"/>, and
/// JwtBearer checks token lifetimes against it (<see cref="LifetimeOnTheClock"/>: same rule and 30 s skew, only the
/// clock differs).
/// </para>
/// </summary>
/// <param name="settings">Config overrides (<c>"Otp:Mode" = "Sms"</c>…), applied over the Testing settings.</param>
/// <param name="services">Service overrides, after the app's (e.g. a throwing <c>IOtpSender</c>).</param>
public class ClinicHubFactory(
    string connectionString,
    IReadOnlyDictionary<string, string> settings = null,
    Action<IServiceCollection> services = null) : WebApplicationFactory<Program>
{
    public const string Environment = "Testing";

    public TestClock Clock { get; } = new();
    public string ConnectionString { get; } = DatabaseGuard.Ensure(connectionString);

    /// <summary>Boots the app now (migrations and seeder included); throws what startup throws.</summary>
    public void Start() => _ = Server;

    /// <summary>Empties the in-memory access cache (HybridCache's only level in tests).</summary>
    public void ClearMemoryCache() => (Services.GetRequiredService<IMemoryCache>() as MemoryCache)?.Clear();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environment);
        builder.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString);
        foreach (var (key, value) in settings ?? new Dictionary<string, string>())
            builder.UseSetting(key, value);

        builder.ConfigureTestServices(testServices =>
        {
            // The caller's overrides first: the clock and the guard below always have the last word
            services?.Invoke(testServices);

            testServices.RemoveAll<TimeProvider>();
            testServices.AddSingleton<TimeProvider>(Clock);
            testServices.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme,
                options => options.TokenValidationParameters.LifetimeValidator = LifetimeOnTheClock);

            // Before any connection (Program.cs migrates right after Build): whatever the configuration or an override
            // said, the app's DbContext may only reach a drags_it_ database on the local server. Checked when the
            // options are built and again on every connection the context opens (EF's own "create the database"
            // connection to postgres included)
            testServices.ConfigureDbContext<AppDbContext>((_, options) =>
            {
                DatabaseGuard.Ensure(options.Options.Extensions.OfType<RelationalOptionsExtension>().FirstOrDefault()?.ConnectionString);
                options.AddInterceptors(GuardInterceptor.Instance);
            });
        });
    }

    /// <summary>
    /// IdentityModel's own lifetime rule (<c>ValidatorUtilities.ValidateLifetime</c>: an expiry is required,
    /// <c>nbf ≤ exp</c>, <c>nbf ≤ now + skew</c>, <c>exp ≥ now − skew</c>) with <see cref="Clock"/> as "now" instead of
    /// the real time (the public <c>TokenValidationParameters</c> has no clock to set).
    /// </summary>
    private bool LifetimeOnTheClock(DateTime? notBefore, DateTime? expires, SecurityToken token, TokenValidationParameters parameters)
    {
        var now = Clock.GetUtcNow().UtcDateTime;
        if (expires is null && parameters.RequireExpirationTime)
            return false;
        if (notBefore > expires)
            return false;
        if (notBefore > now + parameters.ClockSkew)
            return false;
        return !(expires < now - parameters.ClockSkew);
    }

    /// <summary>Refuses to open a connection to anything but a test database on the local server.</summary>
    private sealed class GuardInterceptor : DbConnectionInterceptor
    {
        public static readonly GuardInterceptor Instance = new();

        public override InterceptionResult ConnectionOpening(DbConnection connection, ConnectionEventData eventData,
            InterceptionResult result)
        {
            DatabaseGuard.Ensure(connection.ConnectionString);
            return result;
        }

        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default)
        {
            DatabaseGuard.Ensure(connection.ConnectionString);
            return ValueTask.FromResult(result);
        }
    }
}
