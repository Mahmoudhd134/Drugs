using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Catalog;

/// <summary>
/// A drug: a clinic's own (<see cref="ClinicId"/> set) or a shared drug of the platform catalog (null; design M1.7 D1,
/// D3). Shared drugs have no default dosing and are withdrawn instead of deleted; own drugs are never withdrawn (the
/// save interceptor refuses both, D2).
/// </summary>
public class Drug : IClinicOrShared, IHasTimestamps
{
    public int Id { get; set; }
    /// <summary>Null = shared (platform catalog); never changes once saved (interceptor).</summary>
    public int? ClinicId { get; set; }
    /// <summary>The only name ever shown (a shared drug's full English name; an own drug's as typed).</summary>
    public string Name { get; set; }
    /// <summary>
    /// Internal, search only (D3): the imported shared drug's Arabic name, written only by the load script; null for own
    /// drugs and admin-created ones. Never in a DTO, a request or a screen; an admin rename clears it.
    /// </summary>
    public string NameAr { get; set; }
    /// <summary>One line, optional (null when blank).</summary>
    public string ActiveIngredients { get; set; }
    public string Description { get; set; }
    /// <summary>Dosing used when the drug is added to a prescription (null = none; always null on a shared drug).</summary>
    public Dosing DefaultDosing { get; set; }
    /// <summary>Required.</summary>
    public int CategoryId { get; set; }
    /// <summary>Optional; when set, a subcategory of <see cref="CategoryId"/> (composite FK).</summary>
    public int? SubCategoryId { get; set; }
    /// <summary>Shared drugs only (D6): hidden from lists, search and the tree, kept in protocols.</summary>
    public bool IsWithdrawn { get; private set; }
    /// <summary>When it was withdrawn (UTC); null while active.</summary>
    public DateTime? WithdrawnAt { get; private set; }
    public Category Category { get; set; }
    public SubCategory SubCategory { get; set; }
    public List<ProtocolItem> ProtocolItems { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>Withdraws the drug; a second call keeps the first time (idempotent).</summary>
    public void Withdraw(DateTime at)
    {
        if (IsWithdrawn)
            return;
        IsWithdrawn = true;
        WithdrawnAt = at;
    }

    /// <summary>Back in lists and search (idempotent); a later withdraw sets a new time.</summary>
    public void Restore()
    {
        IsWithdrawn = false;
        WithdrawnAt = null;
    }
}
