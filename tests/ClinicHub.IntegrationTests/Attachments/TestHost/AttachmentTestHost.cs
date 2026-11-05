using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Infrastructure.Attachments;
using ClinicHub.Infrastructure.Database;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>
/// Adds the test-only routes to a test app, through the factory's <c>services</c> parameter (docs/design/attachments.md § 8):
/// the controllers of this assembly, their handlers (MediatR scans only the Application assembly) and the failure seams (off by
/// default). Authorization, the filter, model binding, the service, the real provider, the database and the disk are the app's own.
/// </summary>
public static class AttachmentTestHost
{
    public static void Add(IServiceCollection services)
    {
        services.AddMvcCore().AddApplicationPart(typeof(AttachmentTestHost).Assembly);

        services.AddTransient<IRequestHandler<AddTestAttachment, Result<AttachmentDto>>, AddTestAttachmentHandler>();
        services.AddTransient<IRequestHandler<ReplaceTestAttachment, Result<AttachmentDto>>, ReplaceTestAttachmentHandler>();
        services.AddTransient<IRequestHandler<DeleteTestAttachment, Result>, DeleteTestAttachmentHandler>();
        services.AddTransient<IRequestHandler<DeleteAllTestAttachments, Result>, DeleteAllTestAttachmentsHandler>();
        services.AddTransient<IRequestHandler<ListTestAttachments, Result<IReadOnlyList<AttachmentDto>>>, ListTestAttachmentsHandler>();
        services.AddTransient<IRequestHandler<OpenTestAttachment, Result<AttachmentContent>>, OpenTestAttachmentHandler>();
        services.AddTransient<IRequestHandler<AddTestAttachmentThen, Result<AttachmentDto>>, AddTestAttachmentThenHandler>();
        services.AddTransient<IRequestHandler<AddTestAttachmentWithFailedNested, Result<AttachmentDto>>, AddTestAttachmentWithFailedNestedHandler>();
        services.AddTransient<IRequestHandler<AddTestAttachmentInUseBlock, Result<AttachmentDto>>, AddTestAttachmentInUseBlockHandler>();

        services.AddSingleton<AttachmentSeams>();
        services.AddSingleton<AttachmentSaveSeam>();
        services.AddSingleton<AttachmentLookupSeam>();
        services.ConfigureDbContext<AppDbContext>((provider, options) => options.AddInterceptors(
            provider.GetRequiredService<AttachmentSaveSeam>(), provider.GetRequiredService<AttachmentLookupSeam>()));

        services.RemoveAll<IAttachmentFileProvider>();
        services.AddSingleton<IAttachmentFileProvider>(provider => new SeamAttachmentFileProvider(
            new PhysicalAttachmentFileProvider(provider.GetRequiredService<AttachmentSettings>()), provider.GetRequiredService<AttachmentSeams>()));
    }
}

/// <summary>The test routes. Every base has the shape <c>{base}/{module}/{refId}[/{id}]</c>.</summary>
public static class AttachmentTestRoutes
{
    /// <summary>G: a module string with no config entry, so the global list and size apply.</summary>
    public const string General = "general";

    public const string M = AttachmentModules.ClinicPaper;
    public const string G = General;

    public const string ScenarioSegment = "scenario/add-then";
    public const string NestedSegment = "scenario/nested";
    public const string DirectSegment = "scenario/direct";
    public const string UseBlockSegment = "scenario/use-block";

    public const string Clinic = "/api/v1/test/attachments/clinic";
    /// <summary>Reads with no clinic.</summary>
    public const string Platform = "/api/v1/test/attachments/platform";
    /// <summary>Writes inside <c>UseSharedCatalog()</c>.</summary>
    public const string PlatformInside = Platform + "/inside";
    /// <summary>Writes with no clinic and outside <c>UseSharedCatalog()</c>.</summary>
    public const string PlatformOutside = Platform + "/outside";

    public static string Admin(int clinicId) => $"/api/v1/admin/clinics/{clinicId}/test-attachments";

    public static string Of(string routeBase, string module, string refId) => $"{routeBase}/{module}/{refId}";

    public static string Of(string routeBase, string module, string refId, Guid id) => $"{routeBase}/{module}/{refId}/{id}";

    public static string Scenario(AddThen then, string refId) => $"{Clinic}/{ScenarioSegment}/{then}/{refId}";

    public static string Nested(string refId) => $"{Clinic}/{NestedSegment}/{refId}";

    public static string Direct(string refId) => $"{Clinic}/{DirectSegment}/{refId}";

    public static string UseBlock(int clinicId, string refId) => $"{Platform}/{UseBlockSegment}/{clinicId}/{refId}";
}
