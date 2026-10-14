using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.Clinics;

/// <summary>Clinic errors (admin). Name rules: <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameTooLong"/>.</summary>
public static class ClinicErrors
{
    /// <summary>
    /// Code <c>notFound</c>: a missing or deleted clinic, or the template (which the admin endpoints don't
    /// manage: it is edited through its own context).
    /// </summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The clinic does not exist.", ErrorType.NotFound);
}
