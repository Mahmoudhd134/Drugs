using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Attachments;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Api.Features.Platform;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Attachments.Files;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

// The test-only routes (docs/design/attachments.md § 8): one controller per context, on the real pipeline. Production has no
// attachment route (ATT-012): AttachmentTestHost adds these to a test app only. [AttachmentUpload] takes a constant, so a
// write has one action per module: M = clinicPaper (with its override), G = general (no config entry).

/// <summary>A clinic's staff, with a permission on every route. Writes need <c>drugs.create</c>, reads <c>drugs.list</c>.</summary>
[Route("api/v1/test/attachments/clinic")]
public class ClinicAttachmentsTestController(ISender sender) : BaseApiController
{
    private const string Write = Permissions.Drugs.Create;
    private const string Read = Permissions.Drugs.List;
    private const string G = AttachmentTestRoutes.General;
    private const string M = AttachmentModules.ClinicPaper;

    [HttpPost($"{M}/{{refId}}"), HasPermission(Write), AttachmentUpload(M)]
    public async Task<ActionResult> UploadM(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(M, refId), file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPost($"{G}/{{refId}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> UploadG(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(G, refId), file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPut($"{M}/{{refId}}/{{id:guid}}"), HasPermission(Write), AttachmentUpload(M)]
    public async Task<ActionResult> ReplaceM(string refId, Guid id, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new ReplaceTestAttachment(new AttachmentOwner(M, refId), id, file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPut($"{G}/{{refId}}/{{id:guid}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> ReplaceG(string refId, Guid id, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new ReplaceTestAttachment(new AttachmentOwner(G, refId), id, file.ToAttachmentUpload()), ct)).ToOk();

    [HttpDelete("{module}/{refId}/{id:guid}"), HasPermission(Write)]
    public async Task<ActionResult> Delete(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new DeleteTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToNoContent();

    [HttpDelete("{module}/{refId}"), HasPermission(Write)]
    public async Task<ActionResult> DeleteAll(string module, string refId, CancellationToken ct) =>
        (await sender.Send(new DeleteAllTestAttachments(new AttachmentOwner(module, refId)), ct)).ToNoContent();

    [HttpGet("{module}/{refId}"), HasPermission(Read)]
    public async Task<ActionResult> List(string module, string refId, CancellationToken ct) =>
        (await sender.Send(new ListTestAttachments(new AttachmentOwner(module, refId)), ct)).ToOk();

    [HttpGet("{module}/{refId}/{id:guid}"), HasPermission(Read)]
    public async Task<ActionResult> Open(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new OpenTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToFile();

    // Failure scenarios (design § 6)

    [HttpPost($"{AttachmentTestRoutes.ScenarioSegment}/{{then}}/{{refId}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> AddThen(AddThen then, string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachmentThen(new AttachmentOwner(G, refId), file.ToAttachmentUpload(), then), ct)).ToOk();

    /// <summary>A command adds a file, a nested command adds another and fails.</summary>
    [HttpPost($"{AttachmentTestRoutes.NestedSegment}/{{refId}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> Nested(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachmentWithFailedNested(new AttachmentOwner(G, refId), file.ToAttachmentUpload()), ct)).ToOk();

    /// <summary>The service called with no command, so with no transaction.</summary>
    [HttpPost($"{AttachmentTestRoutes.DirectSegment}/{{refId}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> Direct(string refId, IFormFile file, [FromServices] IAttachmentService attachments, CancellationToken ct) =>
        (await attachments.AddAsync(new AttachmentOwner(G, refId), file.ToAttachmentUpload(), ct)).ToOk();

    /// <summary>A replace with no command, so with no transaction to hide two saves.</summary>
    [HttpPut($"{AttachmentTestRoutes.DirectSegment}/{{refId}}/{{id:guid}}"), HasPermission(Write), AttachmentUpload(G)]
    public async Task<ActionResult> DirectReplace(string refId, Guid id, IFormFile file, [FromServices] IAttachmentService attachments, CancellationToken ct) =>
        (await attachments.ReplaceAsync(new AttachmentOwner(G, refId), id, file.ToAttachmentUpload(), ct)).ToOk();
}

/// <summary>The super admin acting in the route's clinic: <c>[AdminClinic]</c> is class-level.</summary>
[Route("api/v1/admin/clinics/{clinicId:int}/test-attachments")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
[AdminClinic]
public class AdminClinicAttachmentsTestController(ISender sender) : BaseApiController
{
    private const string G = AttachmentTestRoutes.General;
    private const string M = AttachmentModules.ClinicPaper;

    [HttpPost($"{M}/{{refId}}"), AttachmentUpload(M)]
    public async Task<ActionResult> UploadM(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(M, refId), file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPost($"{G}/{{refId}}"), AttachmentUpload(G)]
    public async Task<ActionResult> UploadG(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(G, refId), file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPut($"{G}/{{refId}}/{{id:guid}}"), AttachmentUpload(G)]
    public async Task<ActionResult> ReplaceG(string refId, Guid id, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new ReplaceTestAttachment(new AttachmentOwner(G, refId), id, file.ToAttachmentUpload()), ct)).ToOk();

    [HttpDelete("{module}/{refId}/{id:guid}")]
    public async Task<ActionResult> Delete(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new DeleteTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToNoContent();

    [HttpGet("{module}/{refId}")]
    public async Task<ActionResult> List(string module, string refId, CancellationToken ct) =>
        (await sender.Send(new ListTestAttachments(new AttachmentOwner(module, refId)), ct)).ToOk();

    [HttpGet("{module}/{refId}/{id:guid}")]
    public async Task<ActionResult> Open(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new OpenTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToFile();
}

/// <summary>
/// The super admin with no clinic. Writes come twice: <c>inside/…</c> opens <c>UseSharedCatalog()</c> in the handler, as a feature's
/// must; <c>outside/…</c> doesn't, as a feature that forgot to.
/// </summary>
[Route("api/v1/test/attachments/platform")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
public class PlatformAttachmentsTestController(ISender sender) : BaseApiController
{
    private const string G = AttachmentTestRoutes.General;
    private const string M = AttachmentModules.ClinicPaper;

    [HttpPost($"inside/{M}/{{refId}}"), AttachmentUpload(M)]
    public async Task<ActionResult> UploadInsideM(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(M, refId), file.ToAttachmentUpload(), SharedCatalog: true), ct)).ToOk();

    [HttpPost($"inside/{G}/{{refId}}"), AttachmentUpload(G)]
    public async Task<ActionResult> UploadInsideG(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(G, refId), file.ToAttachmentUpload(), SharedCatalog: true), ct)).ToOk();

    [HttpPost($"outside/{G}/{{refId}}"), AttachmentUpload(G)]
    public async Task<ActionResult> UploadOutsideG(string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachment(new AttachmentOwner(G, refId), file.ToAttachmentUpload()), ct)).ToOk();

    [HttpPut($"inside/{G}/{{refId}}/{{id:guid}}"), AttachmentUpload(G)]
    public async Task<ActionResult> ReplaceInsideG(string refId, Guid id, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new ReplaceTestAttachment(new AttachmentOwner(G, refId), id, file.ToAttachmentUpload(), SharedCatalog: true), ct)).ToOk();

    [HttpPut($"outside/{G}/{{refId}}/{{id:guid}}"), AttachmentUpload(G)]
    public async Task<ActionResult> ReplaceOutsideG(string refId, Guid id, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new ReplaceTestAttachment(new AttachmentOwner(G, refId), id, file.ToAttachmentUpload()), ct)).ToOk();

    [HttpDelete("inside/{module}/{refId}/{id:guid}")]
    public async Task<ActionResult> DeleteInside(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new DeleteTestAttachment(new AttachmentOwner(module, refId), id, SharedCatalog: true), ct)).ToNoContent();

    [HttpDelete("outside/{module}/{refId}/{id:guid}")]
    public async Task<ActionResult> DeleteOutside(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new DeleteTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToNoContent();

    [HttpDelete("outside/{module}/{refId}")]
    public async Task<ActionResult> DeleteAllOutside(string module, string refId, CancellationToken ct) =>
        (await sender.Send(new DeleteAllTestAttachments(new AttachmentOwner(module, refId)), ct)).ToNoContent();

    [HttpGet("{module}/{refId}")]
    public async Task<ActionResult> List(string module, string refId, CancellationToken ct) =>
        (await sender.Send(new ListTestAttachments(new AttachmentOwner(module, refId)), ct)).ToOk();

    [HttpGet("{module}/{refId}/{id:guid}")]
    public async Task<ActionResult> Open(string module, string refId, Guid id, CancellationToken ct) =>
        (await sender.Send(new OpenTestAttachment(new AttachmentOwner(module, refId), id), ct)).ToFile();

    /// <summary>A command enters a clinic for a block that ends before the cleanup runs (it has no clinic in context then).</summary>
    [HttpPost($"{AttachmentTestRoutes.UseBlockSegment}/{{clinicId:int}}/{{refId}}"), AttachmentUpload(G)]
    public async Task<ActionResult> AddInUseBlock(int clinicId, string refId, IFormFile file, CancellationToken ct) =>
        (await sender.Send(new AddTestAttachmentInUseBlock(clinicId, new AttachmentOwner(G, refId), file.ToAttachmentUpload()), ct)).ToOk();
}
