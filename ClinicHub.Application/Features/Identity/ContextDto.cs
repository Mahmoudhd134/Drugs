using System.Text.Json.Serialization;
using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity;

/// <summary>
/// A context the user can act in: <c>{ type: "clinic", clinicId, clinicName, isTemplate, roles }</c> or
/// <c>{ type: "platform" }</c>.
/// </summary>
public record ContextDto(
    string Type,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? ClinicId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string ClinicName,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? IsTemplate,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] List<string> Roles)
{
    /// <param name="roles">The user's role names there (none in the template clinic).</param>
    public static ContextDto ForClinic(int clinicId, string clinicName, bool isTemplate, List<string> roles) =>
        new(ContextTypes.Clinic, clinicId, clinicName, isTemplate, roles);

    public static readonly ContextDto Platform = new(ContextTypes.Platform, null, null, null, null);

    public bool Matches(string type, int? clinicId) =>
        Type == type && (type != ContextTypes.Clinic || ClinicId == clinicId);
}
