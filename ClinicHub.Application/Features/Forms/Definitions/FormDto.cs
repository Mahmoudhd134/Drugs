using System.Text.Json;

namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>A row of the list (design dynamic-forms § 4.3).</summary>
/// <param name="UpdatedAt">The form's last save, UTC ("last edited" on the list).</param>
public record FormSummary(int Id, string Name, int ActiveVersionNumber, DateTime UpdatedAt);

/// <summary><see cref="FormSummary"/> plus the active version's definition.</summary>
/// <param name="Definition">The JSON object as saved; the server never reads inside it (D4).</param>
public record FormDetails(int Id, string Name, int ActiveVersionNumber, DateTime UpdatedAt, JsonElement Definition);
