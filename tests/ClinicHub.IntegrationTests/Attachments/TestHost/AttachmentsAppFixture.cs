using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>
/// A collection's app with the test-only attachment routes (<see cref="AttachmentTestHost"/>), its failure seams and its logs.
/// <see cref="AppFixture.CreateVariant"/> stays the plain app, with no test part; <see cref="CreateHostVariant"/> has the routes.
/// </summary>
public sealed class AttachmentsAppFixture : AppFixture
{
    /// <summary>What this app logged, from the Testing settings' levels on (warnings and up).</summary>
    public CapturedLogs Logs { get; } = new();

    public AttachmentSeams Seams => Factory.Services.GetRequiredService<AttachmentSeams>();

    /// <summary>This app's attachments folder. Respawn doesn't reset it: compare a folder before and after.</summary>
    public AttachmentDisk Disk => new(Factory.AttachmentRoot);

    protected override ClinicHubFactory CreateFactory(string connectionString) =>
        new(connectionString, services: services =>
        {
            AttachmentTestHost.Add(services);
            Logs.Register(services);
        });

    /// <summary>Another app on this database, with the test routes and seams of its own, its own folder unless <paramref name="settings"/> sets one.</summary>
    public ClinicHubFactory CreateHostVariant(IReadOnlyDictionary<string, string> settings = null, Action<IServiceCollection> services = null) =>
        CreateVariant(settings, all =>
        {
            AttachmentTestHost.Add(all);
            services?.Invoke(all);
        });
}
