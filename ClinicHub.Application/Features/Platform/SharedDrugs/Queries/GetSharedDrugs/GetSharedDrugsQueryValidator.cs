using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Catalog.Drugs;
using FluentValidation;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrugs;

/// <summary>Like the clinic list's (design M1.7 D8): an unknown <c>status</c>, a malformed <c>subCategoryId</c> or one without <c>categoryId</c> → 400 <c>invalidRequest</c>.</summary>
internal sealed class GetSharedDrugsQueryValidator : AbstractValidator<GetSharedDrugsQuery>
{
    public GetSharedDrugsQueryValidator()
    {
        RuleFor(x => x.Status).Must(SharedDrugStatus.IsValid).WithError(CommonErrors.InvalidRequest);
        RuleFor(x => x.SubCategoryId)
            .Must(SubCategoryFilter.IsValid).WithError(CommonErrors.InvalidRequest)
            .DependentRules(() => RuleFor(x => x.SubCategoryId)
                .Must((query, subCategoryId) => string.IsNullOrEmpty(subCategoryId) || query.CategoryId is not null)
                .WithError(CommonErrors.InvalidRequest));
    }
}
