namespace ClinicHub.Application.Features.Identity.Queries.GetMe;

public record MeUserDto(int Id, string Phone, bool IsSuperAdmin);

public record MeStaffDto(int Id, string FullName);

public record MeDto(MeUserDto User, ContextDto Context, MeStaffDto Staff, List<string> Permissions);
