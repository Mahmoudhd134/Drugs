using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.OpenPaperImage;

/// <summary>The picture's bytes; the controller answers them through <c>ToFile()</c>. Another clinic's id, or a deleted one: 404.</summary>
public record OpenPaperImageQuery(Guid Id) : IQuery<AttachmentContent>;
