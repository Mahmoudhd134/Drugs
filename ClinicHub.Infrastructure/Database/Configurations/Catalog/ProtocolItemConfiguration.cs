using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class ProtocolItemConfiguration : IEntityTypeConfiguration<ProtocolItem>
{
    public void Configure(EntityTypeBuilder<ProtocolItem> builder)
    {
        // Composite FKs that include ClinicId: the database itself guarantees that an item, its
        // protocol and its drug belong to the same clinic
        builder.HasOne(x => x.Protocol).WithMany(x => x.Items)
            .HasForeignKey(x => new { x.ProtocolId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId });
        builder.HasOne(x => x.Drug).WithMany(x => x.ProtocolItems)
            .HasForeignKey(x => new { x.DrugId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId });
        builder.OwnsOne(x => x.Dosing, DosingConfiguration.Configure);
    }
}
