using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocol;

public record GetProtocolQuery(int Id) : IQuery<ProtocolDto>;
