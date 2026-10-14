namespace ClinicHub.Application.Common.Results;

/// <summary>
/// Errors shared by every module. Codes are API contracts; the SPA translates them under <c>errors.*</c>
/// (the transport codes, e.g. <c>unauthorized</c> or <c>unexpected</c>, fall back to its generic message).
/// </summary>
public static class CommonErrors
{
    public static readonly Error Unauthorized =
        new("unauthorized", "The access token is missing, invalid or expired.", ErrorType.Unauthorized);

    public static readonly Error Forbidden =
        new("forbidden", "You are not allowed to do this.", ErrorType.Forbidden);

    /// <summary>An unknown route or row; features declare their own (e.g. <c>DrugErrors.NotFound</c>) with this code.</summary>
    public static readonly Error NotFound =
        new("notFound", "The resource does not exist.", ErrorType.NotFound);

    /// <summary>
    /// The body could not be read (malformed JSON, wrong types), before any use case runs. Also the code of
    /// a validation rule without <c>.WithError(...)</c> and of any other bare 4xx.
    /// </summary>
    public static readonly Error InvalidRequest =
        new("invalidRequest", "The request is not valid.", ErrorType.Validation);

    public static readonly Error Conflict =
        new("conflict", "The request conflicts with the current state.", ErrorType.Conflict);

    /// <summary>A rate limit was hit (answered with 429).</summary>
    public static readonly Error TooManyRequests =
        new("tooManyRequests", "Too many requests. Wait a little and try again.", ErrorType.Failure);

    public static readonly Error Unexpected =
        new("unexpected", "An unexpected error occurred.", ErrorType.Failure);

    // Shared validation rules (names of drugs and groups; later roles and clinics)
    public static readonly Error NameRequired =
        new("nameRequired", "The name is required.", ErrorType.Validation);

    public static readonly Error NameTooLong =
        new("nameTooLong", "The name is too long.", ErrorType.Validation);
}
