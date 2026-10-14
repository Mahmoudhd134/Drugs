using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;

namespace ClinicHub.Application.Features.Identity;

/// <summary>
/// Login and session errors. Also used here: <see cref="AccessErrors.NoAccess"/> and
/// <see cref="AccessErrors.ClinicSuspended"/> (403), <see cref="TooManyRequestsError"/> (429) and
/// <see cref="CommonErrors.Unauthorized"/> (no valid access token).
/// </summary>
public static class IdentityErrors
{
    public static readonly Error InvalidPhone =
        new("invalidPhone", "The phone number is not valid.", ErrorType.Validation);

    /// <summary>Wrong code, no code for the phone, or already used.</summary>
    public static readonly Error InvalidCode =
        new("invalidCode", "The code is not valid.", ErrorType.Validation);

    public static readonly Error CodeExpired =
        new("codeExpired", "The code has expired.", ErrorType.Validation);

    /// <summary>The code reached <c>Otp:MaxAttempts</c> wrong guesses; a new one is needed.</summary>
    public static readonly Error TooManyAttempts =
        new("tooManyAttempts", "Too many wrong codes. Ask for a new one.", ErrorType.Validation);

    /// <summary>Code <c>unauthorized</c>: no live session for the refresh cookie. The Api clears the cookie.</summary>
    public static readonly Error SessionEnded =
        new(CommonErrors.Unauthorized.Code, "The session is unknown, expired or revoked.", ErrorType.Unauthorized);

    /// <summary>
    /// Code <c>unauthorized</c>: the refresh cookie is missing or belongs to another session. The cookie is
    /// kept (it may belong to another, valid session).
    /// </summary>
    public static readonly Error RefreshTokenRejected =
        new(CommonErrors.Unauthorized.Code, "The refresh cookie is missing or not this session's.", ErrorType.Unauthorized);

    /// <summary>Code <c>conflict</c>: a parallel request rotated this refresh token first; the cookie it set is the valid one.</summary>
    public static readonly Error RefreshTokenRotated =
        new(CommonErrors.Conflict.Code, "The refresh token was just rotated by another request.", ErrorType.Conflict);
}
