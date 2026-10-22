using ClinicHub.Application.Common.Search;
using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Common;
using ClinicHub.Infrastructure.Database.Configurations.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicHub.Infrastructure.Database;

/// <summary>
/// Before every save: stamps new <see cref="IClinicOwned"/> rows with the current clinic, and throws
/// if a row is added, changed or deleted with no clinic in context or in another clinic. Guards
/// <see cref="IClinicOrShared"/> rows (shared drugs) with the table of design M1.7 D2 (<see cref="GuardClinicOrShared"/>).
/// Fills the search columns (design M1.7 D7, <see cref="SearchNameConfiguration"/>) from their source text. Fills
/// <see cref="IHasTimestamps"/> in UTC from <see cref="TimeProvider"/>, the clock the use cases compare those stamps
/// with (a change to an owned value counts as a change to its owner).
/// </summary>
public class ClinicAndTimestampsInterceptor(TimeProvider clock) : SaveChangesInterceptor
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

    private void Apply(DbContext context)
    {
        if (context is not AppDbContext db)
            return;

        var now = clock.GetUtcNow().UtcDateTime;
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

                // A key part (composite FKs) of a new row may hold an EF temporary value instead of 0;
                // set through the entry so EF propagates it to dependents
                var clinicIdProperty = entry.Property(nameof(IClinicOwned.ClinicId));
                if (entry.State == EntityState.Added && (owned.ClinicId == 0 || clinicIdProperty.IsTemporary))
                    clinicIdProperty.CurrentValue = clinicId;
                // The original value too, so a row can't be moved from another clinic into this one
                else if (owned.ClinicId != clinicId || (entry.State != EntityState.Added
                         && (int)entry.Property(nameof(IClinicOwned.ClinicId)).OriginalValue != clinicId))
                    throw new InvalidOperationException(
                        $"Cannot save {entry.Metadata.ClrType.Name} of clinic {owned.ClinicId} in clinic {clinicId}.");
            }

            if (entry.Entity is IClinicOrShared)
                GuardClinicOrShared(db, entry, touched);

            if (touched && entry.State is EntityState.Added or EntityState.Modified)
                FillSearchColumns(entry);

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
    /// The D2 table for a row that may be a clinic's own or shared (<c>ClinicId</c> null): in a clinic, a new row without
    /// a clinic is stamped with it and own rows follow the <see cref="IClinicOwned"/> rule, while a shared row is
    /// read-only; with no clinic, only shared rows can be added or modified, and only inside
    /// <c>IClinicScope.UseSharedCatalog()</c>. A shared row is never deleted and no row changes owner. A
    /// <see cref="Drug"/> added or modified must not be a shared row with a default dosing or an own row marked withdrawn.
    /// </summary>
    private static void GuardClinicOrShared(AppDbContext db, EntityEntry entry, bool touched)
    {
        var name = entry.Metadata.ClrType.Name;
        var clinicIdProperty = entry.Property(nameof(IClinicOrShared.ClinicId));
        var current = clinicIdProperty.IsTemporary ? null : (int?)clinicIdProperty.CurrentValue;
        if (current == 0)
            current = null;

        if (entry.State == EntityState.Added)
        {
            if (current == null)
            {
                if (db.ClinicId is { } clinicId)
                    clinicIdProperty.CurrentValue = current = clinicId;
                else if (db.IsWritingSharedCatalog)
                    clinicIdProperty.CurrentValue = null;
                else
                    throw new InvalidOperationException(
                        $"Cannot add a shared {name} outside the shared catalog use cases: no clinic in context.");
            }
            else if (db.ClinicId != current)
                throw new InvalidOperationException(
                    $"Cannot save {name} of clinic {current} in clinic {db.ClinicId?.ToString() ?? "(none)"}.");
        }
        else
        {
            var original = (int?)clinicIdProperty.OriginalValue;
            if (original == 0)
                original = null;
            if (original != current)
                throw new InvalidOperationException(
                    $"Cannot move {name} {entry.Property("Id").CurrentValue} from clinic {original?.ToString() ?? "(shared)"} to {current?.ToString() ?? "(shared)"}.");

            if (current != null)
            {
                if (db.ClinicId != current)
                    throw new InvalidOperationException(
                        $"Cannot save {name} of clinic {current} in clinic {db.ClinicId?.ToString() ?? "(none)"}.");
            }
            else if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException($"Cannot delete a shared {name}: shared rows are withdrawn, never deleted.");
            else if (db.ClinicId is { } clinicId)
                throw new InvalidOperationException($"Cannot change a shared {name} in clinic {clinicId}: shared rows are read-only.");
            else if (!db.IsWritingSharedCatalog)
                throw new InvalidOperationException(
                    $"Cannot change a shared {name} outside the shared catalog use cases.");
        }

        if (touched && entry.State != EntityState.Deleted && entry.Entity is Drug drug)
        {
            if (current == null && HasValue(entry.Reference(nameof(Drug.DefaultDosing)).TargetEntry))
                throw new InvalidOperationException($"Cannot save shared drug {drug.Id} with a default dosing.");
            if (current != null && drug.IsWithdrawn)
                throw new InvalidOperationException($"Cannot save drug {drug.Id} of clinic {current} as withdrawn: only shared drugs are.");
        }
    }

    /// <summary>An owned value with any column set (its key columns aside); a removed one counts as none.</summary>
    private static bool HasValue(EntityEntry owned) =>
        owned is { State: not EntityState.Deleted and not EntityState.Detached }
        && owned.Properties.Any(p => !p.Metadata.IsKey() && !p.Metadata.IsForeignKey() && p.CurrentValue != null);

    /// <summary>
    /// Sets each search column of an added row, or of a modified row whose source text changed, from its sources (design
    /// M1.7 D7): <see cref="SearchText.Column"/> = <see cref="SearchText.Fold"/>, <see cref="SearchText.OtherColumn"/> =
    /// <see cref="SearchText.OtherText"/>. A modified row whose sources didn't change keeps the stored value.
    /// </summary>
    private static void FillSearchColumns(EntityEntry entry)
    {
        foreach (var column in entry.Metadata.GetProperties())
        {
            var sources = SearchNameConfiguration.SourcesOf(column);
            if (sources.Count == 0)
                continue;

            var search = entry.Property(column.Name);
            if (entry.State == EntityState.Modified && !sources.Any(s => entry.Property(s).IsModified))
            {
                // Never written from a stale or default value (e.g. a whole row attached with Update)
                search.IsModified = false;
                continue;
            }

            var texts = sources.Select(s => (string)entry.Property(s).CurrentValue).ToList();
            search.CurrentValue = column.Name == SearchText.OtherColumn
                ? SearchText.OtherText(texts[0], texts[1])
                : SearchText.Fold(texts[0] ?? "");
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
