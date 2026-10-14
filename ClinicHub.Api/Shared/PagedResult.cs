namespace ClinicHub.Api.Shared;

public record PagedResult<T>(List<T> Items, int TotalCount, int Page, int PageSize);
