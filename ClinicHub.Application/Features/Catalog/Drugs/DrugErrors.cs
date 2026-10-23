using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>
/// Drug errors. Name rules: <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>,
/// <see cref="CommonErrors.NameTooLong"/>; active ingredients: <see cref="CommonErrors.InvalidText"/>,
/// <see cref="CommonErrors.TextTooLong"/>; category: <c>CategoryErrors</c>.
/// </summary>
public static class DrugErrors
{
    /// <summary>Code <c>notFound</c> (no drug-specific code: the SPA shows "this item no longer exists").</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The drug does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error InvalidDosing =
        new("invalidDosing", "The default dosing is not valid.", ErrorType.Validation);

    /// <summary>
    /// 409: a clinic (the template included) updates or deletes a shared drug (design M1.7 D2); checked last (§ 7). A
    /// 409, so the SPA's 403 re-fetch of <c>/me</c> isn't triggered.
    /// </summary>
    public static readonly Error SharedDrugReadOnly =
        new("sharedDrugReadOnly", "Shared drugs can't be changed by a clinic.", ErrorType.Conflict);
}
