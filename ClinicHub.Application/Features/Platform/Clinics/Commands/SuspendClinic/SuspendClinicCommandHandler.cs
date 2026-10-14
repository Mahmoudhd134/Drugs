using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.SuspendClinic;

internal sealed class SuspendClinicCommandHandler(IAppDbContext db, IAccessCache accessCache, IPostCommitActions postCommit)
    : ICommandHandler<SuspendClinicCommand>
{
    public async Task<Result> Handle(SuspendClinicCommand command, CancellationToken cancellationToken)
    {
        var clinic = await db.Clinics.Manageable().FirstOrDefaultAsync(c => c.Id == command.Id, cancellationToken);
        if (clinic is null)
            return ClinicErrors.NotFound;

        if (clinic.Status != ClinicStatus.Suspended)
        {
            clinic.Status = ClinicStatus.Suspended;
            await db.SaveChangesAsync(cancellationToken);
        }
        // Also when nothing changed: harmless, and it repairs an entry a missed invalidation left stale
        var clinicId = clinic.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateClinicAsync(clinicId, token));
        return Result.Success();
    }
}
