using ClinicHub.Application.Features.Identity.Sessions;

namespace ClinicHub.Application.Features.Identity.Users.Queries.GetMe;

public record MeUserDto(int Id, string Phone, bool IsSuperAdmin);

public record MeStaffDto(int Id, string FullName);

public record MeDto(MeUserDto User, ContextDto Context, MeStaffDto Staff, List<string> Permissions);
