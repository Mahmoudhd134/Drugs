using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Categories.Queries.GetCategories;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Drugs;

/// <summary>The clinic's read of the platform categories (design M1.7 D5, D8): needs <c>drugs.list</c>.</summary>
[Route("api/v1/drug-categories")]
[Authorize(Policy = AuthPolicies.ClinicContext)]
public class DrugCategoriesController(ISender sender) : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.Drugs.List)]
    public async Task<ActionResult<List<CategoryDto>>> GetAll(CancellationToken cancellationToken) =>
        (await sender.Send(new GetCategoriesQuery(), cancellationToken)).ToOk();
}
