namespace ClinicHub.Application.Features.Platform.SharedDrugs;

/// <summary>
/// The <c>status</c> filter of <c>GET /admin/drugs</c> (design M1.7 D8), bound as a string like <c>source</c>: exactly
/// one of these lower-case values; empty or absent = <see cref="Active"/>; anything else → 400 <c>invalidRequest</c>
/// (field <c>status</c>).
/// </summary>
public static class SharedDrugStatus
{
    public const string Active = "active";
    public const string Withdrawn = "withdrawn";
    public const string All = "all";

    public static readonly IReadOnlyList<string> Values = [Active, Withdrawn, All];

    public static bool IsValid(string status) => string.IsNullOrEmpty(status) || Values.Contains(status, StringComparer.Ordinal);
}
