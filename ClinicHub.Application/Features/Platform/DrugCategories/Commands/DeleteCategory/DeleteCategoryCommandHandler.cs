using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteCategory;

internal sealed class DeleteCategoryCommandHandler(IAppDbContext db) : ICommandHandler<DeleteCategoryCommand>
{
    public async Task<Result> Handle(DeleteCategoryCommand request, CancellationToken cancellationToken)
    {
        var category = await db.Categories.Include(c => c.SubCategories)
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
        if (category is null)
            return CategoryErrors.NotFound;

        // Every drug in it, with or without a subcategory: shared (withdrawn too) and every clinic's own, deleted
        // clinics included (read across clinics: Platform code)
        var drugCount = await db.Drugs.IgnoreQueryFilters().CountAsync(d => d.CategoryId == request.Id, cancellationToken);
        if (drugCount > 0)
            return new CountError(CategoryErrors.InUse, drugCount);

        // Its subcategories are empty (no drug is in the category)
        db.SubCategories.RemoveRange(category.SubCategories);
        db.Categories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
