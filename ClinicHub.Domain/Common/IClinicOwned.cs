namespace ClinicHub.Domain.Common;

/// <summary>
/// A row that belongs to one clinic. <c>AppDbContext</c> filters every query on these
/// types to the current clinic, and fills <see cref="ClinicId"/> on insert (see <c>IClinicContext</c>).
/// </summary>
public interface IClinicOwned
{
    int ClinicId { get; set; }
}
