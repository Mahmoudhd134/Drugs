namespace ClinicHub.Domain.Common;

/// <summary>
/// A row that is either one clinic's (<see cref="ClinicId"/> set) or shared by the whole platform (null): <c>Drug</c>
/// (design M1.7 D1) and <c>Attachment</c> (docs/design/attachments.md § 4, a platform file). <c>AppDbContext</c> filters
/// every query on these types to the current clinic's rows plus the shared ones (a request with no clinic sees only the
/// shared rows); the save interceptor stamps a new row with the current clinic and lets a shared row be written only
/// inside <c>IClinicScope.UseSharedCatalog()</c> (D2).
/// </summary>
public interface IClinicOrShared
{
    int? ClinicId { get; set; }
}
