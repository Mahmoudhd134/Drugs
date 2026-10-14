namespace ClinicHub.Application.Common.Results;

/// <summary>
/// <see cref="CommonErrors.TooManyRequests"/> with the time to wait: the Api answers 429 and sends it as
/// the <c>Retry-After</c> header.
/// </summary>
public sealed record TooManyRequestsError(int RetryAfterSeconds)
    : Error(CommonErrors.TooManyRequests.Code, CommonErrors.TooManyRequests.Description, CommonErrors.TooManyRequests.Type);
