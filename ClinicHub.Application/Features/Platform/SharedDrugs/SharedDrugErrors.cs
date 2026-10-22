using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs;

/// <summary>
/// The admin shared-drug routes' errors (design M1.7 § 7); validation is the clinic drug's (<c>CommonErrors</c>,
/// <c>CategoryErrors</c>).
/// </summary>
public static class SharedDrugErrors
{
    /// <summary>404: an unknown id, or an own drug's (the platform filter doesn't see own drugs).</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The shared drug does not exist.", ErrorType.NotFound);
}
