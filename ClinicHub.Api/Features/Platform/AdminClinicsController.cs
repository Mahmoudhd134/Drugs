using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Application.Features.Platform.Clinics.Commands.ActivateClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.DeleteClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.SuspendClinic;
using ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinic;
using ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinics;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

public record CreateClinicRequest(string Name, CreateClinicOwner Owner);
public record RenameClinicRequest(string Name);

/// <summary>
/// The super admin's clinic lifecycle (design M1.5 § 6). The template and deleted clinics are not reachable
/// here (404 <c>notFound</c>): the template is edited through its own context.
/// </summary>
[Route("api/v1/admin/clinics")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
public class AdminClinicsController(ISender sender) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ClinicSummary>>> GetAll(string search = "", string status = "",
        int page = 1, int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetClinicsQuery(search, status, page, pageSize), cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ClinicDetails>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetClinicQuery(id), cancellationToken)).ToOk();

    /// <summary>A clinic provisioned from the template, with its owner (all or nothing).</summary>
    [HttpPost]
    public async Task<ActionResult<ClinicDetails>> Create([FromBody] CreateClinicRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateClinicCommand(request.Name, request.Owner), cancellationToken))
        .ToCreated(nameof(GetById), clinic => new { id = clinic.Id });

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ClinicDetails>> Rename(int id, [FromBody] RenameClinicRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new RenameClinicCommand(id, request.Name), cancellationToken)).ToOk();

    [HttpPost("{id:int}/suspend")]
    public async Task<IActionResult> Suspend(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new SuspendClinicCommand(id), cancellationToken)).ToNoContent();

    [HttpPost("{id:int}/activate")]
    public async Task<IActionResult> Activate(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new ActivateClinicCommand(id), cancellationToken)).ToNoContent();

    /// <summary>Soft delete, final for now (no endpoint restores a clinic).</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteClinicCommand(id), cancellationToken)).ToNoContent();
}
