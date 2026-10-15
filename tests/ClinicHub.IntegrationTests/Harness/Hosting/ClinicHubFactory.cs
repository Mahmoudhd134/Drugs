using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Databases;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The app in memory (the real <c>Program</c>: settings validation, migrations, startup seeder, middleware), in the
/// <c>Testing</c> environment (<c>appsettings.Testing.json</c>: intended OTP limits, Display mode, test keys, a test
/// super admin, no dev seed), on one guarded test database, with its own <see cref="TestClock"/> and its own
/// in-memory caches (each factory is its own service provider).
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

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environment);
        builder.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString);
        foreach (var (key, value) in settings ?? new Dictionary<string, string>())
            builder.UseSetting(key, value);

        builder.ConfigureTestServices(testServices =>
        {
            testServices.RemoveAll<TimeProvider>();
            testServices.AddSingleton<TimeProvider>(Clock);
            // The last word before any connection (Program.cs migrates right after Build): whatever the configuration
            // said, the app's DbContext may only reach a drags_it_ database on the local server
            testServices.ConfigureDbContext<AppDbContext>((_, options) =>
                DatabaseGuard.Ensure(options.Options.Extensions.OfType<RelationalOptionsExtension>().FirstOrDefault()?.ConnectionString));
            services?.Invoke(testServices);
        });
    }
}
