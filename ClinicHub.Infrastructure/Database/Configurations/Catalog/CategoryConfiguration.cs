using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

/// <summary>Platform rows (design M1.7 D5): no clinic column, no query filter; names unique by handler check only.</summary>
public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.Property(x => x.NameEn).HasMaxLength(FieldLimits.CategoryNameMaxLength).IsRequired();
        builder.Property(x => x.NameAr).HasMaxLength(FieldLimits.CategoryNameMaxLength).IsRequired();
    }
}
