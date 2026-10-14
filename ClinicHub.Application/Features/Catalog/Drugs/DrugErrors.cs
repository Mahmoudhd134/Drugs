using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>
/// Drug errors. Name rules: <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>,
/// <see cref="CommonErrors.NameTooLong"/>.
/// </summary>
public static class DrugErrors
{
    /// <summary>Code <c>notFound</c> (no drug-specific code: the SPA shows "this item no longer exists").</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The drug does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error InvalidDosing =
        new("invalidDosing", "The default dosing is not valid.", ErrorType.Validation);
}
