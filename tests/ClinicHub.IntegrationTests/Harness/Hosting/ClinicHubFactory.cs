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
using Microsoft.Extensions.Caching.Hybrid;
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
/// clock differs). The access cache (HybridCache) keeps its own clock (<see cref="CacheClock"/>): it dates its
/// entries and tag invalidations, and with the frozen app clock an answer cached right after a login (same instant as
/// the login's invalidations) would never be kept, unlike production.
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
    /// <summary>The access cache's clock: real time plus <see cref="Clock"/>'s advance, never backwards.</summary>
    public CacheClock CacheClock => cacheClock ??= new CacheClock(Clock);
    private CacheClock cacheClock;
    public string ConnectionString { get; } = DatabaseGuard.Ensure(connectionString);

    /// <summary>Boots the app now (migrations and seeder included); throws what startup throws.</summary>
    public void Start() => _ = Server;

    /// <summary>Empties the in-memory access cache (HybridCache's only level in tests): between test classes.</summary>
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
            testServices.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                if (options.TokenValidationParameters.LifetimeValidator is not null)
                    throw new InvalidOperationException(
                        "The app now sets its own JwtBearer LifetimeValidator: update the test mirror (ClinicHubFactory.LifetimeOnTheClock).");
                options.TokenValidationParameters.LifetimeValidator = LifetimeOnTheClock;
            });

            // HybridCache reads TimeProvider from the services it is built with: the same cache type, built with
            // CacheClock instead of the frozen app clock (and the app's IMemoryCache, options, serializers)
            var hybrid = testServices.LastOrDefault(d => d.ServiceType == typeof(HybridCache));
            if (hybrid?.ImplementationType is not { } cacheType)
                throw new InvalidOperationException(
                    "HybridCache is no longer registered by type (AddHybridCache): update ClinicHubFactory's cache clock.");
            testServices.Remove(hybrid);
            testServices.AddSingleton(provider =>
                (HybridCache)ActivatorUtilities.CreateInstance(new WithClock(provider, CacheClock), cacheType));

            // Before any connection (Program.cs migrates right after Build): whatever the configuration or an override
            // said, the app's DbContext may only reach a drags_it_ database on the local server. Checked when the
            // options are built and again on every connection the context opens (EF's own "create the database"
            // connection to postgres included)
            testServices.ConfigureDbContext<AppDbContext>((_, options) =>
            {
                DatabaseGuard.Ensure(options.Options.Extensions.OfType<RelationalOptionsExtension>().FirstOrDefault()?.ConnectionString);
                options.AddInterceptors(GuardInterceptor.Instance);
            });
            // An override may also replace the built options altogether (the configuration above then never runs):
            // the options the context finally gets are checked once more when resolved, before Program migrates
            var built = testServices.LastOrDefault(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>))
                         ?? throw new InvalidOperationException("No DbContextOptions<AppDbContext> registered.");
            testServices.Remove(built);
            testServices.Add(ServiceDescriptor.Describe(typeof(DbContextOptions<AppDbContext>), provider =>
            {
                var options = (DbContextOptions<AppDbContext>)(built.ImplementationFactory?.Invoke(provider)
                    ?? built.ImplementationInstance
                    ?? ActivatorUtilities.CreateInstance(provider, built.ImplementationType));
                DatabaseGuard.Ensure(options.Extensions.OfType<RelationalOptionsExtension>().FirstOrDefault()?.ConnectionString);
                return options;
            }, built.Lifetime));
        });
    }

    /// <summary>
    /// IdentityModel's own lifetime rule (<c>ValidatorUtilities.ValidateLifetime</c>: an expiry is required,
    /// <c>nbf ≤ exp</c>, <c>nbf ≤ now + skew</c>, <c>exp ≥ now − skew</c>) with <see cref="Clock"/> as "now" instead of
    /// the real time (the public <c>TokenValidationParameters</c> has no clock to set).
    /// </summary>
    private bool LifetimeOnTheClock(DateTime? notBefore, DateTime? expires, SecurityToken token, TokenValidationParameters parameters)
    {
        // IdentityModel calls a LifetimeValidator whatever ValidateLifetime says: the app's switch stays in force
        if (!parameters.ValidateLifetime)
            return true;
        var now = Clock.GetUtcNow().UtcDateTime;
        if (expires is null && parameters.RequireExpirationTime)
            return false;
        if (notBefore > expires)
            return false;
        if (notBefore > now + parameters.ClockSkew)
            return false;
        return !(expires < now - parameters.ClockSkew);
    }

    /// <summary>The app's services, but <see cref="TimeProvider"/> is the cache clock (what HybridCache is built from).</summary>
    private sealed class WithClock(IServiceProvider inner, TimeProvider clock) : IKeyedServiceProvider
    {
        public object GetService(Type serviceType) =>
            serviceType == typeof(TimeProvider) ? clock
            : serviceType == typeof(IServiceProvider) ? this
            : inner.GetService(serviceType);

        public object GetKeyedService(Type serviceType, object serviceKey) =>
            ((IKeyedServiceProvider)inner).GetKeyedService(serviceType, serviceKey);

        public object GetRequiredKeyedService(Type serviceType, object serviceKey) =>
            ((IKeyedServiceProvider)inner).GetRequiredKeyedService(serviceType, serviceKey);
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
