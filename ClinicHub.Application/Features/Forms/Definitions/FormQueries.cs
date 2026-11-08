using ClinicHub.Domain.Forms;

namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>
/// Deleted forms are excluded explicitly (no EF query filter on <c>Forms</c>, design dynamic-forms § 4.3): every list and
/// lookup goes through <see cref="NotDeleted"/>.
/// </summary>
public static class FormQueries
{
    /// <summary>Forms that are not soft deleted (<c>IsDeleted</c> decides).</summary>
    public static IQueryable<Form> NotDeleted(this IQueryable<Form> forms) =>
        forms.Where(f => !f.IsDeleted);
}
