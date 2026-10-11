using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Api.Database;

public class AppDbContext(DbContextOptions<AppDbContext> options, IClinicContext clinicContext) : DbContext(options)
{
    public const int NameMaxLength = 256;

    /// <summary>The current clinic; every <see cref="IClinicOwned"/> query is filtered to it.</summary>
    public int? ClinicId => clinicContext.ClinicId;

    public DbSet<Clinic> Clinics { get; set; }
    public DbSet<Drug> Drugs { get; set; }
    public DbSet<DrugGroup> DrugGroups { get; set; }
    public DbSet<DrugGroupItem> DrugGroupItems { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Clinic>(builder =>
        {
            builder.Property(x => x.Name).HasMaxLength(NameMaxLength).IsRequired();
            builder.Property(x => x.Status).HasMaxLength(20).IsRequired();
            // Only one template clinic
            builder.HasIndex(x => x.IsTemplate).IsUnique().HasFilter("\"IsTemplate\"");
        });

        modelBuilder.Entity<Drug>(builder =>
        {
            builder.Property(x => x.Name).HasMaxLength(NameMaxLength).IsRequired();
            builder.HasIndex(x => new { x.ClinicId, x.Name });
            // Target of the group items' (DrugId, ClinicId) FK
            builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
            builder.OwnsOne(x => x.DefaultDosing, ConfigureDosing);
        });

        modelBuilder.Entity<DrugGroup>(builder =>
        {
            builder.Property(x => x.Name).HasMaxLength(NameMaxLength).IsRequired();
            builder.HasIndex(x => new { x.ClinicId, x.Name });
            // Target of the group items' (DrugGroupId, ClinicId) FK
            builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
        });

        modelBuilder.Entity<DrugGroupItem>(builder =>
        {
            // Composite FKs that include ClinicId: the database itself guarantees that an item, its
            // group and its drug belong to the same clinic
            builder.HasOne(x => x.DrugGroup).WithMany(x => x.Items)
                .HasForeignKey(x => new { x.DrugGroupId, x.ClinicId })
                .HasPrincipalKey(x => new { x.Id, x.ClinicId });
            builder.HasOne(x => x.Drug).WithMany(x => x.GroupItems)
                .HasForeignKey(x => new { x.DrugId, x.ClinicId })
                .HasPrincipalKey(x => new { x.Id, x.ClinicId });
            builder.OwnsOne(x => x.Dosing, ConfigureDosing);
        });

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
    /// Only Platform code may bypass it with <c>IgnoreQueryFilters()</c>.
    /// </summary>
    private void ConfigureClinicOwned<T>(ModelBuilder modelBuilder) where T : class, IClinicOwned
    {
        var builder = modelBuilder.Entity<T>();
        builder.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
        builder.HasQueryFilter(x => ClinicId != null && x.ClinicId == ClinicId);
    }

    /// <summary>Column setup for an owned <see cref="Dosing"/> (columns are prefixed with the property name).</summary>
    private static void ConfigureDosing<TOwner>(OwnedNavigationBuilder<TOwner, Dosing> dosing) where TOwner : class
    {
        dosing.Property(x => x.DoseUnit).HasMaxLength(20);
        dosing.Property(x => x.Frequency).HasMaxLength(20);
        dosing.Property(x => x.FrequencyText).HasMaxLength(Shared.DosingRules.MaxFrequencyTextLength);
        dosing.Property(x => x.DurationUnit).HasMaxLength(20);
        dosing.Property(x => x.Eye).HasMaxLength(10);
        // The tapering schedule is a small list, stored as one JSON text column
        dosing.Property(x => x.TaperSteps)
            .HasConversion(
                steps => steps == null ? null : JsonSerializer.Serialize(steps, JsonOptions),
                json => json == null ? null : JsonSerializer.Deserialize<List<TaperStep>>(json, JsonOptions),
                new ValueComparer<List<TaperStep>>(
                    (a, b) => JsonSerializer.Serialize(a, JsonOptions) == JsonSerializer.Serialize(b, JsonOptions),
                    steps => JsonSerializer.Serialize(steps, JsonOptions).GetHashCode(),
                    steps => steps == null ? null : JsonSerializer.Deserialize<List<TaperStep>>(JsonSerializer.Serialize(steps, JsonOptions), JsonOptions)));
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
