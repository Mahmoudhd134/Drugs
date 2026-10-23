using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols;

/// <summary>
/// The drug checks of a protocol save, after the validator (design M1.7 D4, D6, § 7): <c>drugNotFound</c> (each line's
/// drug looked up through the clinic filter: shared or this clinic's) → <c>drugWithdrawn</c> → <c>duplicateProtocolItem</c>.
/// The caller then answers 404 for an unknown protocol.
/// </summary>
internal static class ProtocolLineRules
{
    /// <param name="requestItems">The items as sent (nulls included), for the request index of <c>drugWithdrawn</c>.</param>
    /// <param name="items">The same, normalized (<see cref="SaveProtocolItem.Normalize"/>).</param>
    /// <param name="protocolId">The saved protocol (null when creating): its stored lines of a withdrawn drug may stay.</param>
    public static async Task<Error> CheckAsync(IAppDbContext db, List<SaveProtocolItem> requestItems,
        List<SaveProtocolItem> items, int? protocolId, CancellationToken cancellationToken)
    {
        var drugIds = items.Select(x => x.DrugId).Distinct().ToList();
        var drugs = await db.Drugs.AsNoTracking()
            .Where(d => drugIds.Contains(d.Id))
            .Select(d => new { d.Id, d.DefaultDosing.Eye, d.IsWithdrawn })
            .ToListAsync(cancellationToken);
        if (drugs.Count != drugIds.Count)
            return ProtocolErrors.DrugNotFound;

        var withdrawn = drugs.Where(d => d.IsWithdrawn).Select(d => d.Id).ToList();
        if (withdrawn.Count > 0)
        {
            // Lines stored per withdrawn drug in this protocol (none for a new, unknown or another clinic's protocol);
            // a withdrawn drug's lines pass while their number in the request stays within it (any eye or dosing)
            Dictionary<int, int> stored = protocolId is null
                ? []
                : await db.ProtocolItems.AsNoTracking()
                    .Where(i => i.ProtocolId == protocolId && withdrawn.Contains(i.DrugId))
                    .GroupBy(i => i.DrugId)
                    .Select(g => new { DrugId = g.Key, Count = g.Count() })
                    .ToDictionaryAsync(g => g.DrugId, g => g.Count, cancellationToken);

            var seen = new Dictionary<int, int>();
            var requestIndexes = SaveProtocolItem.RequestIndexes(requestItems);
            for (var i = 0; i < items.Count; i++)
            {
                var drugId = items[i].DrugId;
                if (!withdrawn.Contains(drugId))
                    continue;
                seen[drugId] = seen.GetValueOrDefault(drugId) + 1;
                if (seen[drugId] > stored.GetValueOrDefault(drugId))
                    return ProtocolErrors.DrugWithdrawnAt(requestIndexes[i]);
            }
        }

        var defaultEyes = drugs.ToDictionary(d => d.Id, d => d.Eye);
        return SaveProtocolItem.HasDuplicate(items, defaultEyes) ? ProtocolErrors.DuplicateItem : null;
    }
}
