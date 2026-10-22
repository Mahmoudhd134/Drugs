using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;

public record CreateProtocolCommand(string Name, List<SaveProtocolItem> Items)
    : ICommand<ProtocolDto>;
