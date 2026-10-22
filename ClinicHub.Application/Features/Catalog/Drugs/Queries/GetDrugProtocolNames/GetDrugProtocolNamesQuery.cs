using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugProtocolNames;

/// <summary>Names of the protocols that contain the drug, by name (shown before deleting it). Empty for an unknown drug.</summary>
public record GetDrugProtocolNamesQuery(int DrugId) : IQuery<List<string>>;
