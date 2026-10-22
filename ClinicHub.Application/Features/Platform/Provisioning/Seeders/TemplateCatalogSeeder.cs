using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Provisioning.Seeders;

/// <summary>
/// Step 30: a copy of the template clinic's own drugs, then of its protocols (design M1.7 § 9, M1.7b). A protocol line
/// keeps a shared drug's id (shared drugs are everyone's; a withdrawn one too) and points a template own drug's line to
/// its copy. The template is read across clinics (<c>IgnoreQueryFilters()</c>, read only: Platform code); the copies
/// are new rows of the current clinic, so later template edits don't change this clinic. In memory: fine for
/// templates of hundreds of drugs (design D5, limits).
/// </summary>
internal sealed class TemplateCatalogSeeder(IAppDbContext db) : IClinicSeeder
{
    public int Order => 30;

    public async Task SeedAsync(ClinicSeedContext context, CancellationToken cancellationToken)
    {
        var templateId = await db.Clinics.AsNoTracking()
                             .Where(c => c.IsTemplate)
                             .Select(c => (int?)c.Id)
                             .FirstOrDefaultAsync(cancellationToken)
                         ?? throw new InvalidOperationException("The template clinic does not exist.");

        // The template's own drugs only (never the shared ones)
        var templateDrugs = await db.Drugs.IgnoreQueryFilters().AsNoTracking()
            .Where(d => d.ClinicId == templateId)
            .OrderBy(d => d.Id)
            .ToListAsync(cancellationToken);

        // Template drug id → its copy (whose id is known once saved). Hand-written copies (here, the protocols'
        // and Copy below): keep them in sync with Drug, Protocol, ProtocolItem, Dosing and TaperStep
        var copies = templateDrugs.ToDictionary(d => d.Id, d => new Drug
        {
            Name = d.Name,
            ActiveIngredients = d.ActiveIngredients,
            Description = d.Description,
            DefaultDosing = Copy(d.DefaultDosing),
            CategoryId = d.CategoryId,
            SubCategoryId = d.SubCategoryId,
        });
        if (copies.Count > 0)
        {
            db.Drugs.AddRange(copies.Values);
            await db.SaveChangesAsync(cancellationToken);
        }

        // Copied even when the template has no own drug (its lines may all be shared drugs)
        var templateProtocols = await db.Protocols.IgnoreQueryFilters().AsNoTracking()
            .Where(g => g.ClinicId == templateId)
            .Include(g => g.Items)
            .OrderBy(g => g.Id)
            .ToListAsync(cancellationToken);
        if (templateProtocols.Count == 0)
            return;

        var lineDrugIds = templateProtocols.SelectMany(g => g.Items).Select(i => i.DrugId).Distinct().ToList();
        var sharedIds = (await db.Drugs.IgnoreQueryFilters().AsNoTracking()
                .Where(d => d.ClinicId == null && lineDrugIds.Contains(d.Id))
                .Select(d => d.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        db.Protocols.AddRange(templateProtocols.Select(g => new Protocol
        {
            Name = g.Name,
            Items = g.Items.OrderBy(i => i.Order).ThenBy(i => i.Id).Select(i => new ProtocolItem
            {
                DrugId = LineDrugId(i.DrugId, copies, sharedIds),
                Order = i.Order,
                Dosing = Copy(i.Dosing),
            }).ToList(),
        }));
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// A shared drug's id as is, a template own drug's copy; anything else (only in the accepted race: a drug and a
    /// protocol using it saved in the template between the two reads) → <see cref="KeyNotFoundException"/>: a 500,
    /// rolled back, better than a protocol missing a line.
    /// </summary>
    private static int LineDrugId(int drugId, Dictionary<int, Drug> copies, HashSet<int> sharedIds)
    {
        if (sharedIds.Contains(drugId))
            return drugId;
        return copies.TryGetValue(drugId, out var copy)
            ? copy.Id
            : throw new KeyNotFoundException($"Template protocol line on drug {drugId}, neither shared nor the template's.");
    }

    /// <summary>A new instance (an owned value can't be shared between two rows), its steps too.</summary>
    private static Dosing Copy(Dosing dosing) => dosing is null
        ? null
        : new Dosing
        {
            DoseAmount = dosing.DoseAmount,
            DoseUnit = dosing.DoseUnit,
            Frequency = dosing.Frequency,
            FrequencyValue = dosing.FrequencyValue,
            FrequencyText = dosing.FrequencyText,
            DurationValue = dosing.DurationValue,
            DurationUnit = dosing.DurationUnit,
            Eye = dosing.Eye,
            TaperSteps = dosing.TaperSteps?.Select(s => new TaperStep
            {
                DoseAmount = s.DoseAmount,
                Frequency = s.Frequency,
                FrequencyValue = s.FrequencyValue,
                DurationValue = s.DurationValue,
                DurationUnit = s.DurationUnit,
            }).ToList(),
        };
}
