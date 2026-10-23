using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrug;

/// <summary>One shared drug (withdrawn included); an own drug's id → 404 <c>notFound</c>.</summary>
public record GetSharedDrugQuery(int Id) : IQuery<AdminDrugDto>;
