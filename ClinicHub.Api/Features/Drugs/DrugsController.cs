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
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugProtocolNames;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;
using ClinicHub.Domain.Catalog;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Drugs;

/// <summary>An own drug's body (design M1.7 D8). Any other property (<c>nameAr</c>…) is ignored.</summary>
/// <param name="CategoryId">Required; missing or null → 400 <c>categoryRequired</c>.</param>
public record SaveDrugRequest(string Name, string ActiveIngredients, string Description, Dosing DefaultDosing,
    int? CategoryId, int? SubCategoryId);

[Authorize(Policy = AuthPolicies.ClinicContext)]
public class DrugsController(ISender sender) : BaseApiController
{
    /// <summary>
    /// Own + active shared drugs in the D7 order. <paramref name="source"/> and <paramref name="subCategoryId"/> bind as
    /// strings (exact values, else 400 <c>invalidRequest</c>); a malformed <paramref name="categoryId"/> → 400 (binding).
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.Drugs.List)]
    public async Task<ActionResult<PagedResult<DrugDto>>> GetAll(string search = "", string source = "", int? categoryId = null,
        string subCategoryId = "", int page = 1, int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetDrugsQuery(search, source, categoryId, subCategoryId, page, pageSize), cancellationToken)).ToOk();

    /// <summary>Own or shared (a withdrawn shared drug too: <c>withdrawn: true</c>).</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<ActionResult<DrugDto>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetDrugQuery(id), cancellationToken)).ToOk();

    [HttpPost]
    [HasPermission(Permissions.Drugs.Create)]
    public async Task<ActionResult<DrugDto>> Create([FromBody] SaveDrugRequest request, CancellationToken cancellationToken) =>
        (await sender.Send(new CreateDrugCommand(request.Name, request.ActiveIngredients, request.Description,
            request.DefaultDosing, request.CategoryId, request.SubCategoryId), cancellationToken))
        .ToCreated(nameof(GetById), drug => new { id = drug.Id });

    /// <summary>Own drugs only: a shared drug → 409 <c>sharedDrugReadOnly</c> (after the 400s and the 404).</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Drugs.Update)]
    public async Task<ActionResult<DrugDto>> Update(int id, [FromBody] SaveDrugRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateDrugCommand(id, request.Name, request.ActiveIngredients, request.Description,
            request.DefaultDosing, request.CategoryId, request.SubCategoryId), cancellationToken)).ToOk();

    /// <summary>Names of this clinic's protocols that contain this drug (own or shared; shown before deleting it).</summary>
    [HttpGet("{id:int}/protocols")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<ActionResult<List<string>>> GetProtocols(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetDrugProtocolNamesQuery(id), cancellationToken)).ToOk();

    /// <summary>Own drugs only: a shared drug → 409 <c>sharedDrugReadOnly</c> (after the 404).</summary>
    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Drugs.Delete)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteDrugCommand(id), cancellationToken)).ToNoContent();
}
