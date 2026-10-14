using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class DrugConfiguration : IEntityTypeConfiguration<Drug>
{
    public void Configure(EntityTypeBuilder<Drug> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.HasIndex(x => new { x.ClinicId, x.Name });
        // Target of the group items' (DrugId, ClinicId) FK
        builder.HasAlternateKey(x => new { x.Id, x.ClinicId });
        builder.OwnsOne(x => x.DefaultDosing, DosingConfiguration.Configure);
    }
}
