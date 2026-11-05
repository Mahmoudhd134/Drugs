namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>The record a file belongs to. A blank or too long module (over 50) or ref ID (over 64) throws: a programmer error.</summary>
public sealed record AttachmentOwner(string Module, string RefId);

/// <summary>A file to store. <see cref="OpenRead"/> is re-openable and its stream seekable; the stream's Length is the size.</summary>
public sealed record AttachmentUpload(string OriginalFileName, Func<Stream> OpenRead);

/// <summary>An opened file: the caller (<c>ToFile()</c>) owns and disposes <see cref="Content"/>.</summary>
public sealed record AttachmentContent(Stream Content, string OriginalFileName, string ContentType);

/// <summary>A stored file as a feature sees it. Never holds the storage key.</summary>
public sealed record AttachmentDto(Guid Id, string OriginalFileName, string TypeKey, string ContentType, long SizeBytes, DateTime CreatedAt);

/// <summary>What the module's config allows, for a screen. Extensions are lower case with their dot (<c>.png</c>), in <c>AttachmentTypes.All</c>'s order.</summary>
public sealed record AttachmentRulesDto(long MaxFileSizeBytes, IReadOnlyList<string> Extensions);
