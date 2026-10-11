using Drags.Api.Database;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Platform;

/// <summary>
/// TEMPORARY (Phase 1 only, until login exists): every request acts in the first active,
/// non-template clinic (the "Demo clinic" in Development), looked up once per process (restart the
/// API after resetting the DB). In Development only, the optional <c>X-Dev-Clinic-Id</c> header
/// overrides it, for manual isolation checks; an id that is not a clinic returns 400.
/// Phase 2 (Identity) deletes this and fills <see cref="IClinicContext"/> from the token's clinic_id.
/// </summary>
public class TemporaryClinicMiddleware(RequestDelegate next, IWebHostEnvironment environment)
{
    public const string DevClinicHeader = "X-Dev-Clinic-Id";

    private int? _defaultClinicId;

    public async Task InvokeAsync(HttpContext http, ClinicContext clinicContext, AppDbContext db)
    {
        var devHeader = http.Request.Headers[DevClinicHeader].ToString();
        if (environment.IsDevelopment() && devHeader != "")
        {
            if (!int.TryParse(devHeader, out var devClinicId) || !await db.Clinics.AnyAsync(c => c.Id == devClinicId))
            {
                await Results.Problem($"{DevClinicHeader}: no clinic with id '{devHeader}'.",
                    statusCode: StatusCodes.Status400BadRequest).ExecuteAsync(http);
                return;
            }
            clinicContext.ClinicId = devClinicId;
        }
        else
            clinicContext.ClinicId = _defaultClinicId ??= await db.Clinics.AsNoTracking()
                .Where(c => !c.IsTemplate && c.Status == ClinicStatus.Active)
                .OrderBy(c => c.Id)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync();

        await next(http);
    }
}
