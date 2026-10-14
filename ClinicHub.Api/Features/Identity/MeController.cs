using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Application.Features.Identity.Queries.GetMe;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Identity;

/// <summary>
/// <c>GET /api/v1/me</c>: the caller's user, context, staff and permissions (never in the token: the
/// SPA reads them here).
/// </summary>
[Authorize]
public class MeController(ISender sender) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<MeDto>> Get(CancellationToken cancellationToken) =>
        (await sender.Send(new GetMeQuery(), cancellationToken)).ToOk();
}
