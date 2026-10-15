using ClinicHub.Domain.Common;
using ClinicHub.Domain.Platform;
using ClinicHub.Infrastructure.Database.Configurations.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Platform;

public class ClinicConfiguration : IEntityTypeConfiguration<Clinic>
{
    public void Configure(EntityTypeBuilder<Clinic> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(20).IsRequired();
        builder.HasSearchName(nameof(Clinic.Name));
        // Only one template clinic
        builder.HasIndex(x => x.IsTemplate).IsUnique().HasFilter("\"IsTemplate\"");
    }
}
