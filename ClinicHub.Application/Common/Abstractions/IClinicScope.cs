using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// Sets the current clinic (<see cref="IClinicContext"/>) where it doesn't come from the token (scoped per
/// request): the super admin's per-clinic admin endpoints and non-HTTP code (provisioning, dev seed). Use
/// cases themselves never take a clinic id (design D2).
/// </summary>
public interface IClinicScope
{
    /// <summary>
    /// Makes <paramref name="clinicId"/> the request's clinic: <c>ClinicErrors.NotFound</c> (404 <c>notFound</c>)
    /// for a missing, deleted or template clinic; a suspended one is allowed (the super admin manages it).
    /// Entering the clinic already set is a no-op success; entering a <b>different</b> one throws (a request
    /// never changes clinic halfway). Throws inside <see cref="UseSharedCatalog"/> (a request never mixes the two).
    /// </summary>
    Task<Result> EnterAsync(int clinicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets the clinic for a block (<c>using (scope.Use(id)) { … }</c>) and restores the previous one on
    /// dispose; nestable. Not checked: for code that already knows the clinic (e.g. one it just created). Throws inside
    /// <see cref="UseSharedCatalog"/>.
    /// </summary>
    IDisposable Use(int clinicId);

    /// <summary>
    /// Opens shared-catalog writing for a block (<c>using (scope.UseSharedCatalog()) { … }</c>; design M1.7 D2): sets
    /// <see cref="IClinicContext.WritingSharedCatalog"/> and restores it on dispose (nestable: writing stays open until
    /// the outermost block is disposed). Throws when a clinic is in context. Only the admin catalog handlers
    /// (<c>Features/Platform/SharedDrugs</c>) call it.
    /// </summary>
    IDisposable UseSharedCatalog();
}
