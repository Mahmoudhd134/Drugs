using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using ClinicHub.Infrastructure.Database.Configurations.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Catalog;

public class DrugConfiguration : IEntityTypeConfiguration<Drug>
{
    public void Configure(EntityTypeBuilder<Drug> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(FieldLimits.NameMaxLength).IsRequired();
        builder.Property(x => x.NameAr).HasMaxLength(FieldLimits.NameMaxLength);
        builder.Property(x => x.ActiveIngredients).HasMaxLength(FieldLimits.ActiveIngredientsMaxLength);
        builder.HasIndex(x => new { x.ClinicId, x.Name });
        builder.HasIndex(x => new { x.CategoryId, x.SubCategoryId });
        builder.HasSearchName(nameof(Drug.Name));
        builder.HasSearchOther();
        builder.OwnsOne(x => x.DefaultDosing, DosingConfiguration.Configure);

        // Design M1.7 D4: every drug has a category; a drug's subcategory always belongs to its category (composite FK
        // to the subcategories' alternate key; MATCH SIMPLE skips it when SubCategoryId is null). Restrict: a used
        // (sub)category can't be deleted, even by a bug
        builder.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.SubCategory).WithMany()
            .HasForeignKey(x => new { x.SubCategoryId, x.CategoryId })
            .HasPrincipalKey(x => new { x.Id, x.CategoryId })
            .OnDelete(DeleteBehavior.Restrict);
    }
}
