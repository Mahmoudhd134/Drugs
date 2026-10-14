using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Application.Features.Platform.Provisioning;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;

internal sealed class CreateClinicCommandHandler(
    IClinicProvisioner provisioner,
    IPhoneNormalizer phoneNormalizer,
    PlatformSettings platform) : ICommandHandler<CreateClinicCommand, ClinicDetails>
{
    public async Task<Result<ClinicDetails>> Handle(CreateClinicCommand command, CancellationToken cancellationToken)
    {
        // Valid: checked by the validator
        var phone = phoneNormalizer.Normalize(command.Owner.Phone, platform.DefaultRegion);
        return await provisioner.ProvisionAsync(command.Name.Trim(), phone, command.Owner.FullName.Trim(),
            cancellationToken);
    }
}
