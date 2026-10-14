using Drags.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Infrastructure.Database.Configurations.Catalog;

public class DrugGroupItemConfiguration : IEntityTypeConfiguration<DrugGroupItem>
{
    public void Configure(EntityTypeBuilder<DrugGroupItem> builder)
    {
        // Composite FKs that include ClinicId: the database itself guarantees that an item, its
        // group and its drug belong to the same clinic
        builder.HasOne(x => x.DrugGroup).WithMany(x => x.Items)
            .HasForeignKey(x => new { x.DrugGroupId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId });
        builder.HasOne(x => x.Drug).WithMany(x => x.GroupItems)
            .HasForeignKey(x => new { x.DrugId, x.ClinicId })
            .HasPrincipalKey(x => new { x.Id, x.ClinicId });
        builder.OwnsOne(x => x.Dosing, DosingConfiguration.Configure);
    }
}
