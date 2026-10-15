namespace ClinicHub.Application.Common.Results;

/// <summary>
/// An error about clinics the user can't enter, with their names: the Api adds <c>clinicNames</c> to the
/// ProblemDetails, so the SPA can name them in its message (the login and clinic picker refusals
/// <c>clinicSuspended</c> and <c>staffInactive</c>). Same code, description and type as the error it names.
/// </summary>
public sealed record ClinicError : Error
{
    /// <param name="clinicNames">At least one; the login's refusal lists every clinic with the reason, by name.</param>
    public ClinicError(Error error, IReadOnlyList<string> clinicNames)
        : base(error.Code, error.Description, error.Type, error.Field) =>
        ClinicNames = clinicNames;

    public IReadOnlyList<string> ClinicNames { get; }
}
