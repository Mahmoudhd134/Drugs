using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.Authorization.Queries.GetPermissions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Access;

/// <summary><c>GET /api/v1/permissions</c>: the permission catalog (labels are translated in the SPA).</summary>
[Authorize]
public class PermissionsController(ISender sender) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PermissionDefinition>>> GetAll(CancellationToken cancellationToken) =>
        (await sender.Send(new GetPermissionsQuery(), cancellationToken)).ToOk();
}
