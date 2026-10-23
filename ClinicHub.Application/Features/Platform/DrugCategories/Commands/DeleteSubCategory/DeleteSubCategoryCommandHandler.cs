using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteSubCategory;

internal sealed class DeleteSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<DeleteSubCategoryCommand>
{
    public async Task<Result> Handle(DeleteSubCategoryCommand request, CancellationToken cancellationToken)
    {
        var subCategory = await db.SubCategories.FirstOrDefaultAsync(s => s.Id == request.Id, cancellationToken);
        if (subCategory is null)
            return CategoryErrors.SubCategoryMissing;

        // Shared (withdrawn too) and every clinic's own drugs, deleted clinics included (Platform code)
        var drugCount = await db.Drugs.IgnoreQueryFilters().CountAsync(d => d.SubCategoryId == request.Id, cancellationToken);
        if (drugCount > 0)
            return new CountError(CategoryErrors.SubCategoryInUse, drugCount);

        db.SubCategories.Remove(subCategory);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
