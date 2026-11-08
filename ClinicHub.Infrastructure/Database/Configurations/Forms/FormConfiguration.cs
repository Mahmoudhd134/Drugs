using ClinicHub.Domain.Common;
using ClinicHub.Domain.Forms;
using ClinicHub.Infrastructure.Database.Configurations.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Forms;

/// <summary>
/// Platform rows (design dynamic-forms § 4.1). EF knows only <c>FormVersions.FormId</c> → <c>Forms.Id</c>; the cycle's other
/// foreign key, (<c>Id</c>, <c>ActiveVersionNumber</c>) to the versions, is deferrable and lives in the migration's raw SQL.
/// </summary>
public class FormConfiguration : IEntityTypeConfiguration<Form>
{
    public void Configure(EntityTypeBuilder<Form> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.Property(x => x.IsDeleted).HasDefaultValue(false);
        builder.HasSearchName(nameof(Form.Name));
        builder.HasMany(x => x.Versions).WithOne().HasForeignKey(x => x.FormId).OnDelete(DeleteBehavior.Restrict);
    }
}
