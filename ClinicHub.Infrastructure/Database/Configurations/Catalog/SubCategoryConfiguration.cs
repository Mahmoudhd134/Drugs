using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class SubCategoryConfiguration : IEntityTypeConfiguration<SubCategory>
{
    public void Configure(EntityTypeBuilder<SubCategory> builder)
    {
        builder.Property(x => x.NameEn).HasMaxLength(FieldLimits.CategoryNameMaxLength).IsRequired();
        builder.Property(x => x.NameAr).HasMaxLength(FieldLimits.CategoryNameMaxLength).IsRequired();
        builder.HasOne(x => x.Category).WithMany(x => x.SubCategories)
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
        // Target of the drugs' (SubCategoryId, CategoryId) FK; also keeps a subcategory in its category (a key part
        // can't change)
        builder.HasAlternateKey(x => new { x.Id, x.CategoryId });
    }
}
