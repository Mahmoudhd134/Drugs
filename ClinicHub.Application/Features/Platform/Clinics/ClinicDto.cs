namespace ClinicHub.Application.Features.Platform.Clinics;

/// <param name="Status">One of <c>ClinicStatus</c> (<c>active</c>, <c>suspended</c>).</param>
/// <param name="StaffCount">Active staff.</param>
public record ClinicSummary(int Id, string Name, string Status, int StaffCount, DateTime CreatedAt);

/// <summary>An active staff member holding the Owner role.</summary>
public record ClinicOwner(int StaffId, string FullName, string Phone);

/// <summary><see cref="ClinicSummary"/> plus the owners (clinic names are not unique: they tell clinics apart).</summary>
public record ClinicDetails(int Id, string Name, string Status, int StaffCount, DateTime CreatedAt,
    List<ClinicOwner> Owners);
