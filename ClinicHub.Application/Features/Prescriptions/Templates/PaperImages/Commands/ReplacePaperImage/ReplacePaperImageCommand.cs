using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.ReplacePaperImage;

/// <summary>Replaces that picture: a new row and file with a new id; the old row is marked, its file stays. Gone: 404.</summary>
public record ReplacePaperImageCommand(Guid Id, AttachmentUpload File) : ICommand<AttachmentDto>;
