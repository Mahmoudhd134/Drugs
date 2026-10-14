using System.Reflection;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Infrastructure.Database;

public class AppDbContext(DbContextOptions<AppDbContext> options, IClinicContext clinicContext)
    : DbContext(options), IAppDbContext
{
    /// <summary>The current clinic; every <see cref="IClinicOwned"/> query is filtered to it.</summary>
    public int? ClinicId => clinicContext.ClinicId;

    public DbSet<Clinic> Clinics { get; set; }
    public DbSet<Drug> Drugs { get; set; }
    public DbSet<DrugGroup> DrugGroups { get; set; }
    public DbSet<DrugGroupItem> DrugGroupItems { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<OtpCode> OtpCodes { get; set; }
    public DbSet<Session> Sessions { get; set; }
    public DbSet<Staff> Staff { get; set; }
    public DbSet<Role> Roles { get; set; }
    public DbSet<StaffRole> StaffRoles { get; set; }

    /// <inheritdoc />
    public void Touch(IHasTimestamps entity) =>
        Entry(entity).Property(nameof(IHasTimestamps.UpdatedAt)).IsModified = true;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // One IEntityTypeConfiguration<T> per entity (Configurations/)
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        foreach (var type in modelBuilder.Model.GetEntityTypes()
                     .Where(t => !t.IsOwned() && typeof(IClinicOwned).IsAssignableFrom(t.ClrType))
                     .Select(t => t.ClrType).ToList())
            ConfigureClinicOwnedMethod.MakeGenericMethod(type).Invoke(this, [modelBuilder]);

        base.OnModelCreating(modelBuilder);
    }

    private static readonly MethodInfo ConfigureClinicOwnedMethod =
        typeof(AppDbContext).GetMethod(nameof(ConfigureClinicOwned), BindingFlags.Instance | BindingFlags.NonPublic);

    /// <summary>
    /// FK to the clinic (restrict) and the clinic filter. Fails closed: no clinic in context = no rows.
    /// Only Platform code (and the Access module's read-only membership queries and cache loads by id)
    /// may bypass it with <c>IgnoreQueryFilters()</c>.
    /// </summary>
    private void ConfigureClinicOwned<T>(ModelBuilder modelBuilder) where T : class, IClinicOwned
    {
        var builder = modelBuilder.Entity<T>();
        builder.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
        builder.HasQueryFilter(x => ClinicId != null && x.ClinicId == ClinicId);
    }
}
