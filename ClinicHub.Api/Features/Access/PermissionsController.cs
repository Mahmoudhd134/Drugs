using ClinicHub.Api.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Access;

/// <summary><c>GET /api/v1/permissions</c>: the permission catalog (labels are translated in the SPA).</summary>
[Authorize]
public class PermissionsController : BaseApiController
{
    [HttpGet]
    public IReadOnlyList<PermissionDefinition> GetAll() => PermissionCatalog.All;
}
