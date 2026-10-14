using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics;

/// <summary>
/// The clinic queries shared by the admin use cases. Deleted clinics are excluded explicitly (no EF query
/// filter on <c>Clinics</c>, design D4): every admin list and lookup goes through <see cref="NotDeleted"/>.
/// </summary>
public static class ClinicQueries
{
    /// <summary>Clinics that are not soft deleted.</summary>
    public static IQueryable<Clinic> NotDeleted(this IQueryable<Clinic> clinics) =>
        clinics.Where(c => c.DeletedAt == null);

    /// <summary>The clinics the admin endpoints manage: not deleted, not the template.</summary>
    public static IQueryable<Clinic> Manageable(this IQueryable<Clinic> clinics) =>
        clinics.NotDeleted().Where(c => !c.IsTemplate);

    /// <summary>
    /// Projects clinics to <see cref="ClinicDetails"/> (one query: the active staff count and the owners are
    /// subqueries). Staff are read across clinics (<c>IgnoreQueryFilters()</c>, read only: allowed in Platform
    /// code), so no clinic context is needed.
    /// </summary>
    public static IQueryable<ClinicDetails> SelectDetails(this IQueryable<Clinic> clinics, IAppDbContext db)
    {
        var staff = db.Staff.IgnoreQueryFilters();
        return clinics.Select(c => new ClinicDetails(c.Id, c.Name, c.Status,
            staff.Count(s => s.ClinicId == c.Id && s.IsActive),
            c.CreatedAt,
            staff.Where(s => s.ClinicId == c.Id && s.IsActive && s.Roles.Any(r => r.Role.IsOwner))
                .OrderBy(s => s.FullName).ThenBy(s => s.Id)
                .Select(s => new ClinicOwner(s.Id, s.FullName, s.User.Phone))
                .ToList()));
    }
}
