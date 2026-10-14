using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;

internal sealed class RenameClinicCommandValidator : AbstractValidator<RenameClinicCommand>
{
    public RenameClinicCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
    }
}
