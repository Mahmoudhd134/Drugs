using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Drags.Api.Database;

/// <summary>
/// Before every save: stamps new <see cref="IClinicOwned"/> rows with the current clinic, and throws
/// if a row is added, changed or deleted with no clinic in context or in another clinic. Fills
/// <see cref="IHasTimestamps"/> in UTC (a change to an owned value counts as a change to its owner).
/// </summary>
public class ClinicAndTimestampsInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Apply(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
        InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Apply(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private static void Apply(DbContext context)
    {
        if (context is not AppDbContext db)
            return;

        var now = DateTime.UtcNow;
        var entries = db.ChangeTracker.Entries().ToList();
        var ownersOfChangedValues = FindOwnersOfChangedOwnedValues(entries);

        foreach (var entry in entries)
        {
            var touched = entry.State is EntityState.Added or EntityState.Modified
                          || (entry.State == EntityState.Unchanged && ownersOfChangedValues.Contains(entry));
            if (!touched && entry.State != EntityState.Deleted)
                continue;

            if (entry.Entity is IClinicOwned owned)
            {
                var clinicId = db.ClinicId ?? throw new InvalidOperationException(
                    $"Cannot save {entry.Metadata.ClrType.Name}: no clinic in context.");

                if (entry.State == EntityState.Added && owned.ClinicId == 0)
                    owned.ClinicId = clinicId;
                // The original value too, so a row can't be moved from another clinic into this one
                else if (owned.ClinicId != clinicId || (entry.State != EntityState.Added
                         && (int)entry.Property(nameof(IClinicOwned.ClinicId)).OriginalValue != clinicId))
                    throw new InvalidOperationException(
                        $"Cannot save {entry.Metadata.ClrType.Name} of clinic {owned.ClinicId} in clinic {clinicId}.");
            }

            if (touched && entry.Entity is IHasTimestamps)
            {
                if (entry.State == EntityState.Added)
                    entry.Property(nameof(IHasTimestamps.CreatedAt)).CurrentValue = now;
                else
                    entry.Property(nameof(IHasTimestamps.CreatedAt)).IsModified = false;
                entry.Property(nameof(IHasTimestamps.UpdatedAt)).CurrentValue = now;
            }
        }
    }

    /// <summary>
    /// Owners whose owned value (e.g. a drug's DefaultDosing) was added, changed or removed: the owner
    /// row itself may be Unchanged, but its data changed, so its UpdatedAt must move too.
    /// </summary>
    private static HashSet<EntityEntry> FindOwnersOfChangedOwnedValues(List<EntityEntry> entries)
    {
        var owners = new HashSet<EntityEntry>();
        var changedOwned = entries.Where(e => e.Metadata.IsOwned() && e.State is
            EntityState.Added or EntityState.Modified or EntityState.Deleted).ToList();
        if (changedOwned.Count == 0)
            return owners;

        // Only Unchanged owners need it (Added/Modified ones are stamped anyway); one lookup by key
        var unchangedByKey = entries
            .Where(e => e.State == EntityState.Unchanged && !e.Metadata.IsOwned())
            .ToDictionary(e => (e.Metadata, KeyOf(e, e.Metadata.FindPrimaryKey().Properties)));

        foreach (var entry in changedOwned)
        {
            var ownership = entry.Metadata.FindOwnership();
            if (unchangedByKey.TryGetValue((ownership.PrincipalEntityType, KeyOf(entry, ownership.Properties)), out var owner))
                owners.Add(owner);
        }
        return owners;
    }

    private static string KeyOf(EntityEntry entry, IEnumerable<IReadOnlyProperty> properties) =>
        string.Join("|", properties.Select(p => entry.Property(p.Name).CurrentValue));
}
