using Drags.Api.Database;
using Drags.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Controllers;

public class DragsController(AppDbContext context) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<List<Drag>>> GetAll(string name = "", int pageIndex = 0, int pageSize = 10)
    {
        var query = context.Drags.AsQueryable();

        if (!string.IsNullOrWhiteSpace(name))
        {
            var nameLower = name.ToLower();
            query = query.Where(x => x.Name.ToLower().Contains(nameLower));
        }

        var results = await query
            .Skip(pageIndex * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(results);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Drag>> GetById(int id)
    {
        var drag = await context.Drags.FindAsync(id);
        if (drag is null)
            return NotFound();

        return Ok(drag);
    }

    [HttpPost]
    public async Task<ActionResult<Drag>> Create([FromBody] Drag drag)
    {
        context.Drags.Add(drag);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = drag.Id }, drag);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] Drag updated)
    {
        var existing = await context.Drags.FindAsync(id);
        if (existing is null)
            return NotFound();

        existing.Name = updated.Name;
        existing.Description = updated.Description;

        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var drag = await context.Drags.FindAsync(id);
        if (drag is null)
            return NotFound();

        context.Drags.Remove(drag);
        await context.SaveChangesAsync();
        return NoContent();
    }
}
