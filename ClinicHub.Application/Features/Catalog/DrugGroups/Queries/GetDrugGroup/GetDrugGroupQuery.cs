using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroup;

public record GetDrugGroupQuery(int Id) : IQuery<DrugGroupDto>;
