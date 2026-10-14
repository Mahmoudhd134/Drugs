using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinic;

internal sealed class GetClinicQueryHandler(IAppDbContext db) : IQueryHandler<GetClinicQuery, ClinicDetails>
{
    public async Task<Result<ClinicDetails>> Handle(GetClinicQuery query, CancellationToken cancellationToken) =>
        await db.Clinics.AsNoTracking().Manageable()
            .Where(c => c.Id == query.Id)
            .SelectDetails(db)
            .FirstOrDefaultAsync(cancellationToken) is { } clinic
            ? clinic
            : ClinicErrors.NotFound;
}
