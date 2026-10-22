using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;

/// <summary>An unknown <c>source</c> → 400 <c>invalidRequest</c> (field <c>source</c>), as <c>GET /drugs</c> (D8).</summary>
internal sealed class GetDrugTreeQueryValidator : AbstractValidator<GetDrugTreeQuery>
{
    public GetDrugTreeQueryValidator()
    {
        RuleFor(x => x.Source).Must(DrugSource.IsValid).WithError(CommonErrors.InvalidRequest);
    }
}
