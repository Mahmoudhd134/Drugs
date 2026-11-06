using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.GetPaperImageRules;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>: <c>GetRules(AttachmentModules.ClinicPaper)</c>.</summary>
internal sealed class GetPaperImageRulesQueryHandler : IQueryHandler<GetPaperImageRulesQuery, AttachmentRulesDto>
{
    public Task<Result<AttachmentRulesDto>> Handle(GetPaperImageRulesQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
