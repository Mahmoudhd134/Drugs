using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameCategory;

internal sealed class RenameCategoryCommandHandler(IAppDbContext db) : ICommandHandler<RenameCategoryCommand, CategoryDto>
{
    public Task<Result<CategoryDto>> Handle(RenameCategoryCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
