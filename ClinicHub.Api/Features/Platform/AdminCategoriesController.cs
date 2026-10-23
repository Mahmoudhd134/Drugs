using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Platform.DrugCategories;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateSubCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteSubCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameSubCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Queries.GetAdminCategories;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

/// <summary>Both names of a category or subcategory (a <c>categoryId</c> in a subcategory's PUT body is ignored).</summary>
public record SaveCategoryRequest(string NameEn, string NameAr);

/// <summary>
/// The super admin's categories (design M1.7 D5, D8): <c>/admin/drug-categories*</c> and
/// <c>/admin/drug-subcategories/{id}</c>. A blocked delete answers 409 with <c>drugCount</c>.
/// </summary>
[Route("api/v1/admin")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
public class AdminCategoriesController(ISender sender) : BaseApiController
{
    /// <summary>Every category and subcategory with <c>drugCount</c>, <c>deletedClinicsDrugCount</c> (+ <c>noSubCategoryDrugCount</c>).</summary>
    [HttpGet("drug-categories")]
    public async Task<ActionResult<List<AdminCategoryDto>>> GetAll(CancellationToken cancellationToken) =>
        (await sender.Send(new GetAdminCategoriesQuery(), cancellationToken)).ToOk();

    [HttpPost("drug-categories")]
    public async Task<ActionResult<CategoryDto>> Create([FromBody] SaveCategoryRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateCategoryCommand(request.NameEn, request.NameAr), cancellationToken))
        .ToCreated(nameof(GetAll), _ => null);

    [HttpPut("drug-categories/{id:int}")]
    public async Task<ActionResult<CategoryDto>> Rename(int id, [FromBody] SaveCategoryRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new RenameCategoryCommand(id, request.NameEn, request.NameAr), cancellationToken)).ToOk();

    [HttpDelete("drug-categories/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteCategoryCommand(id), cancellationToken)).ToNoContent();

    [HttpPost("drug-categories/{id:int}/subcategories")]
    public async Task<ActionResult<SubCategoryDto>> CreateSubCategory(int id, [FromBody] SaveCategoryRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new CreateSubCategoryCommand(id, request.NameEn, request.NameAr), cancellationToken))
        .ToCreated(nameof(GetAll), _ => null);

    [HttpPut("drug-subcategories/{id:int}")]
    public async Task<ActionResult<SubCategoryDto>> RenameSubCategory(int id, [FromBody] SaveCategoryRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new RenameSubCategoryCommand(id, request.NameEn, request.NameAr), cancellationToken)).ToOk();

    [HttpDelete("drug-subcategories/{id:int}")]
    public async Task<IActionResult> DeleteSubCategory(int id, CancellationToken cancellationToken) =>
        (await sender.Send(new DeleteSubCategoryCommand(id), cancellationToken)).ToNoContent();
}
