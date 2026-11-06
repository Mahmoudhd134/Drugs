using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.GetPaperImageRules;

/// <summary>What the picture's module allows, for the screen: the config's limit and types.</summary>
public record GetPaperImageRulesQuery : IQuery<AttachmentRulesDto>;
