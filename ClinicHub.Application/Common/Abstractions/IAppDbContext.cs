using ClinicHub.Domain.Access;
using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// The database as use cases see it: one set per table (filtered to the current clinic for
/// <see cref="IClinicOwned"/> rows, to the current clinic's and the shared rows for <see cref="IClinicOrShared"/>) and
/// saving. Migrations, raw SQL, transactions and the change
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
    DbSet<Protocol> Protocols { get; }
    DbSet<ProtocolItem> ProtocolItems { get; }
    /// <summary>Platform rows (not clinic-owned): every clinic reads them; only the admin handlers write them.</summary>
    DbSet<Category> Categories { get; }
    DbSet<SubCategory> SubCategories { get; }

    /// <summary>
    /// Marks the row as changed so its UpdatedAt moves (e.g. a protocol whose items changed); the
    /// interceptor sets the time on save.
    /// </summary>
    void Touch(IHasTimestamps entity);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
