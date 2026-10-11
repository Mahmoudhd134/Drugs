using System.Security.Claims;
using Drags.Api.Models;
using Drags.Api.Shared;

namespace Drags.Api.Features.Identity;

/// <summary><see cref="ICurrentUser"/> from the claims of the request's access token.</summary>
public class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal Principal => httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public int? UserId => IsAuthenticated ? Int(AuthClaims.UserId) : null;
    public Guid? SessionId => IsAuthenticated && Guid.TryParse(Claim(AuthClaims.SessionId), out var id) ? id : null;
    public int? ClinicId => IsClinic ? Int(AuthClaims.ClinicId) : null;
    public int? StaffId => IsClinic ? Int(AuthClaims.StaffId) : null;
    public bool IsClinic => IsAuthenticated && Claim(AuthClaims.Context) == ContextTypes.Clinic;
    public bool IsPlatform => IsAuthenticated && Claim(AuthClaims.Context) == ContextTypes.Platform;
    public bool IsSuperAdmin => IsPlatform && Claim(AuthClaims.SuperAdmin) == "true";

    private string Claim(string type) => Principal?.FindFirst(type)?.Value;
    private int? Int(string type) => int.TryParse(Claim(type), out var value) ? value : null;
}
