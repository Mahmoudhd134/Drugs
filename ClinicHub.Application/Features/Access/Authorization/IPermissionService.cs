using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access.Authorization;

/// <summary>The caller's access to the request's clinic and their permissions there (rules only; storage is <see cref="IAccessCache"/>).</summary>
public interface IPermissionService
{
    /// <summary>
    /// Null when the caller may act in the request's clinic; otherwise <see cref="AccessErrors.NoAccess"/>
    /// (staff gone or inactive, or the clinic deleted), <see cref="AccessErrors.ClinicSuspended"/>, or
    /// <see cref="CommonErrors.Forbidden"/> (not a clinic context).
    /// </summary>
    Task<Error> CheckClinicAccessAsync(CancellationToken cancellationToken = default);

    /// <summary>The caller's permissions in the request's clinic (<see cref="PermissionSet.None"/> without access).</summary>
    Task<PermissionSet> GetAsync(CancellationToken cancellationToken = default);
}
