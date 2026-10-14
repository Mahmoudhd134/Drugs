using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugGroupNames;

/// <summary>Names of the groups that contain the drug, by name (shown before deleting it). Empty for an unknown drug.</summary>
public record GetDrugGroupNamesQuery(int DrugId) : IQuery<List<string>>;
