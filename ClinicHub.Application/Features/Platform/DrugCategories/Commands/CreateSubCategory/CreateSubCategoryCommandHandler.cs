using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateSubCategory;

internal sealed class CreateSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<CreateSubCategoryCommand, SubCategoryDto>
{
    public async Task<Result<SubCategoryDto>> Handle(CreateSubCategoryCommand request, CancellationToken cancellationToken)
    {
        if (!await db.Categories.AnyAsync(c => c.Id == request.CategoryId, cancellationToken))
            return CategoryErrors.NotFound;

        var siblings = await db.SubCategories.AsNoTracking()
            .Where(s => s.CategoryId == request.CategoryId)
            .Select(s => new { s.NameEn, s.NameAr })
            .ToListAsync(cancellationToken);
        var taken = CategoryRules.NameTaken(siblings.Select(s => (s.NameEn, s.NameAr)), request.NameEn, request.NameAr,
            CategoryErrors.SubCategoryNameTaken);
        if (taken is not null)
            return taken;

        // Added by its foreign key only: the category row is never loaded nor touched (D5)
        var subCategory = new SubCategory
        {
            CategoryId = request.CategoryId,
            NameEn = request.NameEn.Trim(),
            NameAr = request.NameAr.Trim(),
        };
        db.SubCategories.Add(subCategory);
        await db.SaveChangesAsync(cancellationToken);
        return subCategory.ToDto();
    }
}
