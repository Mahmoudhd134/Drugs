using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Common;
using FluentValidation;

namespace ClinicHub.Application.Common.Validation;

public static class ValidationExtensions
{
    /// <summary>
    /// Ends every rule: <c>.WithErrorCode(error.Code)</c> plus its description, so the
    /// <c>ValidationBehavior</c> returns exactly that <see cref="Error"/> (with the property as its field).
    /// </summary>
    public static IRuleBuilderOptions<T, TProperty> WithError<T, TProperty>(
        this IRuleBuilderOptions<T, TProperty> rule, Error error) =>
        rule.WithErrorCode(error.Code).WithMessage(error.Description);

    /// <summary>Not blank, and at most <see cref="FieldLimits.NameMaxLength"/> characters once trimmed.</summary>
    public static IRuleBuilderOptions<T, string> ValidName<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .Must(name => !string.IsNullOrWhiteSpace(name)).WithError(CommonErrors.NameRequired)
            .Must(name => name is null || name.Trim().Length <= FieldLimits.NameMaxLength).WithError(CommonErrors.NameTooLong);
}
