using Drags.Domain.Identity;
using Drags.Domain.Platform;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Infrastructure.Database.Configurations.Identity;

public class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        // Concurrency token: two refreshes racing with the same token can't both rotate it
        builder.Property(x => x.RefreshTokenHash).HasMaxLength(100).IsRequired().IsConcurrencyToken();
        builder.HasIndex(x => x.RefreshTokenHash).IsUnique();
        builder.Property(x => x.PreviousRefreshTokenHash).HasMaxLength(100);
        builder.HasIndex(x => x.PreviousRefreshTokenHash);
        builder.Property(x => x.ContextType).HasMaxLength(20);
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
    }
}
