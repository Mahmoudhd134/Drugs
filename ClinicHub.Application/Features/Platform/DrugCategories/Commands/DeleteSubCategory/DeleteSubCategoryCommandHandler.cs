using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteSubCategory;

internal sealed class DeleteSubCategoryCommandHandler(IAppDbContext db) : ICommandHandler<DeleteSubCategoryCommand>
{
    public Task<Result> Handle(DeleteSubCategoryCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
