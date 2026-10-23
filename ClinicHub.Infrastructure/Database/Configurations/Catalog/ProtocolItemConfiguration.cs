using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class ProtocolItemConfiguration : IEntityTypeConfiguration<ProtocolItem>
{
    public void Configure(EntityTypeBuilder<ProtocolItem> builder)
    {
        // Composite FK that includes ClinicId: the database itself keeps an item in its protocol's clinic
        builder.HasOne(x => x.Protocol).WithMany(x => x.Items)
            .HasForeignKey(x => new { x.ProtocolId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId });
        // Design M1.7 D4: a simple FK (a line may point to a shared drug, ClinicId null); "same clinic or shared" is
        // the protocol handlers' rule (drugNotFound). Cascade: an own drug's delete removes its lines
        builder.HasOne(x => x.Drug).WithMany(x => x.ProtocolItems)
            .HasForeignKey(x => x.DrugId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.OwnsOne(x => x.Dosing, DosingConfiguration.Configure);
    }
}
