using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocols;

/// <summary>A page of protocols by name, each with its items.</summary>
public record GetProtocolsQuery(string Search, int Page, int PageSize) : IQuery<PagedResult<ProtocolDto>>;
