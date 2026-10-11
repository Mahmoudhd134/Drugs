using System.Text.Json.Serialization;
using Drags.Api.Models;

namespace Drags.Api.Features.Identity;

/// <summary>One of <see cref="Shared.OtpModes"/>.</summary>
public record OtpModeResponse(string Mode);

public record OtpRequestRequest(string Phone);

/// <summary><see cref="DevCode"/> is only set in display mode.</summary>
public record OtpRequestResponse(
    int ExpiresInSeconds,
    int ResendAfterSeconds,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string DevCode);

public record OtpVerifyRequest(string Phone, string Code);

public record ContextRequest(string Type, int? ClinicId);

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
    // Roles come with phase 3 (Access)
    public static ContextDto ForClinic(int clinicId, string clinicName, bool isTemplate) =>
        new(ContextTypes.Clinic, clinicId, clinicName, isTemplate, []);

    public static readonly ContextDto Platform = new(ContextTypes.Platform, null, null, null, null);

    public bool Matches(string type, int? clinicId) =>
        Type == type && (type != ContextTypes.Clinic || ClinicId == clinicId);
}

/// <summary><see cref="Context"/> is null when the user must pick one of <see cref="Contexts"/>.</summary>
public record AuthResult(string AccessToken, DateTime ExpiresAt, ContextDto Context, List<ContextDto> Contexts);

public record MeUserDto(int Id, string Phone, bool IsSuperAdmin);

public record MeStaffDto(int Id, string FullName);

public record MeDto(MeUserDto User, ContextDto Context, MeStaffDto Staff, List<string> Permissions);
