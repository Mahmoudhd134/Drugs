using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols;

/// <summary>
/// A drug in a protocol with the protocol's dosing override. Empty override fields mean
/// "use the drug's default"; the eye may be "ask" (chosen when the protocol is added).
/// </summary>
public record ProtocolItemDto(DrugDto Drug, Dosing Dosing);

/// <summary>A protocol with its items in order.</summary>
public record ProtocolDto(int Id, string Name, List<ProtocolItemDto> Items);

public static class ProtocolMappings
{
    /// <summary>Needs the items and their drugs loaded (<see cref="WithItems"/>).</summary>
    public static ProtocolDto ToDto(this Protocol protocol) => new(
        protocol.Id,
        protocol.Name,
        protocol.Items
            .OrderBy(x => x.Order)
            .Select(x => new ProtocolItemDto(x.Drug.ToDto(), x.Dosing))
            .ToList());

    /// <summary>Loads each protocol's items and their drugs, as <see cref="ToDto"/> needs.</summary>
    public static IQueryable<Protocol> WithItems(this IQueryable<Protocol> query) =>
        query.Include(g => g.Items).ThenInclude(i => i.Drug);
}
