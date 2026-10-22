using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.DeleteProtocol;

/// <summary>Deletes the protocol and its lines; the drugs stay.</summary>
public record DeleteProtocolCommand(int Id) : ICommand;
