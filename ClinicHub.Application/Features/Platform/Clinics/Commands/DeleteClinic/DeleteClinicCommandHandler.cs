using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.DeleteClinic;

internal sealed class DeleteClinicCommandHandler(
    IAppDbContext db,
    IAccessCache accessCache,
    IPostCommitActions postCommit,
    TimeProvider clock) : ICommandHandler<DeleteClinicCommand>
{
    public async Task<Result> Handle(DeleteClinicCommand command, CancellationToken cancellationToken)
    {
        var clinic = await db.Clinics.Manageable().FirstOrDefaultAsync(c => c.Id == command.Id, cancellationToken);
        if (clinic is null)
            return ClinicErrors.NotFound;

        clinic.Delete(clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);
        var clinicId = clinic.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateClinicAsync(clinicId, token));
        return Result.Success();
    }
}
