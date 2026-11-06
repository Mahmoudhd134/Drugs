using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.UploadPaperImage;

/// <summary>Adds the current clinic's picture, or replaces the one it has. Takes no clinic id (design D5).</summary>
public record UploadPaperImageCommand(AttachmentUpload File) : ICommand<AttachmentDto>;
