using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.GetPaperImageRules;

/// <summary>What the <c>clinicPaper</c> module's config allows, for the screen.</summary>
internal sealed class GetPaperImageRulesQueryHandler(IAttachmentService attachments) : IQueryHandler<GetPaperImageRulesQuery, AttachmentRulesDto>
{
    public Task<Result<AttachmentRulesDto>> Handle(GetPaperImageRulesQuery query, CancellationToken cancellationToken) =>
        Task.FromResult(Result<AttachmentRulesDto>.Success(attachments.GetRules(AttachmentModules.ClinicPaper)));
}