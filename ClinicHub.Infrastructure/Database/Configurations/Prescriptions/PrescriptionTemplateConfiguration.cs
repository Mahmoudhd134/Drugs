using ClinicHub.Domain.Prescriptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Prescriptions;

public class PrescriptionTemplateConfiguration : IEntityTypeConfiguration<PrescriptionTemplate>
{
    public void Configure(EntityTypeBuilder<PrescriptionTemplate> builder)
    {
        // A string without a length is `text` (design D2: no jsonb, nothing queries inside it)
        builder.Property(x => x.Layout).IsRequired();
        // One template per clinic (design D4)
        builder.HasIndex(x => x.ClinicId).IsUnique();
    }
}
