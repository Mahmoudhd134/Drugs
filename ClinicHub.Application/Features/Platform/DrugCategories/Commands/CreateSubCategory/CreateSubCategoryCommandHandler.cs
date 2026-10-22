using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateSubCategory;

internal sealed class CreateSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<CreateSubCategoryCommand, SubCategoryDto>
{
    public Task<Result<SubCategoryDto>> Handle(CreateSubCategoryCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
