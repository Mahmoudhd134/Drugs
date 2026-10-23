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

    /// <summary>
    /// True inside <c>IClinicScope.UseSharedCatalog()</c>: read by the (singleton) save interceptor, which lets a request
    /// with no clinic write shared drugs only then (design M1.7 D2).
    /// </summary>
    public bool IsWritingSharedCatalog => clinicContext.WritingSharedCatalog;

    public DbSet<Clinic> Clinics { get; set; }
    public DbSet<Drug> Drugs { get; set; }
    public DbSet<Protocol> Protocols { get; set; }
    public DbSet<ProtocolItem> ProtocolItems { get; set; }
    public DbSet<Category> Categories { get; set; }
    public DbSet<SubCategory> SubCategories { get; set; }
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
        foreach (var type in modelBuilder.Model.GetEntityTypes()
                     .Where(t => !t.IsOwned() && typeof(IClinicOrShared).IsAssignableFrom(t.ClrType))
                     .Select(t => t.ClrType).ToList())
            ConfigureClinicOrSharedMethod.MakeGenericMethod(type).Invoke(this, [modelBuilder]);

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

    private static readonly MethodInfo ConfigureClinicOrSharedMethod =
        typeof(AppDbContext).GetMethod(nameof(ConfigureClinicOrShared), BindingFlags.Instance | BindingFlags.NonPublic);

    /// <summary>
    /// FK to the clinic (restrict, nullable: null = shared) and the filter of design M1.7 D1: the shared rows plus the
    /// current clinic's; a request with no clinic (platform) sees only the shared rows. <c>IgnoreQueryFilters()</c> stays
    /// Platform-only (the category delete counts every clinic's drugs).
    /// </summary>
    private void ConfigureClinicOrShared<T>(ModelBuilder modelBuilder) where T : class, IClinicOrShared
    {
        var builder = modelBuilder.Entity<T>();
        builder.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
        builder.HasQueryFilter(x => x.ClinicId == null || (ClinicId != null && x.ClinicId == ClinicId));
    }
}
