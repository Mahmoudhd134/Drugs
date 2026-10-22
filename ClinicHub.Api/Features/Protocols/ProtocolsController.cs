using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.DeleteProtocol;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;
using ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocol;
using ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocols;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Protocols;

/// <param name="Items">In order; each position becomes the line's order.</param>
public record SaveProtocolRequest(string Name, List<SaveProtocolItem> Items);

[Route("api/v1/protocols")]
[Authorize(Policy = AuthPolicies.ClinicContext)]
public class ProtocolsController(ISender sender) : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.Protocols.List)]
    public async Task<ActionResult<PagedResult<ProtocolDto>>> GetAll(string search = "", int page = 1,
        int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetProtocolsQuery(search, page, pageSize), cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Protocols.Details)]
    public async Task<ActionResult<ProtocolDto>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetProtocolQuery(id), cancellationToken)).ToOk();

    [HttpPost]
    [HasPermission(Permissions.Protocols.Create)]
    public async Task<ActionResult<ProtocolDto>> Create([FromBody] SaveProtocolRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateProtocolCommand(request.Name, request.Items), cancellationToken))
        .ToCreated(nameof(GetById), protocol => new { id = protocol.Id });

    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Protocols.Update)]
    public async Task<ActionResult<ProtocolDto>> Update(int id, [FromBody] SaveProtocolRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateProtocolCommand(id, request.Name, request.Items), cancellationToken)).ToOk();

    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Protocols.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteProtocolCommand(id), cancellationToken)).ToNoContent();
}
