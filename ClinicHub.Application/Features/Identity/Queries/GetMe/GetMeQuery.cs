using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Queries.GetMe;

/// <summary>The caller's user, context, staff and permissions (never in the token: the SPA reads them here).</summary>
public record GetMeQuery : IQuery<MeDto>;
