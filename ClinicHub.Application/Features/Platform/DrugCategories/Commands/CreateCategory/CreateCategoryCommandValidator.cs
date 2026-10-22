using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Common;
using FluentValidation;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateCategory;

/// <summary>Both names required, <c>ValidName(100)</c> (design M1.7 D5): <c>nameEn</c>, then <c>nameAr</c>.</summary>
internal sealed class CreateCategoryCommandValidator : AbstractValidator<CreateCategoryCommand>
{
    public CreateCategoryCommandValidator()
    {
        RuleFor(x => x.NameEn).ValidName(FieldLimits.CategoryNameMaxLength);
        RuleFor(x => x.NameAr).ValidName(FieldLimits.CategoryNameMaxLength);
    }
}
