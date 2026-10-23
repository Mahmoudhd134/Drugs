using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateCategory;

internal sealed class CreateCategoryCommandHandler(IAppDbContext db) : ICommandHandler<CreateCategoryCommand, CategoryDto>
{
    public async Task<Result<CategoryDto>> Handle(CreateCategoryCommand request, CancellationToken cancellationToken)
    {
        var siblings = await db.Categories.AsNoTracking()
            .Select(c => new { c.NameEn, c.NameAr })
            .ToListAsync(cancellationToken);
        var taken = CategoryRules.NameTaken(siblings.Select(s => (s.NameEn, s.NameAr)), request.NameEn, request.NameAr,
            CategoryErrors.NameTaken);
        if (taken is not null)
            return taken;

        var category = new Category { NameEn = request.NameEn.Trim(), NameAr = request.NameAr.Trim() };
        db.Categories.Add(category);
        await db.SaveChangesAsync(cancellationToken);
        return category.ToDto();
    }
}
