using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;
using ClinicHub.Application.Features.Access.Roles.Commands.DeleteRole;
using ClinicHub.Application.Features.Access.Roles.Commands.UpdateRole;
using ClinicHub.Application.Features.Access.Roles.Queries.GetRoles;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

public record SaveRoleRequest(string Name, List<string> Permissions);

/// <summary>
/// The super admin manages one clinic's roles (design M1.5 § 6). <see cref="AdminClinicAttribute"/> makes the route's
/// clinic the request's clinic (404 <c>notFound</c> for a missing, deleted or template clinic), so a role id of
/// another clinic is simply not found.
/// </summary>
[Route("api/v1/admin/clinics/{clinicId:int}/roles")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
[AdminClinic]
public class AdminRolesController(ISender sender) : BaseApiController
{
    /// <summary>The Owner first, then by name.</summary>
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> GetAll(CancellationToken cancellationToken) =>
        (await sender.Send(new GetRolesQuery(), cancellationToken)).ToOk();

    /// <summary>No endpoint reads one role: <c>Location</c> points to the clinic's role list.</summary>
    [HttpPost]
    public async Task<ActionResult<RoleDto>> Create(int clinicId, [FromBody] SaveRoleRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateRoleCommand(request.Name, request.Permissions), cancellationToken))
        .ToCreated(nameof(GetAll), _ => new { clinicId });

    [HttpPut("{roleId:int}")]
    public async Task<ActionResult<RoleDto>> Update(int roleId, [FromBody] SaveRoleRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateRoleCommand(roleId, request.Name, request.Permissions), cancellationToken)).ToOk();

    [HttpDelete("{roleId:int}")]
    public async Task<IActionResult> Delete(int roleId, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteRoleCommand(roleId), cancellationToken)).ToNoContent();
}
