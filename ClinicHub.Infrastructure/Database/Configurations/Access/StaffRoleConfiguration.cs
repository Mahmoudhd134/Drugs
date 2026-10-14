using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Access;

public class StaffRoleConfiguration : IEntityTypeConfiguration<StaffRole>
{
    public void Configure(EntityTypeBuilder<StaffRole> builder)
    {
        builder.HasKey(x => new { x.StaffId, x.RoleId });
        // Composite FKs that include ClinicId: the database itself guarantees that a staff member
        // only gets roles of their own clinic
        builder.HasOne(x => x.Staff).WithMany(x => x.Roles)
            .HasForeignKey(x => new { x.StaffId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId })
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Role).WithMany()
            .HasForeignKey(x => new { x.RoleId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
