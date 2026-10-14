namespace ClinicHub.Api.Shared;

/// <summary>
/// Machine-readable error codes returned in the "code" field of error responses.
/// The frontend maps each code to a translated message.
/// </summary>
public static class ErrorCodes
{
    // Identity and Access (they move to per-feature error classes in Phase 3.5 step 3; Catalog codes
    // live in Application: CommonErrors, DrugErrors, DrugGroupErrors)
    public const string InvalidPhone = "invalidPhone";
    public const string InvalidCode = "invalidCode";
    public const string CodeExpired = "codeExpired";
    public const string TooManyAttempts = "tooManyAttempts";
    public const string TooManyRequests = "tooManyRequests";
    public const string NoAccess = "noAccess";
    public const string ClinicSuspended = "clinicSuspended";
    public const string Forbidden = "forbidden";
}
