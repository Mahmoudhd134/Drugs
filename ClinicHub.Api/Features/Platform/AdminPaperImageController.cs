using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Attachments;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.DeletePaperImage;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.ReplacePaperImage;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.UploadPaperImage;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.GetPaperImageRules;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.ListPaperImages;
using ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.OpenPaperImage;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

/// <summary>
/// The super admin's picture of a clinic's paper (step 4 design § 4): the routes <c>attachmentRequests(base)</c> calls, plus
/// <c>/rules</c>. <see cref="AdminClinicAttribute"/> makes the route's clinic the request's clinic (404 for a missing, deleted or
/// template clinic; a suspended one is managed), so no clinic id reaches the use cases. No clinic route: staff can't reach the picture.
/// </summary>
[Route("api/v1/admin/clinics/{clinicId:int}/prescription-template/paper-image")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
[AdminClinic]
public class AdminPaperImageController(ISender sender) : BaseApiController
{
    [HttpGet("rules")]
    public async Task<ActionResult<AttachmentRulesDto>> Rules(CancellationToken cancellationToken) =>
        (await sender.Send(new GetPaperImageRulesQuery(), cancellationToken)).ToOk();

    /// <summary>Newest first, normally one row.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AttachmentDto>>> List(CancellationToken cancellationToken) =>
        (await sender.Send(new ListPaperImagesQuery(), cancellationToken)).ToOk();

    /// <summary>Adds, or replaces the current one.</summary>
    [HttpPost, AttachmentUpload(AttachmentModules.ClinicPaper)]
    public async Task<ActionResult<AttachmentDto>> Upload(IFormFile file, CancellationToken cancellationToken) =>
        (await sender.Send(new UploadPaperImageCommand(file.ToAttachmentUpload()), cancellationToken)).ToOk();

    /// <summary>Replaces that picture; 404 when it's gone.</summary>
    [HttpPut("{id:guid}"), AttachmentUpload(AttachmentModules.ClinicPaper)]
    public async Task<ActionResult<AttachmentDto>> Replace(Guid id, IFormFile file, CancellationToken cancellationToken) =>
        (await sender.Send(new ReplacePaperImageCommand(id, file.ToAttachmentUpload()), cancellationToken)).ToOk();

    /// <summary>The file: <c>attachment</c> and <c>nosniff</c> through <c>ToFile()</c>.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Open(Guid id, CancellationToken cancellationToken) =>
        (await sender.Send(new OpenPaperImageQuery(id), cancellationToken)).ToFile();

    /// <summary>204. The row is marked; the file stays.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeletePaperImageCommand(id), cancellationToken)).ToNoContent();
}
