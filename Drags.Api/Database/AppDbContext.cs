using Drags.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Database;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Drag> Drags { get; set; }
    public DbSet<Combo> Combos { get; set; }
    public DbSet<ComboDrag> ComboDrags { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Drag>(builder =>
        {
            builder.HasKey(x => x.Id);

            builder.Property(x => x.Name).HasMaxLength(128).IsRequired();
        });


        modelBuilder.Entity<ComboDrag>(buidler =>
        {
            buidler.HasOne(x => x.Combo).WithMany(x => x.ComboDrags);
            buidler.HasOne(x => x.Drag).WithMany(x => x.ComboDrags);
        });

        base.OnModelCreating(modelBuilder);
    }
}