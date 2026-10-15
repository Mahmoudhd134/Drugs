using System.Globalization;
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

    /// <summary>
    /// Not blank (only spaces or invisible format characters such as a zero-width space count as blank), no
    /// control characters nor line/paragraph separators once trimmed (a NUL can't be stored; a line break would
    /// end up in the Word copy), and at most <paramref name="maxLength"/> characters once trimmed (the column's limit:
    /// <see cref="FieldLimits.NameMaxLength"/> by default, <see cref="FieldLimits.RoleNameMaxLength"/> for roles).
    /// </summary>
    public static IRuleBuilderOptions<T, string> ValidName<T>(this IRuleBuilder<T, string> rule,
        int maxLength = FieldLimits.NameMaxLength) =>
        rule
            .Must(name => !IsBlank(name)).WithError(CommonErrors.NameRequired)
            .Must(name => IsBlank(name) || !name.Trim().Any(IsLineOrControl)).WithError(CommonErrors.NameInvalid)
            .Must(name => name is null || name.Trim().Length <= maxLength).WithError(CommonErrors.NameTooLong);

    /// <summary>Optional free text (e.g. a drug's description): no NUL (it can't be stored); line breaks and tabs are
    /// fine.</summary>
    public static IRuleBuilderOptions<T, string> ValidText<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(text => text is null || !text.Contains('\0')).WithError(CommonErrors.InvalidText);

    private static bool IsBlank(string name) =>
        name is null || name.All(c => char.IsWhiteSpace(c) || char.GetUnicodeCategory(c) == UnicodeCategory.Format);

    private static bool IsLineOrControl(char c) =>
        char.IsControl(c) || char.GetUnicodeCategory(c) is UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator;
}
