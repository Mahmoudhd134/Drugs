using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;

/// <summary>
/// The string-bound filters (design M1.7 D8): an unknown <c>source</c>, a malformed <c>subCategoryId</c>, or a
/// <c>subCategoryId</c> without <c>categoryId</c> → 400 <c>invalidRequest</c> on that field. Unknown ids are not
/// errors (an empty page).
/// </summary>
internal sealed class GetDrugsQueryValidator : AbstractValidator<GetDrugsQuery>
{
    public GetDrugsQueryValidator()
    {
        RuleFor(x => x.Source).Must(DrugSource.IsValid).WithError(CommonErrors.InvalidRequest);
        RuleFor(x => x.SubCategoryId)
            .Must(SubCategoryFilter.IsValid).WithError(CommonErrors.InvalidRequest)
            .DependentRules(() => RuleFor(x => x.SubCategoryId)
                .Must((query, subCategoryId) => string.IsNullOrEmpty(subCategoryId) || query.CategoryId is not null)
                .WithError(CommonErrors.InvalidRequest));
    }
}
