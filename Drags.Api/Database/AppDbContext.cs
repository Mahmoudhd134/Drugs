using Drags.Api.Models;
using Microsoft.EntityFrameworkCore;

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
}
