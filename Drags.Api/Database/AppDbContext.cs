using Drags.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Api.Database;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public const int NameMaxLength = 256;

    public DbSet<Drug> Drugs { get; set; }
    public DbSet<DrugGroup> DrugGroups { get; set; }
    public DbSet<DrugGroupItem> DrugGroupItems { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Drug>(builder =>
        {
            builder.Property(x => x.Name).HasMaxLength(NameMaxLength).IsRequired();
            builder.OwnsOne(x => x.DefaultDosing, ConfigureDosing);
        });

        modelBuilder.Entity<DrugGroup>(builder =>
        {
            builder.Property(x => x.Name).HasMaxLength(NameMaxLength).IsRequired();
        });

        modelBuilder.Entity<DrugGroupItem>(builder =>
        {
            builder.HasOne(x => x.DrugGroup).WithMany(x => x.Items).HasForeignKey(x => x.DrugGroupId);
            builder.HasOne(x => x.Drug).WithMany(x => x.GroupItems).HasForeignKey(x => x.DrugId);
        });

        base.OnModelCreating(modelBuilder);
    }

    /// <summary>Column setup for an owned <see cref="Dosing"/> (columns are prefixed with the property name).</summary>
    private static void ConfigureDosing<TOwner>(OwnedNavigationBuilder<TOwner, Dosing> dosing) where TOwner : class
    {
        dosing.Property(x => x.DoseUnit).HasMaxLength(20);
        dosing.Property(x => x.Frequency).HasMaxLength(20);
        dosing.Property(x => x.FrequencyText).HasMaxLength(Shared.DosingRules.MaxFrequencyTextLength);
        dosing.Property(x => x.DurationUnit).HasMaxLength(20);
        dosing.Property(x => x.Eye).HasMaxLength(10);
    }
}
