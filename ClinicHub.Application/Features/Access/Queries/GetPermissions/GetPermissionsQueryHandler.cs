using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access.Queries.GetPermissions;

internal sealed class GetPermissionsQueryHandler : IQueryHandler<GetPermissionsQuery, IReadOnlyList<PermissionDefinition>>
{
    public Task<Result<IReadOnlyList<PermissionDefinition>>> Handle(GetPermissionsQuery query,
        CancellationToken cancellationToken) =>
        Task.FromResult(Result<IReadOnlyList<PermissionDefinition>>.Success(PermissionCatalog.All));
}
