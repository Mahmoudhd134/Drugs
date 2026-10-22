using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameSubCategory;

internal sealed class RenameSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<RenameSubCategoryCommand, SubCategoryDto>
{
    public Task<Result<SubCategoryDto>> Handle(RenameSubCategoryCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
