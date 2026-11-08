using ClinicHub.Domain.Forms;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Forms;

public class FormVersionConfiguration : IEntityTypeConfiguration<FormVersion>
{
    public void Configure(EntityTypeBuilder<FormVersion> builder)
    {
        builder.HasKey(x => new { x.FormId, x.VersionNumber });
        // A string without a length is `text`: nothing queries inside it
        builder.Property(x => x.Definition).IsRequired();
    }
}
