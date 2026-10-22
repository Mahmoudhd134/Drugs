namespace ClinicHub.Application.Common.Results;

/// <summary>
/// An error with a count (design M1.7 § 7): the Api adds <c>drugCount</c> to the ProblemDetails, so the SPA can say how
/// many drugs block a delete (<c>categoryInUse</c>, <c>subCategoryInUse</c>). Same code, description, type and field as
/// the error it carries.
/// </summary>
public sealed record CountError : Error
{
    public CountError(Error error, int drugCount)
        : base(error.Code, error.Description, error.Type, error.Field) =>
        DrugCount = drugCount;

    /// <summary>Every drug using the (sub)category: shared (withdrawn included) and every clinic's own (deleted clinics too).</summary>
    public int DrugCount { get; }
}
