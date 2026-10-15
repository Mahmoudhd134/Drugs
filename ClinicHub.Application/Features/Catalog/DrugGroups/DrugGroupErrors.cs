using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.DrugGroups;

/// <summary>
/// Drug group errors. Name rules: <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>,
/// <see cref="CommonErrors.NameTooLong"/>.
/// </summary>
public static class DrugGroupErrors
{
    /// <summary>Code <c>notFound</c> (no group-specific code: the SPA shows "this item no longer exists").</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The group does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error DrugsRequired =
        new("drugsRequired", "A group needs at least one drug.", ErrorType.Validation);

    public static readonly Error InvalidDosing =
        new("invalidDosing", "The dosing of a group line is not valid.", ErrorType.Validation);

    /// <summary>
    /// Two lines give the same drug for the same <b>effective</b> eye (<see cref="SaveDrugGroupItem.HasDuplicate"/>).
    /// Checked by the handlers (it reads the drugs' default eyes), after <see cref="DrugNotFound"/>.
    /// </summary>
    public static readonly Error DuplicateItem =
        new("duplicateGroupItem", "A drug is in the group twice for the same eye.", ErrorType.Validation, "Items");

    /// <summary>Checked by the handlers (it reads the database), after the validator passed.</summary>
    public static readonly Error DrugNotFound =
        new("drugNotFound", "A drug of the group does not exist in this clinic.", ErrorType.Validation,
            "Items");
}
