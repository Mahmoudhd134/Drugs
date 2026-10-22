using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Protocols;

/// <summary>
/// Protocol errors. Name rules: <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>,
/// <see cref="CommonErrors.NameTooLong"/>.
/// </summary>
public static class ProtocolErrors
{
    /// <summary>Code <c>notFound</c> (no protocol-specific code: the SPA shows "this item no longer exists").</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The protocol does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error DrugsRequired =
        new("drugsRequired", "A protocol needs at least one drug.", ErrorType.Validation);

    public static readonly Error InvalidDosing =
        new("invalidDosing", "The dosing of a protocol line is not valid.", ErrorType.Validation);

    /// <summary>
    /// Two lines give the same drug for the same <b>effective</b> eye (<see cref="SaveProtocolItem.HasDuplicate"/>).
    /// Checked by the handlers (it reads the drugs' default eyes), after <see cref="DrugNotFound"/>.
    /// </summary>
    public static readonly Error DuplicateItem =
        new("duplicateProtocolItem", "A drug is in the protocol twice for the same eye.", ErrorType.Validation, "Items");

    /// <summary>Checked by the handlers (it reads the database), after the validator passed.</summary>
    public static readonly Error DrugNotFound =
        new("drugNotFound", "A drug of the protocol does not exist in this clinic.", ErrorType.Validation,
            "Items");
}
