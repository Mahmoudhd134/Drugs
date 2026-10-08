using Drags.Api.Controllers;
using Drags.Api.Database;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.DrugGroups;

[Route("api/v1/drug-groups")]
public class DrugGroupsController(AppDbContext context) : BaseApiController
{
    [HttpGet]
    public async Task<PagedResult<DrugGroupDto>> GetAll(string search = "", int page = 1, int pageSize = 20)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var query = context.DrugGroups.AsNoTracking();

        var term = search?.Trim().ToLower();
        if (!string.IsNullOrEmpty(term))
            query = query.Where(g => g.Name.ToLower().Contains(term));

        var totalCount = await query.CountAsync();

        var groups = await IncludeDrugs(query
                .OrderBy(g => g.Name)
                .ThenBy(g => g.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize))
            .ToListAsync();

        return new PagedResult<DrugGroupDto>(groups.Select(g => g.ToDto()).ToList(), totalCount, page, pageSize);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<DrugGroupDto>> GetById(int id)
    {
        var group = await IncludeDrugs(context.DrugGroups.AsNoTracking()).FirstOrDefaultAsync(g => g.Id == id);
        return group is null ? NotFound() : group.ToDto();
    }

    [HttpPost]
    public async Task<ActionResult<DrugGroupDto>> Create([FromBody] SaveDrugGroupRequest request)
    {
        var drugIds = (request.DrugIds ?? []).Distinct().ToList();
        if (await Validate(request.Name, drugIds) is { } error)
            return ApiError(error);

        var group = new DrugGroup { Name = request.Name.Trim(), Items = BuildItems(drugIds) };
        context.DrugGroups.Add(group);
        await context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = group.Id }, await LoadDto(group.Id));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DrugGroupDto>> Update(int id, [FromBody] SaveDrugGroupRequest request)
    {
        var drugIds = (request.DrugIds ?? []).Distinct().ToList();
        if (await Validate(request.Name, drugIds) is { } error)
            return ApiError(error);

        var group = await context.DrugGroups.Include(g => g.Items).FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
            return NotFound();

        group.Name = request.Name.Trim();
        context.DrugGroupItems.RemoveRange(group.Items);
        group.Items = BuildItems(drugIds);

        await context.SaveChangesAsync();
        return await LoadDto(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var group = await context.DrugGroups.FindAsync(id);
        if (group is null)
            return NotFound();

        context.DrugGroups.Remove(group);
        await context.SaveChangesAsync();
        return NoContent();
    }

    private static IQueryable<DrugGroup> IncludeDrugs(IQueryable<DrugGroup> query) =>
        query.Include(g => g.Items).ThenInclude(i => i.Drug);

    private async Task<DrugGroupDto> LoadDto(int id) =>
        (await IncludeDrugs(context.DrugGroups.AsNoTracking()).FirstAsync(g => g.Id == id)).ToDto();

    private async Task<string> Validate(string name, List<int> drugIds)
    {
        if (ErrorCodes.ValidateName(name) is { } error)
            return error;

        if (drugIds.Count == 0)
            return ErrorCodes.DrugsRequired;

        var existing = await context.Drugs.CountAsync(d => drugIds.Contains(d.Id));
        return existing == drugIds.Count ? null : ErrorCodes.DrugNotFound;
    }

    private static List<DrugGroupItem> BuildItems(List<int> drugIds) =>
        drugIds.Select((drugId, index) => new DrugGroupItem { DrugId = drugId, Order = index }).ToList();
}
