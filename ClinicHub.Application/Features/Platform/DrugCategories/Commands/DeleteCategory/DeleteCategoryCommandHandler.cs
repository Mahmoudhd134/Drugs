using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteCategory;

internal sealed class DeleteCategoryCommandHandler(IAppDbContext db) : ICommandHandler<DeleteCategoryCommand>
{
    public Task<Result> Handle(DeleteCategoryCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
