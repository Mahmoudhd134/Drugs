using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.DeleteDrug;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrug;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugGroupNames;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;
using ClinicHub.Domain.Catalog;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Drugs;

public record SaveDrugRequest(string Name, string Description, Dosing DefaultDosing);

[Authorize(Policy = AuthPolicies.ClinicContext)]
public class DrugsController(ISender sender) : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.Drugs.List)]
    public async Task<ActionResult<PagedResult<DrugDto>>> GetAll(string search = "", int page = 1, int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetDrugsQuery(search, page, pageSize), cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<ActionResult<DrugDto>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetDrugQuery(id), cancellationToken)).ToOk();

    [HttpPost]
    [HasPermission(Permissions.Drugs.Create)]
    public async Task<ActionResult<DrugDto>> Create([FromBody] SaveDrugRequest request, CancellationToken cancellationToken) =>
        (await sender.Send(new CreateDrugCommand(request.Name, request.Description, request.DefaultDosing), cancellationToken))
        .ToCreated(nameof(GetById), drug => new { id = drug.Id });

    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Drugs.Update)]
    public async Task<ActionResult<DrugDto>> Update(int id, [FromBody] SaveDrugRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateDrugCommand(id, request.Name, request.Description, request.DefaultDosing),
            cancellationToken)).ToOk();

    /// <summary>Names of the groups that contain this drug (shown before deleting it).</summary>
    [HttpGet("{id:int}/groups")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<ActionResult<List<string>>> GetGroups(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetDrugGroupNamesQuery(id), cancellationToken)).ToOk();

    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Drugs.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteDrugCommand(id), cancellationToken)).ToNoContent();
}
