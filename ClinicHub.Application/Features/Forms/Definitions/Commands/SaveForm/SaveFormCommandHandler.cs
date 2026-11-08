using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;

/// <summary><b>Stub (feature 1, T1).</b></summary>
internal sealed class SaveFormCommandHandler : ICommandHandler<SaveFormCommand, FormDetails>
{
    public Task<Result<FormDetails>> Handle(SaveFormCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Dynamic forms feature 1, T1");
}
