using Drags.Api.Controllers;
using Drags.Api.Features.Access;
using Drags.Api.Features.Identity;
using Drags.Api.Shared;
using Drags.Domain.Catalog;
using Drags.Infrastructure.Database;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Drugs;

[Authorize(Policy = AuthPolicies.ClinicContext)]
public class DrugsController(AppDbContext context) : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.Drugs.List)]
    public async Task<PagedResult<DrugDto>> GetAll(string search = "", int page = 1, int pageSize = 20)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var query = context.Drugs.AsNoTracking();

        var term = search?.Trim().ToLower();
        if (!string.IsNullOrEmpty(term))
            query = query.Where(d => d.Name.ToLower().Contains(term));

        var totalCount = await query.CountAsync();

        var ordered = string.IsNullOrEmpty(term)
            ? query.OrderBy(d => d.Name)
            // Names that start with the search term first
            : query.OrderBy(d => d.Name.ToLower().StartsWith(term) ? 0 : 1).ThenBy(d => d.Name);

        var drugs = await ordered
            .ThenBy(d => d.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return new PagedResult<DrugDto>(drugs.Select(d => d.ToDto()).ToList(), totalCount, page, pageSize);
    }

    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<ActionResult<DrugDto>> GetById(int id)
    {
        var drug = await context.Drugs.FirstOrDefaultAsync(d => d.Id == id);
        return drug is null ? NotFound() : drug.ToDto();
    }

    [HttpPost]
    [HasPermission(Permissions.Drugs.Create)]
    public async Task<ActionResult<DrugDto>> Create([FromBody] SaveDrugRequest request)
    {
        if (request.Validate() is { } error)
            return ApiError(error);

        var drug = new Drug();
        drug.Apply(request);
        context.Drugs.Add(drug);
        await context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = drug.Id }, drug.ToDto());
    }

    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Drugs.Update)]
    public async Task<ActionResult<DrugDto>> Update(int id, [FromBody] SaveDrugRequest request)
    {
        if (request.Validate() is { } error)
            return ApiError(error);

        var drug = await context.Drugs.FirstOrDefaultAsync(d => d.Id == id);
        if (drug is null)
            return NotFound();

        drug.Apply(request);
        await context.SaveChangesAsync();
        return drug.ToDto();
    }

    /// <summary>Names of the groups that contain this drug (shown before deleting it).</summary>
    [HttpGet("{id:int}/groups")]
    [HasPermission(Permissions.Drugs.Details)]
    public async Task<List<string>> GetGroups(int id) =>
        await context.DrugGroupItems.AsNoTracking()
            .Where(i => i.DrugId == id)
            .Select(i => i.DrugGroup.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToListAsync();

    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Drugs.Delete)]
    public async Task<IActionResult> Delete(int id)
    {
        var drug = await context.Drugs.FirstOrDefaultAsync(d => d.Id == id);
        if (drug is null)
            return NotFound();

        context.Drugs.Remove(drug);
        await context.SaveChangesAsync();
        return NoContent();
    }
}
