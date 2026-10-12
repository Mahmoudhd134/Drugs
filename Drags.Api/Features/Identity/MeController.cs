using Drags.Api.Controllers;
using Drags.Api.Database;
using Drags.Api.Features.Access;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Identity;

/// <summary>
/// <c>GET /api/v1/me</c>: the caller's user, context, staff and permissions (never in the token: the
/// SPA reads them here).
/// </summary>
[Authorize]
public class MeController(AppDbContext db, SessionService sessions, ICurrentUser currentUser,
    IPermissionService permissions) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<MeDto>> Get(CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken);
        if (user is null)
            return Unauthorized();

        var contexts = await sessions.GetContextsAsync(user, cancellationToken);
        var context = currentUser.IsClinic ? contexts.FirstOrDefault(c => c.Matches(ContextTypes.Clinic, currentUser.ClinicId))
            : currentUser.IsPlatform ? contexts.FirstOrDefault(c => c.Type == ContextTypes.Platform)
            : null;

        // The token's clinic is the request's clinic, so the normal clinic filter applies
        var staff = context is not null && currentUser.StaffId is { } staffId
            ? await db.Staff.AsNoTracking()
                .Where(s => s.Id == staffId && s.UserId == user.Id)
                .Select(s => new MeStaffDto(s.Id, s.FullName))
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        // Expanded keys in a clinic context (empty without access); none on the platform yet
        var permissionKeys = context is { Type: ContextTypes.Clinic }
            ? (await permissions.GetAsync(cancellationToken)).ToList()
            : [];
        return new MeDto(new MeUserDto(user.Id, user.Phone, user.IsSuperAdmin), context, staff, permissionKeys);
    }
}
