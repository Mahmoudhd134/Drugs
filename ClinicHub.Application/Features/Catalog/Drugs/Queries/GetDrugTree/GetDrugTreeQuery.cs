using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;

/// <summary>
/// The drug tree's counts (design M1.7 D7, D8): the clinic's listed drugs (<see cref="DrugQueries.ListedAsync"/> with
/// no category filter) counted per category and subcategory.
/// </summary>
/// <param name="Source">See <see cref="DrugSource"/>.</param>
public record GetDrugTreeQuery(string Search, string Source) : IQuery<DrugTreeDto>;
