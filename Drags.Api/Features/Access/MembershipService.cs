using Drags.Api.Database;
using Drags.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Access;

public record MemberClinic(int ClinicId, string ClinicName);

/// <summary>
/// A user's staff memberships across clinics (Access module), for login and context checks. These
/// are the only reads of <see cref="Staff"/> outside the request's clinic, so they bypass the clinic
/// query filter (read only).
/// </summary>
public class MembershipService(AppDbContext db)
{
    private IQueryable<Staff> ActiveMemberships(int userId) =>
        db.Staff.IgnoreQueryFilters().AsNoTracking().Where(s => s.UserId == userId && s.IsActive);

    /// <summary>Active, non-template clinics where the user is active staff, by name.</summary>
    public Task<List<MemberClinic>> GetEnterableClinicsAsync(int userId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId)
            .Join(db.Clinics, s => s.ClinicId, c => c.Id, (s, c) => c)
            .Where(c => c.Status == ClinicStatus.Active && !c.IsTemplate)
            .OrderBy(c => c.Name).ThenBy(c => c.Id)
            .Select(c => new MemberClinic(c.Id, c.Name))
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
