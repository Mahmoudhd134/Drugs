using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;

/// <summary><b>Stub (feature 1, T1).</b></summary>
internal sealed class CreateFormCommandHandler : ICommandHandler<CreateFormCommand, FormDetails>
{
    public Task<Result<FormDetails>> Handle(CreateFormCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Dynamic forms feature 1, T1");
}
