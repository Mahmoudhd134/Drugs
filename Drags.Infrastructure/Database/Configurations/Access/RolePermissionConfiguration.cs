using Drags.Domain.Access;
using Drags.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Infrastructure.Database.Configurations.Access;

public class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> builder)
    {
        // No DbSet (only reached through its role), so name the table here
        builder.ToTable("RolePermissions");
        builder.HasKey(x => new { x.RoleId, x.Permission });
        builder.Property(x => x.Permission).HasMaxLength(FieldLimits.PermissionMaxLength);
    }
}
