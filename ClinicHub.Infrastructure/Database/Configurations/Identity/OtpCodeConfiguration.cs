using ClinicHub.Domain.Common;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Identity;

public class OtpCodeConfiguration : IEntityTypeConfiguration<OtpCode>
{
    public void Configure(EntityTypeBuilder<OtpCode> builder)
    {
        builder.Property(x => x.Phone).HasMaxLength(FieldLimits.PhoneMaxLength).IsRequired();
        builder.Property(x => x.CodeHash).HasMaxLength(100).IsRequired();
        builder.HasIndex(x => new { x.Phone, x.CreatedAt });
    }
}
