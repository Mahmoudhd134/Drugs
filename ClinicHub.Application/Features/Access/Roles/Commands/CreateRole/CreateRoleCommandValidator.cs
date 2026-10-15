using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Domain.Common;
using FluentValidation;

namespace ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;

/// <summary>
/// In the order the errors are reported: name (the role column's limit), then permissions. A missing list is
/// <c>invalidRequest</c> (not "no permissions"), so a client that forgets it can't empty a role by accident.
/// </summary>
internal sealed class CreateRoleCommandValidator : AbstractValidator<CreateRoleCommand>
{
    public CreateRoleCommandValidator()
    {
        RuleFor(x => x.Name).ValidName(FieldLimits.RoleNameMaxLength);
        RuleFor(x => x.Permissions).NotNull().WithError(CommonErrors.InvalidRequest);
        // One error for the whole list (not one per key), so a huge list of bad keys gives a small answer
        RuleFor(x => x.Permissions)
            .Must(keys => keys.All(PermissionCatalog.IsKnown)).When(x => x.Permissions is not null)
            .WithError(RoleErrors.UnknownPermission);
    }
}
