using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Queries.GetPrescriptionTemplate;

/// <summary>Contract stub (track <c>print-templates/backend</c>; contract § 1.5).</summary>
internal sealed class GetPrescriptionTemplateQueryHandler(IAppDbContext db)
    : IQueryHandler<GetPrescriptionTemplateQuery, PrescriptionTemplateDto>
{
    public Task<Result<PrescriptionTemplateDto>> Handle(GetPrescriptionTemplateQuery query, CancellationToken cancellationToken)
    {
        _ = db;
        throw new NotImplementedException("contract stub");
    }
}
