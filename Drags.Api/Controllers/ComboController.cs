using Drags.Api.Controllers;
using Drags.Api.Database;
using Drags.Api.Models;
using Microsoft.AspNetCore.Mvc;

public class ComboController(AppDbContext context) : BaseApiController
{
    [HttpPost]
    public async Task<int> Create(Combo combo)
    {
        context.Combos.Add(combo);
        await context.SaveChangesAsync();
        return combo.Id;
    }
}