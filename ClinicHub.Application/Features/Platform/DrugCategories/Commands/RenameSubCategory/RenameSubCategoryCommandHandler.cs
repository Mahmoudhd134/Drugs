using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameSubCategory;

internal sealed class RenameSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<RenameSubCategoryCommand, SubCategoryDto>
{
    public async Task<Result<SubCategoryDto>> Handle(RenameSubCategoryCommand request, CancellationToken cancellationToken)
    {
        // Its category is not loaded: renaming never touches the parent row (D5)
        var subCategory = await db.SubCategories.FirstOrDefaultAsync(s => s.Id == request.Id, cancellationToken);
        if (subCategory is null)
            return CategoryErrors.SubCategoryMissing;

        var siblings = await db.SubCategories.AsNoTracking()
            .Where(s => s.CategoryId == subCategory.CategoryId && s.Id != subCategory.Id)
            .Select(s => new { s.NameEn, s.NameAr })
            .ToListAsync(cancellationToken);
        var taken = CategoryRules.NameTaken(siblings.Select(s => (s.NameEn, s.NameAr)), request.NameEn, request.NameAr,
            CategoryErrors.SubCategoryNameTaken);
        if (taken is not null)
            return taken;

        subCategory.NameEn = request.NameEn.Trim();
        subCategory.NameAr = request.NameAr.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return subCategory.ToDto();
    }
}
