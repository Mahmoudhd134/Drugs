using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroups;

/// <summary>A page of groups by name, each with its items.</summary>
public record GetDrugGroupsQuery(string Search, int Page, int PageSize) : IQuery<PagedResult<DrugGroupDto>>;
