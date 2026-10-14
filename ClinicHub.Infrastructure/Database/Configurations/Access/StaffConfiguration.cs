using ClinicHub.Domain.Access;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Access;

public class StaffConfiguration : IEntityTypeConfiguration<Staff>
{
    public void Configure(EntityTypeBuilder<Staff> builder)
    {
        builder.Property(x => x.FullName).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.HasIndex(x => new { x.ClinicId, x.UserId }).IsUnique();
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        // Target of the staff roles' (StaffId, ClinicId) FK
        builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
    }
}
