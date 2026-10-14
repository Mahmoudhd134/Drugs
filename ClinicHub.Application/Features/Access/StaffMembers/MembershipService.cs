using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers;

/// <summary>
/// A user's staff memberships across clinics (Access module), for login and context checks. These
/// are the only reads of <see cref="Staff"/> outside the request's clinic, so they bypass the clinic
/// query filter (read only).
/// </summary>
internal sealed class MembershipService(IAppDbContext db) : IMembershipService
{
    private IQueryable<Staff> ActiveMemberships(int userId) =>
        db.Staff.IgnoreQueryFilters().AsNoTracking().Where(s => s.UserId == userId && s.IsActive);

    public Task<List<MemberClinic>> GetEnterableClinicsAsync(int userId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId)
            .Join(db.Clinics, s => s.ClinicId, c => c.Id, (s, c) => new { Staff = s, Clinic = c })
            // Deleted clinics explicitly (no query filter on Clinics, design D4)
            .Where(x => x.Clinic.Status == ClinicStatus.Active && !x.Clinic.IsTemplate && x.Clinic.DeletedAt == null)
            .OrderBy(x => x.Clinic.Name).ThenBy(x => x.Clinic.Id)
            .Select(x => new MemberClinic(x.Clinic.Id, x.Clinic.Name, x.Staff.Roles
                .OrderByDescending(r => r.Role.IsOwner).ThenBy(r => r.Role.Name)
                .Select(r => r.Role.Name).ToList()))
            .ToListAsync(cancellationToken);

    public Task<int?> GetStaffIdAsync(int userId, int clinicId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId)
            .Where(s => s.ClinicId == clinicId)
            .Select(s => (int?)s.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<bool> IsActiveMemberAsync(int userId, int clinicId, CancellationToken cancellationToken) =>
        ActiveMemberships(userId).AnyAsync(s => s.ClinicId == clinicId, cancellationToken);
}
