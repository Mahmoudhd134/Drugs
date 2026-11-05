using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Queries.GetPrescriptionTemplate;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Prescriptions;

/// <summary>
/// The clinic reads its own print template to print a prescription (design prescription-templates § 5). The route takes no
/// clinic id: the token's clinic decides, through the clinic query filter. Only the super admin writes templates (D5).
/// </summary>
[Route("api/v1/prescription-template")]
[Authorize(Policy = AuthPolicies.ClinicContext)]
public class PrescriptionTemplateController(ISender sender) : BaseApiController
{
    /// <summary>200 + the template, or 204 when the clinic has none (a null result).</summary>
    [HttpGet]
    [HasPermission(Permissions.Prescriptions.Create)]
    public async Task<ActionResult<PrescriptionTemplateDto>> Get(CancellationToken cancellationToken) =>
        (await sender.Send(new GetPrescriptionTemplateQuery(), cancellationToken)).ToOk();
}
