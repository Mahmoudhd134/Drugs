using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrug;

public record GetDrugQuery(int Id) : IQuery<DrugDto>;
