using ClinicHub.Domain.Access;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Access;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.RoleNameMaxLength).IsRequired();
        builder.HasIndex(x => new { x.ClinicId, x.Name }).IsUnique();
        // One Owner role per clinic
        builder.HasIndex(x => x.ClinicId).IsUnique().HasFilter("\"IsOwner\"").HasDatabaseName("IX_Roles_ClinicId_Owner");
        // Target of the staff roles' (RoleId, ClinicId) FK
        builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
        builder.HasMany(x => x.Permissions).WithOne().HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
    }
}
