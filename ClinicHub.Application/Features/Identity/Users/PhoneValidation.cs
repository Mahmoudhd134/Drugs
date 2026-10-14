using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity.Users;

internal static class PhoneValidation
{
    /// <summary>A number <paramref name="normalizer"/> accepts (local numbers in <paramref name="defaultRegion"/>), else <c>invalidPhone</c>.</summary>
    public static IRuleBuilderOptions<T, string> ValidPhone<T>(this IRuleBuilder<T, string> rule, IPhoneNormalizer normalizer,
        string defaultRegion) =>
        rule.Must(phone => normalizer.Normalize(phone, defaultRegion) is not null).WithError(IdentityErrors.InvalidPhone);
}
