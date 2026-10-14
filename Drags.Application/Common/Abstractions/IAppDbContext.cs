using Drags.Domain.Access;
using Drags.Domain.Catalog;
using Drags.Domain.Common;
using Drags.Domain.Identity;
using Drags.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace Drags.Application.Common.Abstractions;

/// <summary>
/// The database as use cases see it: one set per table (filtered to the current clinic for
/// <see cref="IClinicOwned"/> rows) and saving. Migrations, raw SQL, transactions and the change
/// tracker stay in Infrastructure. <see cref="RolePermission"/> has no set: it has no clinic column, so
/// it is only read through its (filtered) <see cref="Role"/>.
/// </summary>
public interface IAppDbContext
{
    DbSet<Clinic> Clinics { get; }
    DbSet<User> Users { get; }
    DbSet<OtpCode> OtpCodes { get; }
    DbSet<Session> Sessions { get; }
    DbSet<Staff> Staff { get; }
    DbSet<Role> Roles { get; }
    DbSet<StaffRole> StaffRoles { get; }
    DbSet<Drug> Drugs { get; }
    DbSet<DrugGroup> DrugGroups { get; }
    DbSet<DrugGroupItem> DrugGroupItems { get; }

    /// <summary>
    /// Marks the row as changed so its UpdatedAt moves (e.g. a group whose items changed); the
    /// interceptor sets the time on save.
    /// </summary>
    void Touch(IHasTimestamps entity);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
