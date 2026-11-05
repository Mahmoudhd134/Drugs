using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.DeletePrescriptionTemplate;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using ClinicHub.Application.Features.Prescriptions.Templates.Queries.GetPrescriptionTemplate;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

/// <summary>
/// The super admin manages one clinic's print template (design prescription-templates D5, § 5).
/// <see cref="AdminClinicAttribute"/> makes the route's clinic the request's clinic (404 <c>notFound</c> for a missing,
/// deleted or template clinic, before the body is read; a suspended one is managed).
/// </summary>
[Route("api/v1/admin/clinics/{clinicId:int}/prescription-template")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
[AdminClinic]
public class AdminPrescriptionTemplateController(ISender sender) : BaseApiController
{
    /// <summary>200 + the template, or 204 when the clinic has none (a null result).</summary>
    [HttpGet]
    public async Task<ActionResult<PrescriptionTemplateDto>> Get(CancellationToken cancellationToken) =>
        (await sender.Send(new GetPrescriptionTemplateQuery(), cancellationToken)).ToOk();

    /// <summary>Creates or replaces. The body is the layout itself, so an error names <c>items[2].name</c>.</summary>
    [HttpPut]
    public async Task<ActionResult<PrescriptionTemplateDto>> Save([FromBody] PrescriptionLayoutDto layout,
        CancellationToken cancellationToken) =>
        (await sender.Send(SavePrescriptionTemplateCommand.From(layout), cancellationToken)).ToOk();

    /// <summary>204, also when there is none.</summary>
    [HttpDelete]
    public async Task<IActionResult> Delete(CancellationToken cancellationToken) =>
        (await sender.Send(new DeletePrescriptionTemplateCommand(), cancellationToken)).ToNoContent();
}
