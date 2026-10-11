namespace Drags.Api.Shared;

/// <summary>
/// A row that belongs to one clinic. <see cref="Database.AppDbContext"/> filters every query on these
/// types to the current clinic, and fills <see cref="ClinicId"/> on insert (see <see cref="IClinicContext"/>).
/// </summary>
public interface IClinicOwned
{
    int ClinicId { get; set; }
}
