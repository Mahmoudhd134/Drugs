namespace ClinicHub.Application.Features.Identity;

/// <summary>The body of a login, refresh or switch. <see cref="Context"/> is null when the user must pick one of <see cref="Contexts"/>.</summary>
public record AuthResult(string AccessToken, DateTime ExpiresAt, ContextDto Context, List<ContextDto> Contexts);
