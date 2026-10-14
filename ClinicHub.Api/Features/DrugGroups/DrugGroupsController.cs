using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.CreateDrugGroup;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.DeleteDrugGroup;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.UpdateDrugGroup;
using ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroup;
using ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroups;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.DrugGroups;

/// <param name="Items">In order; each position becomes the line's order.</param>
public record SaveDrugGroupRequest(string Name, List<SaveDrugGroupItem> Items);

[Route("api/v1/drug-groups")]
[Authorize(Policy = AuthPolicies.ClinicContext)]
public class DrugGroupsController(ISender sender) : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.Groups.List)]
    public async Task<ActionResult<PagedResult<DrugGroupDto>>> GetAll(string search = "", int page = 1,
        int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetDrugGroupsQuery(search, page, pageSize), cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Groups.Details)]
    public async Task<ActionResult<DrugGroupDto>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetDrugGroupQuery(id), cancellationToken)).ToOk();

    [HttpPost]
    [HasPermission(Permissions.Groups.Create)]
    public async Task<ActionResult<DrugGroupDto>> Create([FromBody] SaveDrugGroupRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateDrugGroupCommand(request.Name, request.Items), cancellationToken))
        .ToCreated(nameof(GetById), group => new { id = group.Id });

    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Groups.Update)]
    public async Task<ActionResult<DrugGroupDto>> Update(int id, [FromBody] SaveDrugGroupRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateDrugGroupCommand(id, request.Name, request.Items), cancellationToken)).ToOk();

    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Groups.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteDrugGroupCommand(id), cancellationToken)).ToNoContent();
}
