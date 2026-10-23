using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.CreateSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.RestoreSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.UpdateSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.WithdrawSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrugs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

/// <summary>A shared drug's body: no dosing (a <c>defaultDosing</c> property is ignored), no Arabic name.</summary>
public record SaveSharedDrugRequest(string Name, string ActiveIngredients, string Description, int? CategoryId,
    int? SubCategoryId);

/// <summary>
/// The super admin's shared catalog (design M1.7 D8). Platform requests: the filter shows only shared drugs, so an own
/// drug's id is 404 <c>notFound</c> («The shared drug does not exist.»).
/// </summary>
[Route("api/v1/admin/drugs")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
public class AdminDrugsController(ISender sender) : BaseApiController
{
    /// <summary><paramref name="status"/>: <c>active</c> (default) | <c>withdrawn</c> | <c>all</c>, bound like the clinic <c>source</c>.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<AdminDrugDto>>> GetAll(string search = "", string status = "",
        int? categoryId = null, string subCategoryId = "", int page = 1, int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetSharedDrugsQuery(search, status, categoryId, subCategoryId, page, pageSize),
            cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminDrugDto>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetSharedDrugQuery(id), cancellationToken)).ToOk();

    [HttpPost]
    public async Task<ActionResult<AdminDrugDto>> Create([FromBody] SaveSharedDrugRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateSharedDrugCommand(request.Name, request.ActiveIngredients, request.Description,
            request.CategoryId, request.SubCategoryId), cancellationToken))
        .ToCreated(nameof(GetById), drug => new { id = drug.Id });

    [HttpPut("{id:int}")]
    public async Task<ActionResult<AdminDrugDto>> Update(int id, [FromBody] SaveSharedDrugRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateSharedDrugCommand(id, request.Name, request.ActiveIngredients, request.Description,
            request.CategoryId, request.SubCategoryId), cancellationToken)).ToOk();

    /// <summary>«تعطيل الدواء»: 204, idempotent.</summary>
    [HttpPost("{id:int}/withdraw")]
    public async Task<IActionResult> Withdraw(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new WithdrawSharedDrugCommand(id), cancellationToken)).ToNoContent();

    /// <summary>«تفعيل الدواء»: 204, idempotent.</summary>
    [HttpPost("{id:int}/restore")]
    public async Task<IActionResult> Restore(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new RestoreSharedDrugCommand(id), cancellationToken)).ToNoContent();
}
