using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;

internal sealed class RenameClinicCommandHandler(IAppDbContext db) : ICommandHandler<RenameClinicCommand, ClinicDetails>
{
    public async Task<Result<ClinicDetails>> Handle(RenameClinicCommand command, CancellationToken cancellationToken)
    {
        var clinic = await db.Clinics.Manageable().FirstOrDefaultAsync(c => c.Id == command.Id, cancellationToken);
        if (clinic is null)
            return ClinicErrors.NotFound;

        clinic.Name = command.Name.Trim();
        await db.SaveChangesAsync(cancellationToken);
        // Never null here (same transaction), but a null DTO must not become a successful empty result
        return await db.Clinics.AsNoTracking()
            .Where(c => c.Id == clinic.Id)
            .SelectDetails(db)
            .FirstOrDefaultAsync(cancellationToken) is { } details
            ? details
            : ClinicErrors.NotFound;
    }
}
