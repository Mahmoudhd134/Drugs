using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.DeletePaperImage;

/// <summary>Marks the picture deleted: the file stays on disk (attachments A8). A second delete is 404.</summary>
public record DeletePaperImageCommand(Guid Id) : ICommand;
