using System.Text.Json;
using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;
using ClinicHub.Application.Features.Forms.Definitions.Commands.DeleteForm;
using ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;
using ClinicHub.Application.Features.Forms.Definitions.Queries.GetForm;
using ClinicHub.Application.Features.Forms.Definitions.Queries.GetForms;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Forms;

/// <param name="Definition">Nullable so a missing one reaches the validator (<c>formDefinitionInvalid</c>).</param>
public record SaveFormRequest(string Name, JsonElement? Definition);

/// <summary>
/// The super admin's forms (design dynamic-forms § 4.3). Platform rows: no clinic and no permission keys, so a clinic token
/// answers 403. A missing or deleted id answers 404 <c>notFound</c>.
/// </summary>
[Route("api/v1/admin/forms")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
public class AdminFormsController(ISender sender) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<FormSummary>>> GetAll(string search = "", int page = 1, int pageSize = 20,
        CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetFormsQuery(search, page, pageSize), cancellationToken)).ToOk();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<FormDetails>> GetById(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new GetFormQuery(id), cancellationToken)).ToOk();

    /// <summary>201 + the form, with version 1 active.</summary>
    [HttpPost]
    public async Task<ActionResult<FormDetails>> Create([FromBody] SaveFormRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateFormCommand(request.Name, request.Definition), cancellationToken))
        .ToCreated(nameof(GetById), form => new { id = form.Id });

    [HttpPut("{id:int}")]
    public async Task<ActionResult<FormDetails>> Save(int id, [FromBody] SaveFormRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new SaveFormCommand(id, request.Name, request.Definition), cancellationToken)).ToOk();

    /// <summary>Soft delete → 204; no route restores a form.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteFormCommand(id), cancellationToken)).ToNoContent();
}
