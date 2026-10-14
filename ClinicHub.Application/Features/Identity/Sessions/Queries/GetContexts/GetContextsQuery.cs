using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Sessions.Queries.GetContexts;

/// <summary>The contexts the caller may switch to.</summary>
public record GetContextsQuery : IQuery<List<ContextDto>>;
