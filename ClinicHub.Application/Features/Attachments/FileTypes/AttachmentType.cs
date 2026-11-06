namespace ClinicHub.Application.Features.Attachments.FileTypes;

/// <summary>A type the code can check (docs/design/attachments.md § 5). Extensions are lower case with their dot.</summary>
public sealed record AttachmentType(string Key, IReadOnlyList<string> Extensions, string ContentType);
