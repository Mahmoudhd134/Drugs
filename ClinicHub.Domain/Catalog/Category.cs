using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Catalog;

/// <summary>
/// A drug category, shared by the platform (not clinic-owned; design M1.7 D5): written only by the super admin's
/// handlers, read by every clinic. The imported ones have fixed ids 1–23 (<c>CategoryIds</c>).
/// </summary>
public class Category : IHasTimestamps
{
    public int Id { get; set; }
    public string NameEn { get; set; }
    public string NameAr { get; set; }
    public List<SubCategory> SubCategories { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// A subcategory of one category (imported ids 1–182). It never moves to another category: <see cref="CategoryId"/> is
/// part of the alternate key <c>(Id, CategoryId)</c> the drugs' composite FK targets.
/// </summary>
public class SubCategory : IHasTimestamps
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public string NameEn { get; set; }
    public string NameAr { get; set; }
    public Category Category { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
