using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using ClinicHub.Infrastructure.Database.Configurations.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class ProtocolConfiguration : IEntityTypeConfiguration<Protocol>
{
    public void Configure(EntityTypeBuilder<Protocol> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.HasIndex(x => new { x.ClinicId, x.Name });
        builder.HasSearchName(nameof(Protocol.Name));
        // Target of the protocol items' (ProtocolId, ClinicId) FK
        builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
    }
}
