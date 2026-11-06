using System.Text.Json.Serialization;

namespace ClinicHub.Application.Features.Prescriptions.Templates;

/// <summary>What the template routes answer (design prescription-templates § 5).</summary>
public record PrescriptionTemplateDto(PrescriptionLayoutDto Layout, DateTime UpdatedAt);

/// <summary>
/// The layout: the body of the PUT, the <c>Layout</c> of the DTO and the JSON stored in the column (only these fields
/// are ever stored, TPL-203). Numbers are nullable: a missing one is a validation error (<c>invalidRequest</c> naming it),
/// a wrong type a binding error (<c>invalidRequest</c>, ERR-011). <c>Kind</c>, <c>Function</c> and <c>Size</c> are
/// strings, so an unknown value reaches the validator (TPL-204). <c>Calibration</c> is last and has no default: everything
/// that rebuilds the layout field by field has to name it (step 4 design § 4).
/// </summary>
public record PrescriptionLayoutDto(int? SchemaVersion, PrescriptionPageDto Page, List<PrescriptionItemDto> Items, PrescriptionCalibrationDto Calibration);

/// <summary>
/// The printer's correction in mm, one pair per clinic (step 4 design A3, § 4): +X moves right and +Y moves down on the paper,
/// whatever the language. Missing or <c>null</c> in a body or a stored row reads as 0, 0 (<c>PrescriptionLayoutRules</c>); a null
/// number is a validation error naming it (<c>invalidRequest</c>, <c>calibration.xMm</c>).
/// </summary>
public record PrescriptionCalibrationDto(decimal? XMm, decimal? YMm);

public record PrescriptionPageDto(string Size, decimal? WidthMm, decimal? HeightMm);

/// <summary>
/// One item. Fields of another kind are dropped by <c>PrescriptionLayoutRules.Normalize</c> and left out of the JSON.
/// </summary>
public record PrescriptionItemDto(
    string Id,
    string Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string Function,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string Name,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string Text,
    decimal? XMm,
    decimal? YMm,
    decimal? WMm,
    decimal? HMm,
    decimal? FontSizePt);
