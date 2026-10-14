using Drags.Domain.Common;
using Drags.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Infrastructure.Database.Configurations.Identity;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(x => x.Phone).HasMaxLength(FieldLimits.PhoneMaxLength).IsRequired();
        builder.HasIndex(x => x.Phone).IsUnique();
    }
}
