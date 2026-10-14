using ClinicHub.Domain.Access;
using ClinicHub.Domain.Platform;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Api.Features.Access;

/// <param name="Roles">The user's role names in the clinic (Owner first, then by name).</param>
public record MemberClinic(int ClinicId, string ClinicName, List<string> Roles);

/// <summary>
/// A user's staff memberships across clinics (Access module), for login and context checks. These
/// are the only reads of <see cref="Staff"/> outside the request's clinic, so they bypass the clinic
/// query filter (read only).
/// </summary>
public class MembershipService(AppDbContext db)
{
    private IQueryable<Staff> ActiveMemberships(int userId) =>
        db.Staff.IgnoreQueryFilters().AsNoTracking().Where(s => s.UserId == userId && s.IsActive);

    /// <summary>Active, non-template clinics where the user is active staff, by name, with their roles there.</summary>
    public Task<List<MemberClinic>> GetEnterableClinicsAsync(int userId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId)
            .Join(db.Clinics, s => s.ClinicId, c => c.Id, (s, c) => new { Staff = s, Clinic = c })
            .Where(x => x.Clinic.Status == ClinicStatus.Active && !x.Clinic.IsTemplate)
            .OrderBy(x => x.Clinic.Name).ThenBy(x => x.Clinic.Id)
            .Select(x => new MemberClinic(x.Clinic.Id, x.Clinic.Name, x.Staff.Roles
                .OrderByDescending(r => r.Role.IsOwner).ThenBy(r => r.Role.Name)
                .Select(r => r.Role.Name).ToList()))
            .ToListAsync(cancellationToken);

    /// <summary>The user's active staff row in the clinic, if any.</summary>
    public Task<int?> GetStaffIdAsync(int userId, int clinicId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId)
            .Where(s => s.ClinicId == clinicId)
            .Select(s => (int?)s.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<bool> IsActiveMemberAsync(int userId, int clinicId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId).AnyAsync(s => s.ClinicId == clinicId, cancellationToken);
}
