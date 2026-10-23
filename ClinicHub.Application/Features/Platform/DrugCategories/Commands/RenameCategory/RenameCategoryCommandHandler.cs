using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameCategory;

internal sealed class RenameCategoryCommandHandler(IAppDbContext db) : ICommandHandler<RenameCategoryCommand, CategoryDto>
{
    public async Task<Result<CategoryDto>> Handle(RenameCategoryCommand request, CancellationToken cancellationToken)
    {
        // The row's own names (another case or hamza of them) are allowed
        var siblings = await db.Categories.AsNoTracking()
            .Where(c => c.Id != request.Id)
            .Select(c => new { c.NameEn, c.NameAr })
            .ToListAsync(cancellationToken);
        var taken = CategoryRules.NameTaken(siblings.Select(s => (s.NameEn, s.NameAr)), request.NameEn, request.NameAr,
            CategoryErrors.NameTaken);
        if (taken is not null)
            return taken;

        var category = await db.Categories.Include(c => c.SubCategories)
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
        if (category is null)
            return CategoryErrors.NotFound;

        category.NameEn = request.NameEn.Trim();
        category.NameAr = request.NameAr.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return category.ToDto();
    }
}
