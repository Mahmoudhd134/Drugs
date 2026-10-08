using Drags.Api.Controllers;
using Drags.Api.Database;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Drugs;

public class DrugsController(AppDbContext context) : BaseApiController
{
    [HttpGet]
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
            .Select(d => new DrugDto(d.Id, d.Name, d.Description))
            .ToListAsync();

        return new PagedResult<DrugDto>(drugs, totalCount, page, pageSize);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<DrugDto>> GetById(int id)
    {
        var drug = await context.Drugs.FindAsync(id);
        return drug is null ? NotFound() : drug.ToDto();
    }

    [HttpPost]
    public async Task<ActionResult<DrugDto>> Create([FromBody] SaveDrugRequest request)
    {
        if (ErrorCodes.ValidateName(request.Name) is { } error)
            return ApiError(error);

        var drug = new Drug();
        drug.Apply(request);
        context.Drugs.Add(drug);
        await context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = drug.Id }, drug.ToDto());
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DrugDto>> Update(int id, [FromBody] SaveDrugRequest request)
    {
        if (ErrorCodes.ValidateName(request.Name) is { } error)
            return ApiError(error);

        var drug = await context.Drugs.FindAsync(id);
        if (drug is null)
            return NotFound();

        drug.Apply(request);
        await context.SaveChangesAsync();
        return drug.ToDto();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var drug = await context.Drugs.FindAsync(id);
        if (drug is null)
            return NotFound();

        context.Drugs.Remove(drug);
        await context.SaveChangesAsync();
        return NoContent();
    }
}
