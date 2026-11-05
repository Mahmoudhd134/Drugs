using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Queries.GetPrescriptionTemplate;

/// <summary>The clinic's template (the query filter picks the clinic), or a null success when it has none (MVC: 204).</summary>
internal sealed class GetPrescriptionTemplateQueryHandler(IAppDbContext db)
    : IQueryHandler<GetPrescriptionTemplateQuery, PrescriptionTemplateDto>
{
    public async Task<Result<PrescriptionTemplateDto>> Handle(GetPrescriptionTemplateQuery query, CancellationToken cancellationToken)
    {
        var row = await db.PrescriptionTemplates.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        return row is null
            ? Result<PrescriptionTemplateDto>.Success(null)
            : new PrescriptionTemplateDto(PrescriptionLayoutRules.Deserialize(row.Layout), row.UpdatedAt);
    }
}
