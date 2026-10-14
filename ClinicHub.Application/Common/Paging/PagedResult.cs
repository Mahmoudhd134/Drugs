namespace ClinicHub.Application.Common.Paging;

/// <summary>One page of a list. <see cref="Page"/> is 1-based.</summary>
public record PagedResult<T>(List<T> Items, int TotalCount, int Page, int PageSize);

public static class Paging
{
    public const int MaxPageSize = 100;

    /// <summary>
    /// Page size 1–<see cref="MaxPageSize"/>; page at least 1 and small enough that its offset
    /// (<c>(page - 1) * pageSize</c>) fits in an int.
    /// </summary>
    public static (int Page, int PageSize) Normalize(int page, int pageSize)
    {
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        return (Math.Clamp(page, 1, int.MaxValue / pageSize), pageSize);
    }
}
