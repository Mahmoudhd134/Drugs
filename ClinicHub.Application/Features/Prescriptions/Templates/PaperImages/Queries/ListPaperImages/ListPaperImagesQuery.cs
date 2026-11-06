using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.ListPaperImages;

/// <summary>The current clinic's pictures, newest first: normally one row, two after a race (accepted, the screen shows the newest).</summary>
public record ListPaperImagesQuery : IQuery<IReadOnlyList<AttachmentDto>>;
