using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity;

internal static class PhoneValidation
{
    /// <summary>A number <see cref="PhoneNormalizer"/> accepts (local numbers in <paramref name="defaultRegion"/>), else <c>invalidPhone</c>.</summary>
    public static IRuleBuilderOptions<T, string> ValidPhone<T>(this IRuleBuilder<T, string> rule, string defaultRegion) =>
        rule.Must(phone => PhoneNormalizer.Normalize(phone, defaultRegion) is not null).WithError(IdentityErrors.InvalidPhone);
}
