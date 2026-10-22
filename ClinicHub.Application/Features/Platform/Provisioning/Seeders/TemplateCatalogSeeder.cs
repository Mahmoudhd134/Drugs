using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Provisioning.Seeders;

/// <summary>
/// Step 30: a copy of the template clinic's drugs, then of its protocols, their items pointing to the copied drugs.
/// The template is read across clinics (<c>IgnoreQueryFilters()</c>, read only: Platform code); the copies are
/// new rows of the current clinic, so later template edits don't change this clinic. In memory: fine for
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

        var templateDrugs = await db.Drugs.IgnoreQueryFilters().AsNoTracking()
            .Where(d => d.ClinicId == templateId)
            .OrderBy(d => d.Id)
            .ToListAsync(cancellationToken);
        if (templateDrugs.Count == 0)
            return;

        // Template drug id → its copy (whose id is known once saved). Hand-written copies (here, the protocols'
        // and Copy below): keep them in sync with Drug, Protocol, ProtocolItem, Dosing and TaperStep
        var copies = templateDrugs.ToDictionary(d => d.Id, d => new Drug
        {
            Name = d.Name,
            Description = d.Description,
            DefaultDosing = Copy(d.DefaultDosing),
        });
        db.Drugs.AddRange(copies.Values);
        await db.SaveChangesAsync(cancellationToken);

        var templateProtocols = await db.Protocols.IgnoreQueryFilters().AsNoTracking()
            .Where(g => g.ClinicId == templateId)
            .Include(g => g.Items)
            .OrderBy(g => g.Id)
            .ToListAsync(cancellationToken);
        if (templateProtocols.Count == 0)
            return;

        db.Protocols.AddRange(templateProtocols.Select(g => new Protocol
        {
            Name = g.Name,
            Items = g.Items.OrderBy(i => i.Order).ThenBy(i => i.Id).Select(i => new ProtocolItem
            {
                // The composite FKs keep a template item on a template drug, so every item has a copy, except in
                // the accepted race (a drug and a protocol using it saved in the template between the two reads):
                // KeyNotFound → 500, rolled back, better than a protocol missing a line
                DrugId = copies[i.DrugId].Id,
                Order = i.Order,
                Dosing = Copy(i.Dosing),
            }).ToList(),
        }));
        await db.SaveChangesAsync(cancellationToken);
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
