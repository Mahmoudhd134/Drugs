using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;

/// <summary>Replaces the name and every line (order and overrides).</summary>
public record UpdateProtocolCommand(int Id, string Name, List<SaveProtocolItem> Items)
    : ICommand<ProtocolDto>;
