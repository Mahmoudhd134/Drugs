namespace ClinicHub.Application.Common.Results;

/// <summary>What kind of failure an <see cref="Error"/> is. Only the API layer turns it into an HTTP status.</summary>
public enum ErrorType
{
    Validation,
    NotFound,
    Conflict,
    Forbidden,
    Unauthorized,
    Failure,
}
